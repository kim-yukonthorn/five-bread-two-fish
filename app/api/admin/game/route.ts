import { gameAction } from "@/lib/admin";
import { rejectUnlessAdmin } from "@/lib/admin-auth";
import { readJson, serverError } from "@/lib/http";

// POST /api/admin/game  body { action: 'start' | 'pause' | 'resume', force? }
// start ตอบ 409 seed_mismatch พร้อมจำนวน ถ้าขนมปังไม่เท่ากับ 5 หรือปลาไม่เท่ากับ 2 และไม่ได้ส่ง force
export async function POST(request: Request) {
  const denied = rejectUnlessAdmin(request);
  if (denied) return denied;

  const body = await readJson<{ action: unknown; force: unknown }>(request);
  const action = body?.action;
  if (action !== "start" && action !== "pause" && action !== "resume") {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const result = await gameAction(action, body?.force === true);
    if (result.ok) return Response.json(result);
    return Response.json({ error: result.reason, ...result }, { status: 409 });
  } catch (err) {
    return serverError("admin game error", err);
  }
}
