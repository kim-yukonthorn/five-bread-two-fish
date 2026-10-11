export type Team = "bread" | "fish";
export type GameStatus = "registration" | "running" | "paused" | "finished";

export const TEAM: Record<Team, { name: string; remind: string; press: string }> = {
  bread: {
    name: "ขนมปัง",
    remind: "ต้องอธิษฐานเจาะจงเรื่องที่คนนั้นกำลังเผชิญอยู่จริง",
    press: "กดเมื่อทีมขนมปังอธิษฐานเจาะจงเรื่องที่คุณกำลังเผชิญอยู่จริงแล้ว",
  },
  fish: {
    name: "ปลา",
    remind: "อธิษฐานเรื่องทั่วไปได้ เช่น สุขภาพ การเรียน การทำงาน",
    press: "กดเมื่อทีมปลาอธิษฐานเผื่อคุณแล้ว เรื่องทั่วไปก็ได้ เช่น สุขภาพ การเรียน การทำงาน",
  },
};

export const teamName = (team: Team | null) => (team ? TEAM[team].name : "ยังไม่มีทีม");

export const STATUS_LABEL: Record<GameStatus, string> = {
  registration: "ช่วงลงทะเบียน",
  running: "กำลังเล่น",
  paused: "พักเกม",
  finished: "จบเกมแล้ว",
};

// ไอคอนเป็น inline SVG ไม่ใช้ไฟล์รูป สีของรอยบากและตาปลามาจาก CSS variable --cut ของพื้นหลัง
export function TeamIcon({ team, className }: { team: Team; className?: string }) {
  if (team === "bread") {
    return (
      <svg viewBox="0 0 32 32" className={className} fill="currentColor" aria-hidden="true">
        <path d="M3 19c0-7 5.5-11.5 13-11.5S29 12 29 19c0 3.2-2.2 5.5-5.5 5.5h-15C5.2 24.5 3 22.2 3 19z" />
        <path
          d="M10.5 12.5l2 5M15.5 11.5l2 5M20.5 12.5l2 5"
          fill="none"
          stroke="var(--cut, #fff)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 32 32" className={className} fill="currentColor" aria-hidden="true">
      <path d="M2 16c4-6 8.5-9 14.5-9 4.2 0 7.3 2 9.5 4.5L30 7.5v17l-4-4c-2.2 2.5-5.3 4.5-9.5 4.5C10.5 25 6 22 2 16z" />
      <circle cx="9.5" cy="14" r="1.6" fill="var(--cut, #fff)" />
    </svg>
  );
}
