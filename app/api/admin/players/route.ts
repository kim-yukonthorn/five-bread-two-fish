import { rejectUnlessToken } from "@/lib/admin-auth";
import { readJson, serverError } from "@/lib/http";
import { registerPlayer } from "@/lib/players";

// POST /api/admin/players  body { name }: เพิ่มคนที่ไม่มี LINE (ใช้ transaction ลงทะเบียนเดียวกัน)
export async function POST(request: Request) {
  const denied = rejectUnlessToken(request, "ADMIN_TOKEN");
  if (denied) return denied;

  const body = await readJson<{ name: unknown }>(request);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 60) : "";
  if (!name) return Response.json({ error: "bad_request" }, { status: 400 });

  try {
    const { player } = await registerPlayer({ lineUserId: null, displayName: name });
    return Response.json({ id: player.id, seq: player.seq, team: player.team });
  } catch (err) {
    return serverError("admin add player error", err);
  }
}
