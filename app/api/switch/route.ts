import { cookies } from "next/headers";
import { readJson, serverError } from "@/lib/http";
import { getMe, switchTeam } from "@/lib/players";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// POST /api/switch  body { to: 'bread' | 'fish' }
// ตอบ { moved, name, team, cooldownUntil, gameStatus, serverTime } ไม่ส่งจำนวนคนของทีม
// moved = false ก็ยังตอบสถานะปัจจุบันเสมอ client จึง retry ได้อย่างปลอดภัยเมื่อเน็ตหลุด
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const playerId = verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!playerId) return Response.json({ error: "no_session" }, { status: 401 });

  const body = await readJson<{ to: unknown }>(request);
  const to = body?.to;
  if (to !== "bread" && to !== "fish") return Response.json({ error: "bad_request" }, { status: 400 });

  try {
    const moved = await switchTeam(playerId, to);
    const me = await getMe(playerId);
    if (!me) {
      cookieStore.delete(SESSION_COOKIE);
      return Response.json({ error: "no_session" }, { status: 401 });
    }
    return Response.json({ moved, ...me });
  } catch (err) {
    return serverError("switch error", err);
  }
}
