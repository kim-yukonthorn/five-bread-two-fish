import { createHash, timingSafeEqual } from "node:crypto";

// หน้า /admin และ /results ไม่มี token ใน URL
// ถ้าไม่ตั้ง ADMIN_PIN ทุกคนที่รู้ URL ใช้ได้เลย ถ้าตั้งไว้ ต้องใส่ PIN หนึ่งครั้งต่อเครื่อง
// PIN ส่งมาทาง header `x-admin-pin` (encodeURIComponent เพราะ header รับได้แค่ตัวอักษรละติน)

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

/** คืน Response 401 ถ้าตั้ง PIN ไว้แล้ว PIN ที่ส่งมาไม่ตรง หรือ null ถ้าผ่าน */
export function rejectUnlessAdmin(request: Request): Response | null {
  // อ่าน header ก่อนเสมอ แม้ไม่ได้ตั้ง PIN: การแตะ request ทำให้ Next รัน handler ตอนมี request จริงเท่านั้น
  // ไม่งั้น GET handler จะถูกลอง prerender ตอน build แล้วไป query ฐานข้อมูล
  const header = request.headers.get("x-admin-pin") ?? "";

  const expected = process.env.ADMIN_PIN;
  if (!expected) return null;

  let given = "";
  try {
    given = decodeURIComponent(header);
  } catch {
    // header ผิดรูปแบบ ถือว่าไม่ได้ส่ง PIN
  }
  return timingSafeEqual(digest(given), digest(expected))
    ? null
    : Response.json({ error: "unauthorized" }, { status: 401 });
}
