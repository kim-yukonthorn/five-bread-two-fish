"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { AdminEvent, AdminOverview, Counts } from "@/lib/admin";
import { PinForm, adminPin, pinHeaders } from "../ui/admin-pin";
import { STATUS_LABEL, TeamIcon, teamName, type Team } from "../ui/teams";
import { formatCountdown, useClockSeconds } from "../ui/use-clock";
import styles from "./admin.module.css";

type Load =
  | { kind: "loading" }
  | { kind: "unauthorized" }
  | { kind: "ready"; overview: AdminOverview; events: AdminEvent[]; offsetMs: number };

const KIND_LABEL: Record<AdminEvent["kind"], string> = {
  join: "ลงทะเบียน",
  switch: "ผู้เล่นกดเอง",
  admin_move: "admin ย้าย",
};

const timeFormat = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function Pill({ team }: { team: Team | null }) {
  return <span className={`${styles.pill} ${styles[`pill_${team ?? "none"}`]}`}>{teamName(team)}</span>;
}

export default function AdminClient() {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [applyCooldown, setApplyCooldown] = useState(true);
  const [startWarning, setStartWarning] = useState<Counts | null>(null);
  const [resetAsk, setResetAsk] = useState(false);
  const [pinTried, setPinTried] = useState(false);
  const clock = useClockSeconds();

  const call = useCallback(
    (path: string, body?: object) =>
      fetch(path, {
        method: body ? "POST" : "GET",
        headers: { ...pinHeaders(), ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10_000),
      }),
    [],
  );

  const fetchAll = useCallback(async (): Promise<Load | null> => {
    try {
      const [overviewRes, eventsRes] = await Promise.all([call("/api/admin/overview"), call("/api/admin/events")]);
      if (overviewRes.status === 401) return { kind: "unauthorized" };
      if (!overviewRes.ok || !eventsRes.ok) return null;
      const overview: AdminOverview = await overviewRes.json();
      const { events }: { events: AdminEvent[] } = await eventsRes.json();
      return { kind: "ready", overview, events, offsetMs: Date.parse(overview.serverTime) - Date.now() };
    } catch {
      return null;
    }
  }, [call]);

  const reload = useCallback(
    () =>
      fetchAll().then((next) => {
        if (next) setLoad(next);
        setMessage(next ? null : "โหลดข้อมูลไม่สำเร็จ กดรีเฟรชอีกครั้ง");
      }),
    [fetchAll],
  );

  // โหลดตอนเปิดหน้า และทุกครั้งที่กลับมาที่หน้านี้ ไม่ polling
  useEffect(() => {
    reload();
    const onVisible = () => {
      if (document.visibilityState === "visible") reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  /** ยิง action แล้วโหลดข้อมูลใหม่ คืน response ให้ผู้เรียกดูผลต่อ */
  async function act(path: string, body: object): Promise<Response | null> {
    setBusy(true);
    setMessage(null);
    try {
      const res = await call(path, body);
      await reload();
      return res;
    } catch {
      setMessage("ส่งคำสั่งไม่สำเร็จ ตรวจสัญญาณแล้วลองอีกครั้ง");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function gameAction(action: "start" | "pause" | "resume", force = false) {
    const res = await act("/api/admin/game", { action, force });
    if (!res) return;
    if (res.status === 409) {
      const data: { error: string; counts?: Counts } = await res.json();
      if (data.error === "seed_mismatch" && data.counts) return setStartWarning(data.counts);
      setMessage("สถานะเกมเปลี่ยนไปแล้ว ดูสถานะล่าสุดด้านล่าง");
    }
    setStartWarning(null);
  }

  async function move(playerId: string, value: string) {
    const to = value === "none" ? null : (value as Team);
    const res = await act(`/api/admin/players/${playerId}/move`, { to, applyCooldown });
    if (res?.ok) {
      const data: { moved: boolean } = await res.json();
      if (!data.moved) setMessage("ไม่ได้ย้าย: ผู้เล่นอยู่ทีมนั้นแล้ว หรือเกมจบแล้ว");
    }
  }

  async function addPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") ?? "").trim();
    if (!name) return;
    const res = await act("/api/admin/players", { name });
    if (res?.ok) form.reset();
  }

  async function reset() {
    const res = await act("/api/admin/reset", {});
    setResetAsk(false);
    if (res && !res.ok) setMessage("ล้างข้อมูลไม่ได้ระหว่างที่เกมกำลังเล่นหรือพักอยู่");
  }

  async function exportData() {
    setBusy(true);
    try {
      const res = await call("/api/admin/export");
      if (!res.ok) throw new Error("export failed");
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `5bread2fish-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setMessage("Export ไม่สำเร็จ ลองอีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  if (load.kind === "unauthorized") {
    return (
      <PinForm
        wrong={pinTried}
        onSubmit={(pin) => {
          adminPin.set(pin);
          setPinTried(true);
          reload();
        }}
      />
    );
  }
  if (load.kind === "loading") return <main className={styles.blank}>{message ?? "กำลังโหลด…"}</main>;

  const { overview, events, offsetMs } = load;
  const { status, counts, players } = overview;
  const nowMs = clock * 1000 + offsetMs;
  const finished = status === "finished";
  const canReset = status === "registration" || finished;

  return (
    <main className={styles.page}>
      <header className={styles.top}>
        <h1>5 Bread 2 Fish · Admin</h1>
        <button className={styles.button} onClick={reload} disabled={busy}>
          รีเฟรช
        </button>
      </header>

      {message && (
        <p className={styles.warn} role="alert">
          {message}
        </p>
      )}

      <div className={styles.grid}>
        <div className={styles.col}>
          <div className={styles.counts}>
            <div className={`${styles.count} ${styles.count_bread}`}>
              <span>
                <TeamIcon team="bread" className={styles.icon} />
                ขนมปัง
              </span>
              <b>{counts.bread}</b>
            </div>
            <div className={`${styles.count} ${styles.count_fish}`}>
              <span>
                <TeamIcon team="fish" className={styles.icon} />
                ปลา
              </span>
              <b>{counts.fish}</b>
            </div>
            <div className={`${styles.count} ${styles.count_none}`}>
              <span>ยังไม่มีทีม</span>
              <b>{counts.none}</b>
            </div>
          </div>

          <section className={styles.panel}>
            <h2>
              ผู้เล่น <small>{players.length} คน เรียงตามลำดับลงทะเบียน</small>
            </h2>
            <label className={styles.check}>
              <input type="checkbox" checked={applyCooldown} onChange={(e) => setApplyCooldown(e.target.checked)} />
              <span>ย้ายแทนแล้วติด cooldown 1 ชม. เหมือนปกติ (ติ๊กออกเมื่อแก้กดผิด)</span>
            </label>
            <ul className={styles.rows}>
              {players.length === 0 && <li className={styles.empty}>ยังไม่มีใครลงทะเบียน</li>}
              {players.map((p) => {
                const left = p.cooldownUntil ? Date.parse(p.cooldownUntil) - nowMs : 0;
                return (
                  <li className={styles.row} key={p.id}>
                    <span className={styles.seq}>{String(p.seq).padStart(2, "0")}</span>
                    <span className={styles.who}>
                      {p.pictureUrl && (
                        // eslint-disable-next-line @next/next/no-img-element -- รูปโปรไฟล์จาก LINE ขนาดเล็ก ไม่ผ่าน image optimizer
                        <img className={styles.avatar} src={p.pictureUrl} alt="" loading="lazy" width={28} height={28} />
                      )}
                      <span className={styles.name}>{p.name}</span>
                      {!p.hasLine && <span className={styles.tag}>ไม่มี LINE</span>}
                      {left > 0 && <span className={styles.cooldown}>ติด cooldown {formatCountdown(left)}</span>}
                    </span>
                    <Pill team={p.team} />
                    <select
                      aria-label={`ย้ายทีมของ ${p.name}`}
                      value=""
                      disabled={busy || finished}
                      onChange={(e) => e.target.value && move(p.id, e.target.value)}
                    >
                      <option value="">ย้ายไป…</option>
                      {p.team !== "bread" && <option value="bread">ขนมปัง</option>}
                      {p.team !== "fish" && <option value="fish">ปลา</option>}
                      {p.team !== null && <option value="none">ยังไม่มีทีม</option>}
                    </select>
                  </li>
                );
              })}
            </ul>
            <form className={styles.inline} onSubmit={addPlayer}>
              <input name="name" placeholder="ชื่อคนที่ไม่มี LINE" aria-label="ชื่อคนที่ไม่มี LINE" maxLength={60} disabled={finished} />
              <button className={styles.button} disabled={busy || finished}>
                เพิ่ม
              </button>
            </form>
          </section>
        </div>

        <div className={styles.col}>
          <section className={styles.panel}>
            <h2>
              สถานะเกม <span className={`${styles.pill} ${styles.pill_status}`}>{STATUS_LABEL[status]}</span>
            </h2>
            <div className={styles.controls}>
              {status === "registration" && (
                <button className={styles.primary} disabled={busy} onClick={() => gameAction("start")}>
                  เริ่มเกม
                </button>
              )}
              {status === "running" && (
                <button className={styles.primary} disabled={busy} onClick={() => gameAction("pause")}>
                  พักเกม
                </button>
              )}
              {status === "paused" && (
                <button className={styles.primary} disabled={busy} onClick={() => gameAction("resume")}>
                  เล่นต่อ
                </button>
              )}
              {finished && <span className={styles.hint}>ประกาศผลแล้ว เกมล็อก</span>}
            </div>
            {startWarning && status === "registration" && (
              <div className={styles.warn}>
                <span>
                  ตอนนี้ขนมปัง {startWarning.bread} คน ปลา {startWarning.fish} คน ยังไม่ใช่ 5 กับ 2
                </span>
                <button className={styles.button} disabled={busy} onClick={() => gameAction("start", true)}>
                  เริ่มเลย
                </button>
                <button className={styles.button} onClick={() => setStartWarning(null)}>
                  ยกเลิก
                </button>
              </div>
            )}
            <p className={styles.hint}>
              ปุ่มของผู้เล่นใช้ได้เฉพาะตอนกำลังเล่น ส่วน cooldown นับตามเวลาจริง ไม่หยุดตอนพัก
            </p>
          </section>

          <section className={styles.panel}>
            <h2>
              Log การเปลี่ยนทีม <small>{events.length} รายการล่าสุด ไม่เก็บเนื้อหาคำอธิษฐาน</small>
            </h2>
            <ul className={styles.log}>
              {events.length === 0 && <li className={styles.empty}>ยังไม่มีรายการ</li>}
              {events.map((e) => (
                <li key={e.id}>
                  <time dateTime={e.at}>{timeFormat.format(new Date(e.at))}</time>
                  <span>
                    <b>{e.name}</b> {e.kind !== "join" && <Pill team={e.from} />}
                    {e.kind !== "join" && " → "}
                    <Pill team={e.to} /> <span className={styles.kind}>{KIND_LABEL[e.kind]}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className={styles.panel}>
            <h2>สำรองข้อมูล</h2>
            <div className={styles.controls}>
              <button className={styles.button} disabled={busy} onClick={exportData}>
                Export เป็น JSON
              </button>
            </div>
            <p className={styles.hint}>
              ฐานข้อมูลแบบฟรีไม่มี backup กดเก็บไฟล์ทุกเย็น และอีกครั้งก่อนประกาศผล
            </p>
          </section>

          <section className={styles.panel}>
            <h2>หลังทดสอบระบบ</h2>
            {resetAsk ? (
              <div className={styles.warn}>
                <span>
                  ลบผู้เล่นและ log ทั้งหมด แล้วสุ่มลำดับทีมเริ่มต้นใหม่
                  {finished && " ผลของเกมที่จบแล้วจะหายไปด้วย"}
                </span>
                <button className={`${styles.button} ${styles.danger}`} disabled={busy} onClick={reset}>
                  ล้างเลย
                </button>
                <button className={styles.button} onClick={() => setResetAsk(false)}>
                  ยกเลิก
                </button>
              </div>
            ) : (
              <div className={styles.controls}>
                <button className={`${styles.button} ${styles.danger}`} disabled={busy || !canReset} onClick={() => setResetAsk(true)}>
                  ล้างข้อมูลทั้งหมด
                </button>
              </div>
            )}
            <p className={styles.hint}>
              ใช้ไม่ได้ระหว่างเกมกำลังเล่นหรือพักอยู่ ถ้าไม่ล้างหลังทดสอบ คนที่ทดสอบจะกลายเป็น 7 คนแรก
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
