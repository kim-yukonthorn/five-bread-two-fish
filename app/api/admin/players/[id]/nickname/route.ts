import { rejectUnlessAdmin } from "@/lib/admin-auth";
import { readJson, serverError } from "@/lib/http";
import { cleanNickname } from "@/lib/nickname";
import { setNickname } from "@/lib/players";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// POST /api/admin/players/[id]/nickname  body { nickname }: admin แก้ชื่อเล่นแทน (พิมพ์ผิดหรือชื่อไม่เหมาะ)
export async function POST(request: Request, ctx: RouteContext<"/api/admin/players/[id]/nickname">) {
  const denied = rejectUnlessAdmin(request);
  if (denied) return denied;

  const { id } = await ctx.params;
  const body = await readJson<{ nickname: unknown }>(request);
  const nickname = cleanNickname(body?.nickname);
  if (!UUID_RE.test(id) || !nickname) return Response.json({ error: "bad_request" }, { status: 400 });

  try {
    return Response.json({ saved: await setNickname(id, nickname) });
  } catch (err) {
    return serverError("admin nickname error", err);
  }
}
