// ทดสอบ logic หลักบน DB จริงแบบยิงพร้อมกัน (docs/tech-design.md ข้อ 10)
// ใช้:  npm run loadtest            (อ่าน DATABASE_URL จาก .env.local)
//      npm run loadtest -- --keep  (ไม่ล้างข้อมูลหลังทดสอบ)
// รันได้เฉพาะตอนตาราง players ว่าง เล่นเกมจำลองจนถึงประกาศผล แล้วล้างข้อมูลให้เองเมื่อจบ

process.env.PG_POOL_MAX ??= "20";

const PLAYERS = 50;
const keep = process.argv.includes("--keep");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const { getPool } = await import("../lib/db");
  const { registerPlayer, switchTeam } = await import("../lib/players");
  const { adminMove, gameAction, getOverview, resetGame } = await import("../lib/admin");
  const { reveal } = await import("../lib/results");
  const pool = getPool();

  const before = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM players");
  if (before.rows[0].n > 0) {
    console.error(`ยกเลิก: ตาราง players มีข้อมูลอยู่ ${before.rows[0].n} แถว รันได้เฉพาะตอนว่าง`);
    process.exitCode = 1;
    await pool.end();
    return;
  }

  const failures: string[] = [];
  const check = (ok: boolean, message: string) => {
    console.log(`${ok ? "ผ่าน" : "ไม่ผ่าน"}  ${message}`);
    if (!ok) failures.push(message);
  };

  // ---------- 1. ลงทะเบียนพร้อมกัน ----------
  console.log("\n[1] ลงทะเบียนพร้อมกัน");
  // ผู้เล่นแต่ละคนยิงสองครั้งพร้อมกัน (จำลองเปิดลิงก์ซ้อน) รวม 100 request ต้องได้ 50 คนพอดี
  const started = Date.now();
  const results = await Promise.allSettled(
    Array.from({ length: PLAYERS * 2 }, (_, i) => {
      const n = (i % PLAYERS) + 1;
      return registerPlayer({ lineUserId: `loadtest:${n}`, displayName: `ทดสอบ ${n}` });
    }),
  );
  const elapsed = Date.now() - started;

  const rejected = results.filter((r) => r.status === "rejected");
  check(rejected.length === 0, `ทุก request สำเร็จ (ล้มเหลว ${rejected.length})`);
  if (rejected[0]?.status === "rejected") console.error(rejected[0].reason);

  const players = await pool.query<{ id: string; seq: number; team: string | null }>(
    "SELECT id, seq, team FROM players ORDER BY seq",
  );
  const count = (team: string | null) => players.rows.filter((r) => r.team === team).length;
  check(players.rowCount === PLAYERS, `ผู้เล่น ${players.rowCount} คน (ต้องได้ ${PLAYERS})`);
  check(players.rows.every((r, i) => r.seq === i + 1), "seq เรียง 1 ถึง 50 ไม่ซ้ำ ไม่มีช่องว่าง");
  check(count("bread") === 5, `ขนมปัง ${count("bread")} คน (ต้องได้ 5)`);
  check(count("fish") === 2, `ปลา ${count("fish")} คน (ต้องได้ 2)`);
  check(count(null) === PLAYERS - 7, `ยังไม่มีทีม ${count(null)} คน (ต้องได้ ${PLAYERS - 7})`);
  check(players.rows.every((r) => (r.seq <= 7) === (r.team !== null)), "คนที่ได้ทีมคือ seq 1 ถึง 7 เท่านั้น");

  const joins = await pool.query<{ n: number; joins: number }>(
    "SELECT count(*)::int AS n, count(*) FILTER (WHERE kind = 'join')::int AS joins FROM team_events",
  );
  check(joins.rows[0].n === PLAYERS && joins.rows[0].joins === PLAYERS, `team_events ${joins.rows[0].n} แถว เป็น join ทั้งหมด`);
  console.log(`    ${PLAYERS * 2} request พร้อมกัน ใช้เวลา ${elapsed} ms`);

  // ---------- 2. เปลี่ยนทีม ----------
  console.log("\n[2] เปลี่ยนทีม");
  const unassigned = players.rows.filter((r) => r.team === null);
  const first = unassigned[0];

  check((await switchTeam(first.id, "fish")) === false, "เกมยังไม่เริ่ม เปลี่ยนทีมไม่ได้");
  const start = await gameAction("start");
  check(start.ok, "เริ่มเกมได้เมื่อขนมปัง 5 ปลา 2");

  // คนเดียวกดรัว 20 ครั้งพร้อมกัน (หรือ retry ตอนเน็ตหลุด) ต้องเปลี่ยนครั้งเดียว
  const burst = await Promise.all(Array.from({ length: 20 }, () => switchTeam(first.id, "fish")));
  check(burst.filter(Boolean).length === 1, `กดพร้อมกัน 20 ครั้ง เปลี่ยนสำเร็จ ${burst.filter(Boolean).length} ครั้ง (ต้องได้ 1)`);
  const firstEvents = await pool.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM team_events WHERE player_id = $1 AND kind = 'switch'",
    [first.id],
  );
  check(firstEvents.rows[0].n === 1, `บันทึก event switch ${firstEvents.rows[0].n} แถว (ต้องได้ 1)`);
  check((await switchTeam(first.id, "bread")) === false, "ติด cooldown 1 ชั่วโมง ย้ายกลับทันทีไม่ได้");

  // คนที่เหลือเปลี่ยนทีมพร้อมกันทั้งหมด
  const rest = unassigned.slice(1);
  const moved = await Promise.all(rest.map((p, i) => switchTeam(p.id, i % 2 ? "bread" : "fish")));
  check(moved.every(Boolean), `อีก ${rest.length} คนเปลี่ยนทีมพร้อมกัน สำเร็จ ${moved.filter(Boolean).length} คน`);

  // ---------- 3. พักเกมและประกาศผล ----------
  console.log("\n[3] พักเกมและประกาศผล");
  // การพักเกมที่ยังไม่ commit ต้องทำให้ switch ที่เข้ามาทีหลังรอ แล้วไม่ผ่านเมื่อพักสำเร็จ
  const seed = players.rows.find((r) => r.team === "bread")!;
  const blocker = await pool.connect();
  await blocker.query("BEGIN");
  await blocker.query("UPDATE game_state SET status = 'paused'");
  let settled = false;
  const waiting = switchTeam(seed.id, "fish").then((result) => {
    settled = true;
    return result;
  });
  await sleep(400);
  check(!settled, "switch รอขณะที่การพักเกมยังไม่ commit");
  await blocker.query("COMMIT");
  blocker.release();
  check((await waiting) === false, "พักเกมสำเร็จแล้ว switch ที่รออยู่ไม่ผ่าน");

  check((await gameAction("resume")).ok, "เล่นต่อได้");
  check((await adminMove(seed.id, null, false)) === true, "admin คืนผู้เล่นเป็นยังไม่มีทีมได้");
  check((await adminMove(seed.id, "bread", false)) === true, "admin ย้ายกลับโดยไม่ติด cooldown ได้");
  check((await switchTeam(seed.id, "fish")) === true, "ผู้เล่นคนนั้นเปลี่ยนทีมต่อได้ทันที");

  const timeline = await reveal();
  const overview = await getOverview();
  check(!!timeline, "ประกาศผลได้");
  if (timeline) {
    const last = timeline.steps[timeline.steps.length - 1];
    check(
      timeline.init.bread === 5 && timeline.init.fish === 2 && timeline.init.none === PLAYERS - 7,
      `timeline เริ่มที่ ${timeline.init.bread} / ${timeline.init.none} / ${timeline.init.fish} (ต้องได้ 5 / 43 / 2)`,
    );
    check(timeline.steps.length === rest.length + 4, `timeline มี ${timeline.steps.length} ขั้น (ต้องได้ ${rest.length + 4})`);
    check(
      last.bread === overview.counts.bread && last.fish === overview.counts.fish && last.none === overview.counts.none,
      `ผลสุดท้ายของ timeline ตรงกับตาราง players (ขนมปัง ${last.bread} ปลา ${last.fish} ยังไม่มีทีม ${last.none})`,
    );
    const again = await reveal();
    check(again?.finishedAt === timeline.finishedAt && again.steps.length === timeline.steps.length, "กดประกาศผลซ้ำได้ timeline เดิม");
  }
  check((await switchTeam(first.id, "bread")) === false, "ประกาศผลแล้ว ผู้เล่นเปลี่ยนทีมไม่ได้");
  check((await adminMove(first.id, "bread", false)) === false, "ประกาศผลแล้ว admin ย้ายทีมไม่ได้");
  check((await gameAction("resume")).ok === false, "ประกาศผลแล้ว เปิดเกมต่อไม่ได้");

  // ---------- จบ ----------
  if (keep) {
    console.log("\nเก็บข้อมูลทดสอบไว้ (--keep) อย่าลืมล้างก่อนใช้จริง");
  } else {
    const reset = await resetGame();
    const after = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM players");
    check(reset.ok && after.rows[0].n === 0, "ล้างข้อมูลทดสอบแล้ว กลับเป็นช่วงลงทะเบียน และสุ่ม assign_seed ใหม่");
  }

  await pool.end();
  if (failures.length) {
    console.error(`\nไม่ผ่าน ${failures.length} ข้อ`);
    process.exitCode = 1;
  } else {
    console.log("\nผ่านทุกข้อ");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
