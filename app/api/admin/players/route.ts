import { rejectUnlessAdmin } from "@/lib/admin-auth";
import { readJson, serverError } from "@/lib/http";
import { cleanNickname } from "@/lib/nickname";
import { registerPlayer } from "@/lib/players";

// POST /api/admin/players  body { name }: เพิ่มคนที่ไม่มี LINE (ใช้ transaction ลงทะเบียนเดียวกัน)
// name เป็นชื่อเล่น ใช้เป็นชื่อหลักด้วยเพราะไม่มีชื่อ LINE
export async function POST(request: Request) {
  const denied = rejectUnlessAdmin(request);
  if (denied) return denied;

  const body = await readJson<{ name: unknown }>(request);
  const name = cleanNickname(body?.name);
  if (!name) return Response.json({ error: "bad_request" }, { status: 400 });

  try {
    const { player } = await registerPlayer({ lineUserId: null, displayName: name, nickname: name });
    return Response.json({ id: player.id, seq: player.seq, team: player.team });
  } catch (err) {
    return serverError("admin add player error", err);
  }
}
