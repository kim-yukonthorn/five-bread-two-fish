import type { GameStatus, Team } from "./ui/teams";

export type Me = {
  name: string;
  team: Team | null;
  cooldownUntil: string | null;
  gameStatus: GameStatus;
  serverTime: string;
};

// เก็บ response ล่าสุดของ /api/me ไว้ใน localStorage แล้ว render จากค่านี้ทันที
// จากนั้นค่อย refetch เบื้องหลัง (docs/tech-design.md ข้อ 7)
// localStorage อาจถูกล้างหรือใช้ไม่ได้ จึงครอบ try/catch และทำงานต่อได้ถ้าไม่มี

const KEY = "fb_me";
const listeners = new Set<() => void>();
let current: Me | null = null;
let loaded = false;
let offsetMs = 0; // เวลา server ลบเวลาเครื่อง ใช้นับถอยหลัง cooldown โดยไม่เชื่อนาฬิกาเครื่อง

function isMe(value: unknown): value is Me {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.name === "string" && typeof v.gameStatus === "string" && typeof v.serverTime === "string";
}

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (isMe(parsed)) current = parsed;
  } catch {
    // ไม่มี cache ก็รอผลจาก server
  }
}

export const meStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  get(): Me | null {
    load();
    return current;
  },
  getServer(): Me | null {
    return null;
  },
  /** เรียกเมื่อได้ response จาก server เท่านั้น จึงใช้ serverTime ปรับนาฬิกาได้ */
  set(next: Me | null) {
    loaded = true;
    current = next;
    if (next) offsetMs = Date.parse(next.serverTime) - Date.now();
    try {
      if (next) localStorage.setItem(KEY, JSON.stringify(next));
      else localStorage.removeItem(KEY);
    } catch {
      // เก็บไม่ได้ก็ไม่เป็นไร
    }
    listeners.forEach((listener) => listener());
  },
  offsetMs() {
    return offsetMs;
  },
};
