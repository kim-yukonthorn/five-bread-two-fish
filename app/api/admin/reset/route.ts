import { resetGame } from "@/lib/admin";
import { rejectUnlessAdmin } from "@/lib/admin-auth";
import { serverError } from "@/lib/http";

// POST /api/admin/reset: ล้าง players + events, next_seq = 1, สุ่ม assign_seed ใหม่
// ใช้ไม่ได้ระหว่างเกมกำลังเล่นหรือพักอยู่
export async function POST(request: Request) {
  const denied = rejectUnlessAdmin(request);
  if (denied) return denied;
  try {
    const result = await resetGame();
    if (result.ok) return Response.json(result);
    return Response.json({ error: "wrong_status", status: result.status }, { status: 409 });
  } catch (err) {
    return serverError("admin reset error", err);
  }
}
