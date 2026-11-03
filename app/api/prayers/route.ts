import { cookies } from "next/headers";
import { serverError } from "@/lib/http";
import { searchPrayers } from "@/lib/players";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// GET /api/prayers?q=27 หรือ ?q=สม  ค้นคนที่อธิษฐานเผื่อ (เลขผู้เล่นหรือชื่อ LINE)
// ตอบ { players: [{ id, name, seq, pictureUrl, team }] } ไม่เกิน 8 คน ไม่ส่งจำนวนคนของทีม
export async function GET(request: Request) {
  const cookieStore = await cookies();
  const playerId = verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!playerId) return Response.json({ error: "no_session" }, { status: 401 });

  const q = new URL(request.url).searchParams.get("q") ?? "";
  try {
    return Response.json({ players: await searchPrayers(playerId, q) });
  } catch (err) {
    return serverError("prayers error", err);
  }
}
