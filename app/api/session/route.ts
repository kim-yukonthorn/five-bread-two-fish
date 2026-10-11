import { cookies } from "next/headers";
import { devLoginEnabled } from "@/lib/dev-login";
import { LineVerifyError, verifyLineIdToken } from "@/lib/line";
import { getMe, registerPlayer } from "@/lib/players";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/session";

const MAX_NAME = 60;

// POST /api/session: verify ID token, ลงทะเบียนถ้ายังไม่มี, ออก cookie
export async function POST(request: Request) {
  const body: { idToken?: unknown; devUser?: unknown } | null = await request.json().catch(() => null);

  let identity: { lineUserId: string; displayName: string; pictureUrl: string | null };

  if (devLoginEnabled() && typeof body?.devUser === "string" && body.devUser.trim()) {
    const name = body.devUser.trim().slice(0, MAX_NAME);
    identity = { lineUserId: `dev:${name}`, displayName: name, pictureUrl: null };
  } else if (typeof body?.idToken === "string" && body.idToken) {
    try {
      const profile = await verifyLineIdToken(body.idToken);
      identity = {
        lineUserId: profile.userId,
        displayName: profile.name.slice(0, MAX_NAME),
        pictureUrl: profile.picture,
      };
    } catch (err) {
      if (err instanceof LineVerifyError) {
        return Response.json({ error: "invalid_token" }, { status: 401 });
      }
      console.error("LINE verify error", err);
      return Response.json({ error: "line_unreachable" }, { status: 502 });
    }
  } else {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const { player } = await registerPlayer(identity);
    const me = await getMe(player.id);
    if (!me) throw new Error("player vanished right after registration");
    (await cookies()).set(SESSION_COOKIE, signSession(player.id), sessionCookieOptions);
    return Response.json(me);
  } catch (err) {
    console.error("register error", err);
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
