import type { Team } from "./assign-team";
import { getPool, withTransaction } from "./db";
import type { GameStatus } from "./players";

export type Counts = { bread: number; fish: number; none: number };

export type AdminPlayer = {
  id: string;
  name: string;
  seq: number;
  team: Team | null;
  cooldownUntil: string | null;
  hasLine: boolean;
  pictureUrl: string | null;
};

export type AdminOverview = {
  status: GameStatus;
  startedAt: string | null;
  finishedAt: string | null;
  counts: Counts;
  players: AdminPlayer[];
  serverTime: string;
};

export type AdminEvent = {
  id: string;
  at: string;
  name: string;
  from: Team | null;
  to: Team | null;
  kind: "join" | "switch" | "admin_move";
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export async function getOverview(): Promise<AdminOverview> {
  const pool = getPool();
  const [state, players] = await Promise.all([
    pool.query<{ status: GameStatus; started_at: Date | null; finished_at: Date | null; server_time: Date }>(
      "SELECT status, started_at, finished_at, now() AS server_time FROM game_state",
    ),
    pool.query<{
      id: string;
      display_name: string;
      seq: number;
      team: Team | null;
      cooldown_until: Date | null;
      has_line: boolean;
      picture_url: string | null;
    }>(
      `SELECT id, display_name, seq, team, cooldown_until, line_user_id IS NOT NULL AS has_line, picture_url
         FROM players ORDER BY seq`,
    ),
  ]);
  const g = state.rows[0];
  if (!g) throw new Error("game_state row missing: run db/schema.sql");
  const count = (team: Team | null) => players.rows.filter((p) => p.team === team).length;
  return {
    status: g.status,
    startedAt: iso(g.started_at),
    finishedAt: iso(g.finished_at),
    counts: { bread: count("bread"), fish: count("fish"), none: count(null) },
    players: players.rows.map((p) => ({
      id: p.id,
      name: p.display_name,
      seq: p.seq,
      team: p.team,
      cooldownUntil: iso(p.cooldown_until),
      hasLine: p.has_line,
      pictureUrl: p.picture_url,
    })),
    serverTime: g.server_time.toISOString(),
  };
}

/** Log การเปลี่ยนทีม ใหม่สุดก่อน */
export async function getEvents(limit = 500): Promise<AdminEvent[]> {
  const res = await getPool().query<{
    id: string;
    created_at: Date;
    display_name: string;
    from_team: Team | null;
    to_team: Team | null;
    kind: AdminEvent["kind"];
  }>(
    `SELECT e.id, e.created_at, p.display_name, e.from_team, e.to_team, e.kind
       FROM team_events e JOIN players p ON p.id = e.player_id
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT $1`,
    [limit],
  );
  return res.rows.map((r) => ({
    id: String(r.id),
    at: r.created_at.toISOString(),
    name: r.display_name,
    from: r.from_team,
    to: r.to_team,
    kind: r.kind,
  }));
}

/**
 * Admin ย้ายทีมแทน บันทึกเป็น admin_move ย้ายไป null คือคืนเป็นยังไม่มีทีม
 * applyCooldown = false ใช้ตอนแก้กดผิด: ล้าง cooldown เดิมของคนนั้นด้วย
 * ใช้ได้ทุกสถานะยกเว้น finished (ก่อนเริ่มเกมใช้สลับตัวผู้เริ่มต้น)
 */
export async function adminMove(playerId: string, to: Team | null, applyCooldown: boolean): Promise<boolean> {
  const res = await getPool().query<{ moved: number }>(
    `WITH moved AS (
       UPDATE players p
          SET team = $2::team,
              cooldown_until = CASE WHEN $3::boolean AND $2::team IS NOT NULL
                                    THEN now() + interval '1 hour' END
         FROM (
           SELECT pl.id, pl.team AS old_team
             FROM players pl CROSS JOIN game_state g
            WHERE pl.id = $1 AND g.status <> 'finished'
              FOR UPDATE OF pl FOR SHARE OF g
         ) o
        WHERE p.id = o.id
          AND p.team IS DISTINCT FROM $2::team
       RETURNING p.id, o.old_team, p.team
     ), ev AS (
       INSERT INTO team_events (player_id, from_team, to_team, kind)
       SELECT id, old_team, team, 'admin_move' FROM moved
       RETURNING 1
     )
     SELECT count(*)::int AS moved FROM moved`,
    [playerId, to, applyCooldown],
  );
  return res.rows[0].moved === 1;
}

export type GameActionResult =
  | { ok: true; status: GameStatus }
  | { ok: false; reason: "wrong_status"; status: GameStatus }
  | { ok: false; reason: "seed_mismatch"; status: GameStatus; counts: Counts };

/**
 * เริ่ม / พัก / เล่นต่อ
 * start เตือนถ้าขนมปังไม่เท่ากับ 5 หรือปลาไม่เท่ากับ 2 ส่ง force = true เพื่อเริ่มทั้งอย่างนั้น
 */
export async function gameAction(action: "start" | "pause" | "resume", force = false): Promise<GameActionResult> {
  return withTransaction(async (c) => {
    const g = await c.query<{ status: GameStatus }>("SELECT status FROM game_state FOR UPDATE");
    const status = g.rows[0].status;

    if (action === "start") {
      if (status !== "registration") return { ok: false, reason: "wrong_status", status };
      const n = await c.query<{ bread: number; fish: number; none: number }>(
        `SELECT count(*) FILTER (WHERE team = 'bread')::int AS bread,
                count(*) FILTER (WHERE team = 'fish')::int  AS fish,
                count(*) FILTER (WHERE team IS NULL)::int   AS none
           FROM players`,
      );
      const counts = n.rows[0];
      if (!force && (counts.bread !== 5 || counts.fish !== 2)) {
        return { ok: false, reason: "seed_mismatch", status, counts };
      }
      await c.query("UPDATE game_state SET status = 'running', started_at = now()");
      return { ok: true, status: "running" };
    }

    const from: GameStatus = action === "pause" ? "running" : "paused";
    const next: GameStatus = action === "pause" ? "paused" : "running";
    if (status !== from) return { ok: false, reason: "wrong_status", status };
    await c.query("UPDATE game_state SET status = $1::game_status", [next]);
    return { ok: true, status: next };
  });
}

/**
 * ล้างผู้เล่นและ log ทั้งหมด แล้วสุ่มลำดับทีมเริ่มต้นใหม่ สำหรับหลังทดสอบระบบ
 * ใช้ได้ตอน registration และ finished เท่านั้น เพื่อไม่ให้ลบเกมที่กำลังเล่นอยู่
 * (เอกสารเดิมให้เฉพาะ registration แต่ทดสอบครบรอบถึงประกาศผลแล้วจะไม่มีทางกลับ)
 */
export async function resetGame(): Promise<{ ok: boolean; status: GameStatus }> {
  return withTransaction(async (c) => {
    const g = await c.query<{ status: GameStatus }>("SELECT status FROM game_state FOR UPDATE");
    const status = g.rows[0].status;
    if (status !== "registration" && status !== "finished") return { ok: false, status };
    await c.query("DELETE FROM team_events");
    await c.query("DELETE FROM players");
    await c.query(
      `UPDATE game_state
          SET status = 'registration', next_seq = 1, started_at = NULL, finished_at = NULL,
              assign_seed = floor(random() * 2147483647)::int`,
    );
    return { ok: true, status: "registration" };
  });
}

/** ข้อมูลทั้งหมดสำหรับเก็บสำรอง (Supabase Free ไม่มี backup) */
export async function exportAll() {
  const pool = getPool();
  const [state, players, events] = await Promise.all([
    pool.query("SELECT status, assign_seed, next_seq, started_at, finished_at FROM game_state"),
    pool.query(
      `SELECT id, line_user_id, display_name, picture_url, seq, team, cooldown_until, created_at
         FROM players ORDER BY seq`,
    ),
    pool.query(
      "SELECT id, player_id, from_team, to_team, kind, created_at FROM team_events ORDER BY created_at, id",
    ),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    gameState: state.rows[0] ?? null,
    players: players.rows,
    teamEvents: events.rows,
  };
}
