import { createHash, timingSafeEqual } from "node:crypto";

// Admin และ results API รับ token ทาง header `x-admin-token` (docs/tech-design.md ข้อ 6)
// ใช้ token คนละตัว เพราะ URL ของหน้าประกาศผลจะขึ้นจอ

type TokenEnv = "ADMIN_TOKEN" | "RESULTS_TOKEN";
const MIN_LENGTH = 32;

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

/** คืน Response 401 ถ้า token ไม่ผ่าน หรือ null ถ้าผ่าน */
export function rejectUnlessToken(request: Request, env: TokenEnv): Response | null {
  const expected = process.env[env];
  const given = request.headers.get("x-admin-token");
  const ok =
    !!expected && expected.length >= MIN_LENGTH && !!given && timingSafeEqual(digest(given), digest(expected));
  return ok ? null : Response.json({ error: "unauthorized" }, { status: 401 });
}
