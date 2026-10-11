import { cookies } from "next/headers";
import { getMe } from "@/lib/players";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// GET /api/me: { name, team, cooldownUntil, gameStatus, serverTime } ไม่ส่งจำนวนคนของทีม
export async function GET() {
  const cookieStore = await cookies();
  const playerId = verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!playerId) return Response.json({ error: "no_session" }, { status: 401 });

  try {
    const me = await getMe(playerId);
    if (!me) {
      // ผู้เล่นถูกลบ (admin ล้างข้อมูล) ให้ client ลงทะเบียนใหม่
      cookieStore.delete(SESSION_COOKIE);
      return Response.json({ error: "no_session" }, { status: 401 });
    }
    return Response.json(me);
  } catch (err) {
    console.error("me error", err);
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
