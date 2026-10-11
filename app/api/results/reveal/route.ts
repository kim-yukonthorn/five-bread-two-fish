import { rejectUnlessToken } from "@/lib/admin-auth";
import { serverError } from "@/lib/http";
import { reveal } from "@/lib/results";

// POST /api/results/reveal: ตั้ง finished + finished_at แล้วตอบ timeline ทั้งก้อน กดซ้ำได้
export async function POST(request: Request) {
  const denied = rejectUnlessToken(request, "RESULTS_TOKEN");
  if (denied) return denied;
  try {
    const timeline = await reveal();
    if (!timeline) return Response.json({ error: "not_started" }, { status: 409 });
    return Response.json(timeline);
  } catch (err) {
    return serverError("results reveal error", err);
  }
}
