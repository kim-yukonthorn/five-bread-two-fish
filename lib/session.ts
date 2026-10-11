import { createHmac, timingSafeEqual } from "node:crypto";

// Session cookie ของเราเอง: `${playerId}.${exp}.${hmac}` (signed, httpOnly, อายุ 7 วัน)
// มี cookie แล้วไม่ต้องรอ liff.init() อีก ดู docs/tech-design.md ข้อ 5

export const SESSION_COOKIE = "fb_session";
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (32+ characters)");
  return s;
}

function mac(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

export function signSession(playerId: string, nowMs: number = Date.now()): string {
  const exp = Math.floor(nowMs / 1000) + MAX_AGE_SECONDS;
  const body = `${playerId}.${exp}`;
  return `${body}.${mac(body)}`;
}

/** คืน playerId ถ้า cookie ถูกต้องและยังไม่หมดอายุ ไม่งั้น null */
export function verifySession(token: string | undefined, nowMs: number = Date.now()): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [playerId, expStr, sig] = parts;
  const expected = Buffer.from(mac(`${playerId}.${expStr}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const exp = Number(expStr);
  if (!Number.isInteger(exp) || exp * 1000 <= nowMs) return null;
  if (!UUID_RE.test(playerId)) return null;
  return playerId;
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};
