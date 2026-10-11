// ทดสอบลงทะเบียนพร้อมกันบน DB จริง (docs/tech-design.md ข้อ 10 ขั้น 1)
// ใช้:  npm run loadtest            (อ่าน DATABASE_URL จาก .env.local)
//      npm run loadtest -- --keep  (ไม่ล้างข้อมูลหลังทดสอบ)
// รันได้เฉพาะตอนตาราง players ว่าง และล้างข้อมูลที่สร้างให้เองเมื่อจบ

process.env.PG_POOL_MAX ??= "20";

const PLAYERS = 50;
const keep = process.argv.includes("--keep");

async function main() {
  const { getPool } = await import("../lib/db");
  const { registerPlayer } = await import("../lib/players");
  const pool = getPool();

  const before = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM players");
  if (before.rows[0].n > 0) {
    console.error(`ยกเลิก: ตาราง players มีข้อมูลอยู่ ${before.rows[0].n} แถว รันได้เฉพาะตอนว่าง`);
    process.exitCode = 1;
    await pool.end();
    return;
  }

  // ผู้เล่นแต่ละคนยิงสองครั้งพร้อมกัน (จำลองเปิดลิงก์ซ้อน) รวม 100 request ต้องได้ 50 คนพอดี
  const started = Date.now();
  const calls = Array.from({ length: PLAYERS * 2 }, (_, i) => {
    const n = (i % PLAYERS) + 1;
    return registerPlayer({ lineUserId: `loadtest:${n}`, displayName: `ทดสอบ ${n}` });
  });
  const results = await Promise.allSettled(calls);
  const elapsed = Date.now() - started;

  const failures: string[] = [];
  const check = (ok: boolean, message: string) => {
    console.log(`${ok ? "ผ่าน" : "ไม่ผ่าน"}  ${message}`);
    if (!ok) failures.push(message);
  };

  const rejected = results.filter((r) => r.status === "rejected");
  check(rejected.length === 0, `ทุก request สำเร็จ (ล้มเหลว ${rejected.length})`);
  if (rejected[0]?.status === "rejected") console.error(rejected[0].reason);

  const players = await pool.query<{ seq: number; team: string | null }>("SELECT seq, team FROM players ORDER BY seq");
  const seqs = players.rows.map((r) => r.seq);
  const count = (team: string | null) => players.rows.filter((r) => r.team === team).length;
  check(players.rowCount === PLAYERS, `ผู้เล่น ${players.rowCount} คน (ต้องได้ ${PLAYERS})`);
  check(seqs.every((s, i) => s === i + 1), "seq เรียง 1 ถึง 50 ไม่ซ้ำ ไม่มีช่องว่าง");
  check(count("bread") === 5, `ขนมปัง ${count("bread")} คน (ต้องได้ 5)`);
  check(count("fish") === 2, `ปลา ${count("fish")} คน (ต้องได้ 2)`);
  check(count(null) === PLAYERS - 7, `ยังไม่มีทีม ${count(null)} คน (ต้องได้ ${PLAYERS - 7})`);
  check(players.rows.every((r) => (r.seq <= 7) === (r.team !== null)), "คนที่ได้ทีมคือ seq 1 ถึง 7 เท่านั้น");

  const events = await pool.query<{ n: number; joins: number }>(
    "SELECT count(*)::int AS n, count(*) FILTER (WHERE kind = 'join')::int AS joins FROM team_events",
  );
  check(events.rows[0].n === PLAYERS && events.rows[0].joins === PLAYERS, `team_events ${events.rows[0].n} แถว เป็น join ทั้งหมด`);

  const state = await pool.query<{ next_seq: number }>("SELECT next_seq FROM game_state");
  check(state.rows[0].next_seq === PLAYERS + 1, `next_seq = ${state.rows[0].next_seq} (ต้องได้ ${PLAYERS + 1})`);

  console.log(`\n${PLAYERS * 2} request พร้อมกัน ใช้เวลา ${elapsed} ms`);

  if (keep) {
    console.log("เก็บข้อมูลทดสอบไว้ (--keep) อย่าลืมล้างก่อนใช้จริง");
  } else {
    await pool.query("DELETE FROM team_events");
    await pool.query("DELETE FROM players");
    await pool.query("UPDATE game_state SET next_seq = 1, assign_seed = floor(random() * 2147483647)::int");
    console.log("ล้างข้อมูลทดสอบแล้ว และสุ่ม assign_seed ใหม่");
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
