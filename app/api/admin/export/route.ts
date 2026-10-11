import { exportAll } from "@/lib/admin";
import { rejectUnlessAdmin } from "@/lib/admin-auth";
import { serverError } from "@/lib/http";

// GET /api/admin/export: players + team_events ทั้งหมดเป็น JSON สำหรับเก็บสำรอง
export async function GET(request: Request) {
  const denied = rejectUnlessAdmin(request);
  if (denied) return denied;
  try {
    return Response.json(await exportAll());
  } catch (err) {
    return serverError("admin export error", err);
  }
}
