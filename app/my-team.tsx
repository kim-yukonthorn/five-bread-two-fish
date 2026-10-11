"use client";

import { useEffect, useState, type FormEvent } from "react";

// ขั้น 0: เข้าระบบผ่าน LIFF แล้วโชว์ชื่อกับทีม
// หน้าทีมของฉันเต็มรูปแบบ (สามสถานะ, ปุ่มเปลี่ยนทีม, cooldown, cache ใน localStorage) อยู่ในขั้น 2

type Team = "bread" | "fish";
type Me = {
  name: string;
  team: Team | null;
  cooldownUntil: string | null;
  gameStatus: "registration" | "running" | "paused" | "finished";
  serverTime: string;
};
type View =
  | { kind: "loading" }
  | { kind: "ready"; me: Me }
  | { kind: "dev-login" }
  | { kind: "error"; message: string };

const DEV_LOGIN = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEV_FAKE_LOGIN === "1";
const RELOGIN_FLAG = "fb_relogin";
const TEAM_NAME: Record<Team, string> = { bread: "ขนมปัง", fish: "ปลา" };

function postSession(body: object) {
  return fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function onceFlag(action: "take" | "clear"): boolean {
  try {
    if (action === "clear") {
      sessionStorage.removeItem(RELOGIN_FLAG);
      return true;
    }
    if (sessionStorage.getItem(RELOGIN_FLAG)) return false;
    sessionStorage.setItem(RELOGIN_FLAG, "1");
    return true;
  } catch {
    return false;
  }
}

/** คืน null เมื่อกำลัง redirect ไปหน้า login ของ LINE */
async function loginWithLiff(): Promise<View | null> {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  if (!liffId) return { kind: "error", message: "ยังไม่ได้ตั้งค่า NEXT_PUBLIC_LIFF_ID" };

  // โหลด LIFF SDK เฉพาะตอนไม่มี session (docs/tech-design.md ข้อ 7)
  const { default: liff } = await import("@line/liff");
  await liff.init({ liffId });
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: window.location.href });
    return null;
  }

  const idToken = liff.getIDToken();
  if (!idToken) return { kind: "error", message: "LINE ไม่ส่งข้อมูลยืนยันตัวตนมา ตรวจ scope openid ของ LIFF app" };

  const res = await postSession({ idToken });
  if (res.ok) {
    onceFlag("clear");
    return { kind: "ready", me: await res.json() };
  }
  if (res.status === 401) {
    // ID token หมดอายุ: ใน browser ภายนอกให้ login ใหม่หนึ่งครั้ง ในแอป LINE ต้องเปิดลิงก์ใหม่
    if (!liff.isInClient() && onceFlag("take")) {
      liff.logout();
      liff.login({ redirectUri: window.location.href });
      return null;
    }
    return { kind: "error", message: "ยืนยันตัวตนกับ LINE ไม่ผ่าน ปิดหน้านี้แล้วเปิดลิงก์จากกลุ่มอีกครั้ง" };
  }
  return { kind: "error", message: "เข้าเกมไม่สำเร็จ ลองใหม่อีกครั้ง" };
}

async function boot(): Promise<View | null> {
  try {
    const res = await fetch("/api/me");
    if (res.ok) return { kind: "ready", me: await res.json() };
    if (res.status !== 401) return { kind: "error", message: "ต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง" };
    if (DEV_LOGIN) return { kind: "dev-login" };
    return await loginWithLiff();
  } catch {
    return { kind: "error", message: "สัญญาณไม่ดี ลองใหม่อีกครั้ง" };
  }
}

export default function MyTeam() {
  const [view, setView] = useState<View>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    boot().then((next) => {
      if (!cancelled && next) setView(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function retry() {
    setView({ kind: "loading" });
    boot().then((next) => {
      if (next) setView(next);
    });
  }

  async function devLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const devUser = String(new FormData(event.currentTarget).get("devUser") ?? "").trim();
    if (!devUser) return;
    setView({ kind: "loading" });
    try {
      const res = await postSession({ devUser });
      setView(res.ok ? { kind: "ready", me: await res.json() } : { kind: "error", message: "dev login ไม่สำเร็จ" });
    } catch {
      setView({ kind: "error", message: "ต่อเซิร์ฟเวอร์ไม่ได้" });
    }
  }

  if (view.kind === "loading") return <p className="status">กำลังเข้าเกม…</p>;

  if (view.kind === "error") {
    return (
      <>
        <p className="status">{view.message}</p>
        <button className="button" onClick={retry}>
          ลองใหม่
        </button>
      </>
    );
  }

  if (view.kind === "dev-login") {
    return (
      <form className="dev" onSubmit={devLogin}>
        <label htmlFor="devUser">Dev login (ใช้ได้เฉพาะตอนพัฒนา)</label>
        <input id="devUser" name="devUser" placeholder="ชื่อผู้เล่นปลอม" autoComplete="off" />
        <button className="button">เข้าเกม</button>
      </form>
    );
  }

  const { me } = view;
  return (
    <>
      <p className="hello">สวัสดี {me.name}</p>
      <p className="team">{me.team ? `ทีม${TEAM_NAME[me.team]}` : "ยังไม่มีทีม"}</p>
    </>
  );
}
