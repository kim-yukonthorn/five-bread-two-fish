// Login ปลอมสำหรับพัฒนาใน browser ปกติ ไม่ต้องเปิดผ่าน LINE
// ใช้ไม่ได้บน Vercel ทุกกรณี เพราะทั้ง production และ preview มี NODE_ENV=production
export function devLoginEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEV_FAKE_LOGIN === "1";
}
