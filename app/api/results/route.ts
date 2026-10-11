import { rejectUnlessToken } from "@/lib/admin-auth";
import { serverError } from "@/lib/http";
import { getStatus } from "@/lib/results";

// GET /api/results: ตอบแค่ { status } ไม่ส่งตัวเลข ตัวเลขออกทาง reveal เท่านั้น
export async function GET(request: Request) {
  const denied = rejectUnlessToken(request, "RESULTS_TOKEN");
  if (denied) return denied;
  try {
    return Response.json({ status: await getStatus() });
  } catch (err) {
    return serverError("results status error", err);
  }
}
