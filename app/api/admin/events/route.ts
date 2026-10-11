import { getEvents } from "@/lib/admin";
import { rejectUnlessToken } from "@/lib/admin-auth";
import { serverError } from "@/lib/http";

// GET /api/admin/events: log การเปลี่ยนทีม ใหม่สุดก่อน
export async function GET(request: Request) {
  const denied = rejectUnlessToken(request, "ADMIN_TOKEN");
  if (denied) return denied;
  try {
    return Response.json({ events: await getEvents() });
  } catch (err) {
    return serverError("admin events error", err);
  }
}
