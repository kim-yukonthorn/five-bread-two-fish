// แปลงคำค้นในช่อง "ใครอธิษฐานเผื่อคุณ" เป็นเงื่อนไขของ query
// ตัวเลขล้วน = เลขผู้เล่น (players.seq) แบบตรงตัว นอกนั้นค้นชื่อ LINE บางส่วน

export const PRAYER_SEARCH_LIMIT = 8;
const MAX_QUERY = 40;

export type PrayerQuery = { kind: "seq"; seq: number } | { kind: "name"; pattern: string } | null;

export function parsePrayerQuery(raw: string): PrayerQuery {
  const q = raw.normalize("NFC").trim().slice(0, MAX_QUERY);
  if (!q) return null;
  // แป้นตัวเลขไทยพิมพ์เลขไทยได้ จึงรับ ๐–๙ ด้วย
  const digits = q.replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50));
  if (/^\d{1,6}$/.test(digits)) return { kind: "seq", seq: Number(digits) };
  return { kind: "name", pattern: `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` };
}
