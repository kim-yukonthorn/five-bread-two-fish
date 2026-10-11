import { adminMove } from "@/lib/admin";
import { rejectUnlessAdmin } from "@/lib/admin-auth";
import { readJson, serverError } from "@/lib/http";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// POST /api/admin/players/[id]/move  body { to: 'bread' | 'fish' | null, applyCooldown }
export async function POST(request: Request, ctx: RouteContext<"/api/admin/players/[id]/move">) {
  const denied = rejectUnlessAdmin(request);
  if (denied) return denied;

  const { id } = await ctx.params;
  const body = await readJson<{ to: unknown; applyCooldown: unknown }>(request);
  const to = body?.to;
  if (!UUID_RE.test(id) || (to !== "bread" && to !== "fish" && to !== null)) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const moved = await adminMove(id, to, body?.applyCooldown !== false);
    return Response.json({ moved });
  } catch (err) {
    return serverError("admin move error", err);
  }
}
