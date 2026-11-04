// ชื่อเล่นที่ผู้เล่นตั้งเอง ใช้แสดงแทนชื่อ LINE และใช้ค้นหาคนอธิษฐาน ซ้ำกันได้

export const NICKNAME_MAX = 20;

// ตัวควบคุมและตัวกลับทิศข้อความ ทำให้ชื่อแสดงเพี้ยนบนจออื่น
const FORBIDDEN = /[\p{Cc}‪-‮⁦-⁩]/u;
const segmenter = new Intl.Segmenter("th", { granularity: "grapheme" });

/** คืนชื่อเล่นที่พร้อมบันทึก หรือ null ถ้าว่าง ยาวเกิน NICKNAME_MAX ตัว (นับแบบที่ตาเห็น) หรือมีอักขระต้องห้าม */
export function cleanNickname(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!name || FORBIDDEN.test(name)) return null;
  // ตัดข้อความยาวผิดปกติก่อนนับ (หนึ่งตัวที่ตาเห็นใช้ได้หลาย code unit เช่น emoji ครอบครัว)
  if (name.length > NICKNAME_MAX * 12) return null;
  if (Array.from(segmenter.segment(name)).length > NICKNAME_MAX) return null;
  return name;
}
