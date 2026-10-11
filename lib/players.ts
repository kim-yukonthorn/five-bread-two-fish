import { assignTeam, type Team } from "./assign-team";
import { getPool, withTransaction } from "./db";

export type GameStatus = "registration" | "running" | "paused" | "finished";

export type PlayerRow = {
  id: string;
  display_name: string;
  seq: number;
  team: Team | null;
  cooldown_until: Date | null;
};

/** รูปแบบที่ /api/me และ /api/session ตอบ ไม่มีจำนวนคนของทีม เพื่อไม่ให้ผู้เล่นรู้ผลก่อน */
export type Me = {
  name: string;
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
  return withTransaction(async (c) => {
    // 1. คนที่ลงทะเบียนพร้อมกันเข้าคิวตรงนี้
    const gs = await c.query<{ assign_seed: number; next_seq: number }>(
      "SELECT assign_seed, next_seq FROM game_state FOR UPDATE",
    );
    if (gs.rowCount !== 1) throw new Error("game_state row missing: run db/schema.sql");

    // 2. มีแล้ว return คนเดิม (กดซ้ำ/เปิดสองครั้งไม่กิน seq เพิ่ม)
    if (input.lineUserId) {
      const existing = await c.query<PlayerRow>(
        `UPDATE players SET display_name = $2, picture_url = $3
          WHERE line_user_id = $1 RETURNING ${PLAYER_COLS}`,
        [input.lineUserId, input.displayName, input.pictureUrl ?? null],
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
      [input.lineUserId, input.displayName, input.pictureUrl ?? null, seq, team],
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
    team: Team | null;
    cooldown_until: Date | null;
    status: GameStatus;
    server_time: Date;
  }>(
    `SELECT p.display_name, p.team, p.cooldown_until, g.status, now() AS server_time
       FROM players p CROSS JOIN game_state g
      WHERE p.id = $1`,
    [playerId],
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    name: row.display_name,
    team: row.team,
    cooldownUntil: row.cooldown_until ? row.cooldown_until.toISOString() : null,
    gameStatus: row.status,
    serverTime: row.server_time.toISOString(),
  };
}
