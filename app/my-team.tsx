"use client";

import { useCallback, useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import type { PrayerCandidate } from "@/lib/players";
import { meStore, type Me } from "./me-store";
import styles from "./my-team.module.css";
import { PrayerPicker } from "./prayer-picker";
import { Avatar } from "./ui/avatar";
import { TEAM, TeamIcon } from "./ui/teams";
import { formatCountdown, useClockSeconds } from "./ui/use-clock";

// หน้าทีมของฉัน (docs/product-design.md ข้อ 4.1 และ 4.2)
// ผู้เล่นไม่เห็นจำนวนคนของแต่ละทีม และคนที่ถูกอธิษฐานเผื่อเป็นคนกดเอง
// กดแล้วเลือกว่าใครอธิษฐานเผื่อ ทีมใหม่คือทีมของคนนั้น (ใช้ทำอันดับตอนประกาศผล)

type Flow = { kind: "closed" } | { kind: "search" } | { kind: "confirm"; by: PrayerCandidate };

type Gate =
  | { kind: "connecting" }
  | { kind: "ok" }
  | { kind: "dev-login" }
  | { kind: "error"; message: string };

const DEV_LOGIN = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEV_FAKE_LOGIN === "1";
const RELOGIN_FLAG = "fb_relogin";
const REQUEST_TIMEOUT_MS = 8_000;
const SWITCH_ATTEMPTS = 3;

function postJson(path: string, body: object) {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
async function loginWithLiff(): Promise<Gate | null> {
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

  const res = await postJson("/api/session", { idToken });
  if (res.ok) {
    onceFlag("clear");
    meStore.set(await res.json());
    return { kind: "ok" };
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

/** โหลดสถานะล่าสุด ถ้าไม่มี session จะพาไป login */
async function refresh(): Promise<Gate | null> {
  try {
    const res = await fetch("/api/me", { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (res.ok) {
      meStore.set(await res.json());
      return { kind: "ok" };
    }
    if (res.status !== 401) return { kind: "error", message: "ต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง" };
    meStore.set(null);
    if (DEV_LOGIN) return { kind: "dev-login" };
    return await loginWithLiff();
  } catch {
    return { kind: "error", message: "สัญญาณไม่ดี ลองใหม่อีกครั้ง" };
  }
}

export default function MyTeam() {
  const me = useSyncExternalStore(meStore.subscribe, meStore.get, meStore.getServer);
  const [gate, setGate] = useState<Gate>({ kind: "connecting" });
  const [flow, setFlow] = useState<Flow>({ kind: "closed" });
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const clock = useClockSeconds();

  const sync = useCallback(() => {
    refresh().then((next) => {
      if (next) setGate(next);
    });
  }, []);

  // โหลดตอนเปิดหน้า และทุกครั้งที่กลับมาที่หน้านี้ ไม่ polling
  useEffect(() => {
    sync();
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [sync]);

  async function devLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const devUser = String(new FormData(event.currentTarget).get("devUser") ?? "").trim();
    if (!devUser) return;
    setGate({ kind: "connecting" });
    try {
      const res = await postJson("/api/session", { devUser });
      if (!res.ok) throw new Error("dev login failed");
      meStore.set(await res.json());
      setGate({ kind: "ok" });
    } catch {
      setGate({ kind: "error", message: "dev login ไม่สำเร็จ" });
    }
  }

  function openPicker() {
    setQuery("");
    setNotice(null);
    setFlow({ kind: "search" });
  }

  async function confirmSwitch() {
    if (flow.kind !== "confirm" || saving) return;
    const by = flow.by;
    setSaving(true);
    setNotice(null);
    let result: (Me & { moved: boolean }) | null = null;
    let done = false;
    // ส่งซ้ำได้อย่างปลอดภัย: ถ้า server เปลี่ยนแล้วแต่ response ไม่ถึง ครั้งถัดไปจะได้สถานะปัจจุบันกลับมา
    for (let attempt = 0; attempt < SWITCH_ATTEMPTS && !done; attempt++) {
      try {
        const res = await postJson("/api/switch", { by: by.id, to: by.team });
        if (res.ok) {
          const data: Me & { moved: boolean } = await res.json();
          meStore.set({
            name: data.name,
            seq: data.seq,
            team: data.team,
            cooldownUntil: data.cooldownUntil,
            gameStatus: data.gameStatus,
            serverTime: data.serverTime,
          });
          result = data;
          done = true;
        } else if (res.status === 401) {
          sync();
          done = true;
        }
      } catch {
        // timeout หรือเน็ตหลุด ลองใหม่
      }
    }
    setSaving(false);
    if (!done) {
      // คง sheet ยืนยันไว้ให้กดซ้ำได้เลย
      setNotice("สัญญาณไม่ดี ยังบันทึกไม่ได้ กดอีกครั้งได้เลย");
      return;
    }
    // ไม่ได้ย้ายทั้งที่เกมเปิดและไม่ติด cooldown แปลว่าคนอธิษฐานย้ายทีมไประหว่างที่เลือก
    // (ถ้าย้ายสำเร็จแล้วแต่ response แรกหลุด ครั้งถัดไปจะได้ทีมตรงกับคนอธิษฐาน ถือว่าสำเร็จ)
    if (result && !result.moved && result.team !== by.team && result.gameStatus === "running") {
      const cooling = result.cooldownUntil && Date.parse(result.cooldownUntil) > Date.parse(result.serverTime);
      if (!cooling) setNotice(`${by.name} ไม่ได้อยู่ทีม${TEAM[by.team].name}แล้ว กดอีกครั้งแล้วเลือกใหม่`);
    }
    setFlow({ kind: "closed" });
  }

  if (!me) {
    return (
      <main className={styles.screen}>
        <div className={styles.inner}>
          {gate.kind === "error" ? (
            <>
              <p className={styles.status}>{gate.message}</p>
              <button className={styles.plainButton} onClick={sync}>
                ลองใหม่
              </button>
            </>
          ) : gate.kind === "dev-login" ? (
            <form className={styles.dev} onSubmit={devLogin}>
              <label htmlFor="devUser">Dev login (ใช้ได้เฉพาะตอนพัฒนา)</label>
              <input id="devUser" name="devUser" placeholder="ชื่อผู้เล่นปลอม" autoComplete="off" />
              <button className={styles.plainButton}>เข้าเกม</button>
            </form>
          ) : (
            <p className={styles.status}>กำลังเข้าเกม…</p>
          )}
        </div>
      </main>
    );
  }

  const nowMs = clock * 1000 + meStore.offsetMs();
  const cooldownLeft = me.cooldownUntil ? Date.parse(me.cooldownUntil) - nowMs : 0;
  const inCooldown = cooldownLeft > 0;
  const running = me.gameStatus === "running";

  return (
    <main className={`${styles.screen} ${me.team ? styles[me.team] : ""}`}>
      <div className={styles.inner}>
        <p className={styles.hello}>
          {me.name}
          {me.team ? " อยู่ทีม" : ""}
        </p>

        {me.team ? (
          <>
            <TeamIcon team={me.team} className={styles.teamIcon} />
            <h1 className={styles.teamName}>{TEAM[me.team].name}</h1>
            {me.seq != null && (
              <p className={styles.myNumber}>
                <span>เลขของฉัน</span>
                <b>{me.seq}</b>
              </p>
            )}
            <div className={styles.myRule}>
              <b>เวลาอธิษฐานเผื่อคนอื่น</b>
              {TEAM[me.team].remind}
            </div>
          </>
        ) : (
          <h1 className={styles.noTeam}>ยังไม่มีทีม</h1>
        )}

        {notice && <p className={styles.banner}>{notice}</p>}

        {me.gameStatus === "finished" ? (
          <p className={styles.banner}>เกมจบแล้ว รอฟังประกาศผล</p>
        ) : inCooldown ? (
          <>
            <p className={styles.cooldownLabel}>เปลี่ยนทีมได้อีกใน</p>
            <p className={styles.cooldownTime} role="timer">
              {formatCountdown(cooldownLeft)}
            </p>
          </>
        ) : (
          <>
            {me.gameStatus === "registration" && <p className={styles.banner}>เกมยังไม่เริ่ม ปุ่มจะใช้ได้เมื่อเปิดเกม</p>}
            {me.gameStatus === "paused" && <p className={styles.banner}>พักเกมอยู่ ปุ่มจะใช้ได้เมื่อเล่นต่อ</p>}
            <div className={styles.choice}>
              <button className={styles.prayedFor} disabled={!running} onClick={openPicker}>
                มีคนอธิษฐานเผื่อฉัน
              </button>
              <p className={styles.rule}>
                กดหลังจาก{me.team ? `ทีม${TEAM[me.team === "bread" ? "fish" : "bread"].name}` : "ทีมขนมปังหรือทีมปลา"}
                อธิษฐานเผื่อคุณแล้ว แล้วเลือกว่าใครอธิษฐานให้
              </p>
            </div>
          </>
        )}
      </div>

      {flow.kind === "search" && (
        <PrayerPicker
          query={query}
          onQuery={setQuery}
          onPick={(by) => {
            setNotice(null);
            setFlow({ kind: "confirm", by });
          }}
          onClose={() => setFlow({ kind: "closed" })}
        />
      )}

      {flow.kind === "confirm" && (
        <div className={styles.sheetWrap}>
          <div className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <Avatar name={flow.by.name} src={flow.by.pictureUrl} size={96} className={`${styles.avatar} ${styles.bigAvatar}`} />
            <h2 id="confirm-title">{flow.by.name}</h2>
            <p>
              เลข {flow.by.seq} · ทีม{TEAM[flow.by.team].name} อธิษฐานเผื่อคุณ
            </p>
            <p className={styles.sheetRule}>{TEAM[flow.by.team].press}</p>
            <p>ยืนยันแล้วเข้าทีม{TEAM[flow.by.team].name}ทันที และเปลี่ยนอีกไม่ได้ 20 นาที</p>
            {notice && (
              <p className={styles.sheetError} role="alert">
                {notice}
              </p>
            )}
            <button
              className={`${styles.join} ${styles[`join_${flow.by.team}`]}`}
              disabled={saving}
              onClick={confirmSwitch}
            >
              <TeamIcon team={flow.by.team} className={styles.joinIcon} />
              <span>{saving ? "กำลังบันทึก…" : `ยืนยัน เข้าทีม${TEAM[flow.by.team].name}`}</span>
            </button>
            {!saving && (
              <button className={styles.ghost} onClick={() => setFlow({ kind: "search" })}>
                ย้อนกลับ
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
