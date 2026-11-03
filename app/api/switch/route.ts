import { cookies } from "next/headers";
import { readJson, serverError } from "@/lib/http";
import { getMe, switchTeam } from "@/lib/players";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/switch  body { by: <id ของคนที่อธิษฐานเผื่อ จาก /api/prayers>, to: ทีมของคนนั้นที่เห็นบนจอยืนยัน }
// ย้ายเมื่อคนอธิษฐานยังอยู่ทีม to ตอบ { moved, name, seq, team, cooldownUntil, gameStatus, serverTime } ไม่ส่งจำนวนคนของทีม
// moved = false ก็ยังตอบสถานะปัจจุบันเสมอ client จึง retry ได้อย่างปลอดภัยเมื่อเน็ตหลุด
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const playerId = verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!playerId) return Response.json({ error: "no_session" }, { status: 401 });

  const body = await readJson<{ by: unknown; to: unknown }>(request);
  const { by, to } = body ?? {};
  if (typeof by !== "string" || !UUID.test(by) || (to !== "bread" && to !== "fish")) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const moved = await switchTeam(playerId, by, to);
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
