import { getOverview } from "@/lib/admin";
import { rejectUnlessToken } from "@/lib/admin-auth";
import { serverError } from "@/lib/http";

// GET /api/admin/overview: จำนวนขนมปัง / ปลา / ยังไม่มีทีม, รายชื่อ, สถานะเกม
export async function GET(request: Request) {
  const denied = rejectUnlessToken(request, "ADMIN_TOKEN");
  if (denied) return denied;
  try {
    return Response.json(await getOverview());
  } catch (err) {
    return serverError("admin overview error", err);
  }
}
