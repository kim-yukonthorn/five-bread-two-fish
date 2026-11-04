import { cookies } from "next/headers";
import { readJson, serverError } from "@/lib/http";
import { cleanNickname } from "@/lib/nickname";
import { getMe, setNickname } from "@/lib/players";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// POST /api/nickname  body { nickname }: ตั้งหรือแก้ชื่อเล่นของตัวเอง ได้จนกว่าจะประกาศผล
// ตอบ { saved, ...Me } เหมือน /api/me ไม่ส่งจำนวนคนของทีม ส่งซ้ำได้อย่างปลอดภัย
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const playerId = verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!playerId) return Response.json({ error: "no_session" }, { status: 401 });

  const body = await readJson<{ nickname: unknown }>(request);
  const nickname = cleanNickname(body?.nickname);
  if (!nickname) return Response.json({ error: "bad_nickname" }, { status: 400 });

  try {
    const saved = await setNickname(playerId, nickname);
    const me = await getMe(playerId);
    if (!me) {
      cookieStore.delete(SESSION_COOKIE);
      return Response.json({ error: "no_session" }, { status: 401 });
    }
    return Response.json({ saved, ...me });
  } catch (err) {
    return serverError("nickname error", err);
  }
}
