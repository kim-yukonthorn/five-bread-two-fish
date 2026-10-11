import type { Team } from "./assign-team";
import { getPool } from "./db";
import type { GameStatus } from "./players";

// เวลาที่ใช้ตัดวันสำหรับป้าย "วันที่ 1 / 2 / 3" บนจอประกาศผล
const CAMP_TIMEZONE = "Asia/Bangkok";

export type TimelineState = { bread: number; fish: number; none: number };

export type TimelineStep = TimelineState & {
  at: string;
  day: number;
  kind: "join" | "switch" | "admin_move";
  name: string;
  from: Team | null;
  to: Team | null;
};

export type Timeline = {
  startedAt: string;
  finishedAt: string;
  /** สถานะตอนกดเริ่มเกม ปกติคือ 5 / ที่เหลือ / 2 */
  init: TimelineState;
  /** ทีละ event หลังเริ่มเกม ผลสุดท้ายคือ step สุดท้าย */
  steps: TimelineStep[];
};

export async function getStatus(): Promise<GameStatus> {
  const res = await getPool().query<{ status: GameStatus }>("SELECT status FROM game_state");
  if (!res.rows[0]) throw new Error("game_state row missing: run db/schema.sql");
  return res.rows[0].status;
}

/**
 * กดเริ่มประกาศผล: lock เกม แล้วคืน timeline ทั้งก้อน (docs/tech-design.md ข้อ 8)
 * กดซ้ำได้: ถ้า finished แล้วไม่แก้ finished_at แค่ตอบ timeline เดิม (เผื่อ refresh จอ)
 * null = เกมยังไม่เคยเริ่ม
 */
export async function reveal(): Promise<Timeline | null> {
  const pool = getPool();
  // UPDATE นี้รอ switch ที่ค้างอยู่ให้จบก่อน (switch ถือ FOR SHARE บนแถวนี้) ผลจึงไม่ขยับหลังจากนี้
  await pool.query(
    "UPDATE game_state SET status = 'finished', finished_at = now() WHERE status IN ('running', 'paused')",
  );
  const g = await pool.query<{ status: GameStatus; started_at: Date | null; finished_at: Date | null }>(
    "SELECT status, started_at, finished_at FROM game_state",
  );
  const state = g.rows[0];
  if (!state || state.status !== "finished" || !state.started_at || !state.finished_at) return null;

  const rows = await pool.query<{
    created_at: Date;
    day: number;
    kind: TimelineStep["kind"];
    display_name: string;
    from_team: Team | null;
    to_team: Team | null;
    bread: number;
    fish: number;
    total: number;
    before_start: boolean;
  }>(
    `SELECT e.created_at, e.kind, e.from_team, e.to_team, p.display_name,
            ((e.created_at AT TIME ZONE $1)::date - (g.started_at AT TIME ZONE $1)::date + 1)::int AS day,
            e.created_at <= g.started_at AS before_start,
            (SUM(CASE WHEN e.to_team = 'bread' THEN 1 ELSE 0 END
               - CASE WHEN e.from_team = 'bread' THEN 1 ELSE 0 END) OVER w)::int AS bread,
            (SUM(CASE WHEN e.to_team = 'fish' THEN 1 ELSE 0 END
               - CASE WHEN e.from_team = 'fish' THEN 1 ELSE 0 END) OVER w)::int AS fish,
            (SUM(CASE WHEN e.kind = 'join' THEN 1 ELSE 0 END) OVER w)::int AS total
       FROM team_events e
       JOIN players p ON p.id = e.player_id
      CROSS JOIN game_state g
      WHERE e.created_at <= g.finished_at
     WINDOW w AS (ORDER BY e.created_at, e.id)
      ORDER BY e.created_at, e.id`,
    [CAMP_TIMEZONE],
  );

  let init: TimelineState = { bread: 0, fish: 0, none: 0 };
  const steps: TimelineStep[] = [];
  for (const r of rows.rows) {
    const counts = { bread: r.bread, fish: r.fish, none: r.total - r.bread - r.fish };
    if (r.before_start) {
      init = counts;
    } else {
      steps.push({
        ...counts,
        at: r.created_at.toISOString(),
        day: r.day,
        kind: r.kind,
        name: r.display_name,
        from: r.from_team,
        to: r.to_team,
      });
    }
  }
  return {
    startedAt: state.started_at.toISOString(),
    finishedAt: state.finished_at.toISOString(),
    init,
    steps,
  };
}
