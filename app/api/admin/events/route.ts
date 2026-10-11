import { getEvents } from "@/lib/admin";
import { rejectUnlessAdmin } from "@/lib/admin-auth";
import { serverError } from "@/lib/http";

// GET /api/admin/events: log การเปลี่ยนทีม ใหม่สุดก่อน
export async function GET(request: Request) {
  const denied = rejectUnlessAdmin(request);
  if (denied) return denied;
  try {
    return Response.json({ events: await getEvents() });
  } catch (err) {
    return serverError("admin events error", err);
  }
}
