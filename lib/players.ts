import { assignTeam, type Team } from "./assign-team";
import { getPool, withTransaction } from "./db";
import { PRAYER_SEARCH_LIMIT, parsePrayerQuery } from "./prayer-search";

export type GameStatus = "registration" | "running" | "paused" | "finished";

export type PlayerRow = {
  id: string;
  display_name: string;
  seq: number;
  team: Team | null;
  cooldown_until: Date | null;
};

/** รูปแบบที่ API ของผู้เล่นตอบ ไม่มีจำนวนคนของทีม เพื่อไม่ให้ผู้เล่นรู้ผลก่อน */
export type Me = {
  name: string;
  /** เลขผู้เล่น แสดงบนจอให้คนที่ถูกอธิษฐานเผื่อพิมพ์ค้นหา */
  seq: number;
  team: Team | null;
  cooldownUntil: string | null;
  gameStatus: GameStatus;
  serverTime: string;
};

const PLAYER_COLS = "id, display_name, seq, team, cooldown_until";

/**
 * ลงทะเบียนผู้เล่น (docs/tech-design.md ข้อ 3) ลำดับใน transaction ต้องเป็นแบบนี้
 * เพื่อไม่ให้ seq ซ้ำหรือมีช่องว่าง ไม่งั้นอาจได้ผู้เริ่มต้นไม่ครบ 7
 * lineUserId = null คือคนที่ admin เพิ่มให้ (ไม่มี LINE)
 */
export async function registerPlayer(input: {
  lineUserId: string | null;
  displayName: string;
  pictureUrl?: string | null;
}): Promise<{ player: PlayerRow; created: boolean }> {
  const picture = input.pictureUrl ?? null;

  // คนที่เคยลงทะเบียนแล้ว: อัปเดตชื่อกับรูป ไม่ต้องแตะ lock ของ game_state
  if (input.lineUserId) {
    const existing = await getPool().query<PlayerRow>(
      `UPDATE players SET display_name = $2, picture_url = $3
        WHERE line_user_id = $1 RETURNING ${PLAYER_COLS}`,
      [input.lineUserId, input.displayName, picture],
    );
    if (existing.rowCount) return { player: existing.rows[0], created: false };
  }

  return withTransaction(async (c) => {
    // 1. คนที่ลงทะเบียนพร้อมกันเข้าคิวตรงนี้
    const gs = await c.query<{ assign_seed: number; next_seq: number }>(
      "SELECT assign_seed, next_seq FROM game_state FOR UPDATE",
    );
    if (gs.rowCount !== 1) throw new Error("game_state row missing: run db/schema.sql");

    // 2. เช็กซ้ำหลังได้ lock: เปิดลิงก์ซ้อนสองครั้งต้องไม่กิน seq เพิ่ม
    if (input.lineUserId) {
      const existing = await c.query<PlayerRow>(
        `SELECT ${PLAYER_COLS} FROM players WHERE line_user_id = $1`,
        [input.lineUserId],
      );
      if (existing.rowCount) return { player: existing.rows[0], created: false };
    }

    // 3–5. แจกทีม, ขยับ seq, บันทึกผู้เล่นและ event
    const seq = gs.rows[0].next_seq;
    const team = assignTeam(seq, gs.rows[0].assign_seed);
    await c.query("UPDATE game_state SET next_seq = next_seq + 1");
    const inserted = await c.query<PlayerRow>(
      `INSERT INTO players (line_user_id, display_name, picture_url, seq, team)
       VALUES ($1, $2, $3, $4, $5::team) RETURNING ${PLAYER_COLS}`,
      [input.lineUserId, input.displayName, picture, seq, team],
    );
    const player = inserted.rows[0];
    await c.query(
      "INSERT INTO team_events (player_id, from_team, to_team, kind) VALUES ($1, NULL, $2::team, 'join')",
      [player.id, team],
    );
    return { player, created: true };
  });
}

/** null = ไม่มีผู้เล่นคนนี้แล้ว (เช่น admin ล้างข้อมูลหลังทดสอบ) */
export async function getMe(playerId: string): Promise<Me | null> {
  const res = await getPool().query<{
    display_name: string;
    seq: number;
    team: Team | null;
    cooldown_until: Date | null;
    status: GameStatus;
    server_time: Date;
  }>(
    `SELECT p.display_name, p.seq, p.team, p.cooldown_until, g.status, now() AS server_time
       FROM players p CROSS JOIN game_state g
      WHERE p.id = $1`,
    [playerId],
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    name: row.display_name,
    seq: row.seq,
    team: row.team,
    cooldownUntil: row.cooldown_until ? row.cooldown_until.toISOString() : null,
    gameStatus: row.status,
    serverTime: row.server_time.toISOString(),
  };
}

/** ผลค้นหาคนอธิษฐาน มีทีมของแต่ละคนแต่ไม่มีจำนวนรวมของทีม */
export type PrayerCandidate = {
  id: string;
  name: string;
  seq: number;
  pictureUrl: string | null;
  team: Team;
};

/**
 * ค้นคนที่อธิษฐานเผื่อ: เฉพาะคนที่มีทีมและไม่ใช่ทีมเดียวกับผู้ค้น ไม่รวมตัวเอง
 * ต้องมีคำค้นและได้ไม่เกิน PRAYER_SEARCH_LIMIT คน ไม่มีรายชื่อทั้งทีม เพื่อไม่ให้ผู้เล่นนับจำนวนคนของทีมได้
 */
export async function searchPrayers(playerId: string, raw: string): Promise<PrayerCandidate[]> {
  const q = parsePrayerQuery(raw);
  if (!q) return [];
  const res = await getPool().query<{
    id: string;
    display_name: string;
    seq: number;
    picture_url: string | null;
    team: Team;
  }>(
    `SELECT c.id, c.display_name, c.seq, c.picture_url, c.team
       FROM players c CROSS JOIN players me
      WHERE me.id = $1
        AND c.id <> me.id
        AND c.team IS NOT NULL
        AND c.team IS DISTINCT FROM me.team
        AND (CASE WHEN $2::int IS NOT NULL THEN c.seq = $2::int ELSE c.display_name ILIKE $3::text END)
      ORDER BY c.display_name, c.seq
      LIMIT $4`,
    [playerId, q.kind === "seq" ? q.seq : null, q.kind === "name" ? q.pattern : null, PRAYER_SEARCH_LIMIT],
  );
  return res.rows.map((r) => ({
    id: r.id,
    name: r.display_name,
    seq: r.seq,
    pictureUrl: r.picture_url,
    team: r.team,
  }));
}

/**
 * เปลี่ยนทีม (docs/tech-design.md ข้อ 4) statement เดียว atomic
 * byId คือคนที่อธิษฐานเผื่อ to คือทีมที่ผู้เล่นเห็นบนจอยืนยัน ต้องตรงกับทีมของคนอธิษฐาน ณ ตอนนี้
 * (ถ้าคนอธิษฐานย้ายทีมไประหว่างที่เลือก จะไม่ย้ายผู้เล่นไปทีมที่เขาไม่ได้ยืนยัน)
 * true = เปลี่ยนสำเร็จ, false = คนอธิษฐานเป็นตัวเอง ไม่ได้อยู่ทีม to อยู่ทีมเดียวกัน ติด cooldown หรือเกมไม่ได้ running
 * กดซ้ำตอนเน็ตหลุดจึงไม่มีผล: ครั้งที่สองได้ false แล้ว API ตอบสถานะปัจจุบันกลับไป
 *
 * ต่างจากในเอกสารจุดเดียว: lock แถว game_state แบบ FOR SHARE ด้วย
 * เพื่อให้การกดประกาศผลหรือพักเกมรอ switch ที่ค้างอยู่ให้จบก่อน ผลจึงไม่ขยับหลัง lock
 * แถวของคนอธิษฐานอ่านโดยไม่ lock: ถ้าสองคนอธิษฐานเผื่อกันและกดพร้อมกันจะไม่ deadlock
 */
export async function switchTeam(playerId: string, byId: string, to: Team): Promise<boolean> {
  const res = await getPool().query<{ moved: number }>(
    `WITH moved AS (
       UPDATE players p
          SET team = b.team,
              cooldown_until = now() + interval '20 minutes'
         FROM (
           SELECT pl.id, pl.team AS old_team
             FROM players pl CROSS JOIN game_state g
            WHERE pl.id = $1 AND g.status = 'running'
              FOR UPDATE OF pl FOR SHARE OF g
         ) o,
         (SELECT id, team FROM players WHERE id = $2 AND id <> $1 AND team = $3::team) b
        WHERE p.id = o.id
          AND p.team IS DISTINCT FROM b.team
          AND (p.cooldown_until IS NULL OR p.cooldown_until <= now())
       RETURNING p.id, o.old_team, p.team, b.id AS by_id
     ), ev AS (
       INSERT INTO team_events (player_id, from_team, to_team, kind, by_player_id)
       SELECT id, old_team, team, 'switch', by_id FROM moved
       RETURNING 1
     )
     SELECT count(*)::int AS moved FROM moved`,
    [playerId, byId, to],
  );
  return res.rows[0].moved === 1;
}
