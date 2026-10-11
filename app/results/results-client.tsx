"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Timeline, TimelineState, TimelineStep } from "@/lib/results";
import { PinForm, adminPin, pinHeaders } from "../ui/admin-pin";
import { TEAM, TeamIcon, type GameStatus } from "../ui/teams";
import styles from "./results.module.css";

// เข้ามาแล้วยังไม่เปิดเผยผล กดเริ่มจึง lock เกมแล้วเล่น recap
// โหลด timeline ทั้งก้อนก่อนเล่น จึงไม่พึ่งเน็ตระหว่าง animation (docs/tech-design.md ข้อ 8)

type View =
  | { kind: "loading" }
  | { kind: "unauthorized" }
  | { kind: "idle"; status: GameStatus; error?: string }
  | { kind: "show"; timeline: Timeline; index: number; playing: boolean };

const TOTAL_MS = 36_000; // เดินตาม event ด้วยความเร็วคงที่ รวมราว 30 ถึง 45 วินาที
const clockFormat = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });

function stepDelay(steps: number) {
  return Math.max(250, Math.min(900, TOTAL_MS / Math.max(1, steps)));
}

function describe(step: TimelineStep): string {
  const time = `${clockFormat.format(new Date(step.at))} น.`;
  if (step.kind === "join") return `${time} ${step.name} ลงทะเบียน`;
  const target = step.to ? `ทีม${TEAM[step.to].name}` : "ยังไม่มีทีม";
  if (step.kind === "admin_move") return `${time} admin ย้าย ${step.name} ไป${target}`;
  if (step.from && step.to) return `${time} ${step.name} ย้ายจาก${TEAM[step.from].name}ไป${TEAM[step.to].name}`;
  return `${time} ${step.name} เข้า${target}`;
}

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** แถบย้อนหลังใต้ gauge: บนลงล่าง หนึ่งแถบต่อหนึ่ง event */
function drawRiver(canvas: HTMLCanvasElement, timeline: Timeline, index: number) {
  const rows = timeline.steps.length + 1;
  const width = canvas.clientWidth || 600;
  const height = Math.max(120, Math.min(300, rows * 4));
  const ratio = window.devicePixelRatio || 1;
  canvas.style.height = `${height}px`;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const g = canvas.getContext("2d");
  if (!g) return;
  g.scale(ratio, ratio);

  const bread = cssVar("--bread");
  const fish = cssVar("--fish");
  const none = cssVar("--none-soft");
  const ink = cssVar("--ink");
  const surface = cssVar("--surface");
  g.fillStyle = cssVar("--sunk");
  g.fillRect(0, 0, width, height);

  const rowHeight = height / rows;
  const marks: Array<[number, number]> = [];
  let lastDay = 1;
  for (let k = 0; k <= index + 1; k++) {
    const state: TimelineState = k === 0 ? timeline.init : timeline.steps[k - 1];
    const total = state.bread + state.none + state.fish || 1;
    const y = k * rowHeight;
    const breadWidth = (width * state.bread) / total;
    const fishWidth = (width * state.fish) / total;
    g.fillStyle = none;
    g.fillRect(0, y, width, rowHeight + 0.5);
    g.fillStyle = bread;
    g.fillRect(0, y, breadWidth, rowHeight + 0.5);
    g.fillStyle = fish;
    g.fillRect(width - fishWidth, y, fishWidth, rowHeight + 0.5);
    if (k > 0 && timeline.steps[k - 1].day !== lastDay) {
      lastDay = timeline.steps[k - 1].day;
      marks.push([y, lastDay]);
    }
  }

  g.fillStyle = ink;
  g.globalAlpha = 0.5;
  g.fillRect(width / 2 - 0.5, 0, 1, Math.min(height, (index + 2) * rowHeight));
  g.globalAlpha = 1;
  g.font = "600 12px system-ui, sans-serif";
  g.textBaseline = "middle";
  g.textAlign = "center";
  for (const [y, day] of marks) {
    g.fillStyle = ink;
    g.fillRect(0, y - 0.5, width, 1);
    const label = `วันที่ ${day}`;
    const labelWidth = g.measureText(label).width + 10;
    const labelY = Math.min(height - 10, y + 10);
    g.fillStyle = surface;
    g.fillRect(width / 2 - labelWidth / 2, labelY - 9, labelWidth, 18);
    g.fillStyle = ink;
    g.fillText(label, width / 2, labelY);
  }
}

export default function ResultsClient() {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [pinTried, setPinTried] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const call = useCallback(
    (path: string, method: "GET" | "POST") =>
      fetch(path, { method, headers: pinHeaders(), signal: AbortSignal.timeout(15_000) }),
    [],
  );

  const fetchStatus = useCallback(async (): Promise<View> => {
    try {
      const res = await call("/api/results", "GET");
      if (res.status === 401) return { kind: "unauthorized" };
      if (!res.ok) throw new Error("status failed");
      const { status }: { status: GameStatus } = await res.json();
      return { kind: "idle", status };
    } catch {
      return { kind: "idle", status: "running", error: "ต่อเซิร์ฟเวอร์ไม่ได้ ลองกดอีกครั้ง" };
    }
  }, [call]);

  useEffect(() => {
    fetchStatus().then(setView);
  }, [fetchStatus]);

  async function start() {
    setBusy(true);
    try {
      const res = await call("/api/results/reveal", "POST");
      if (res.status === 409) return setView({ kind: "idle", status: "registration" });
      if (!res.ok) throw new Error("reveal failed");
      const timeline: Timeline = await res.json();
      setView({ kind: "show", timeline, index: -1, playing: timeline.steps.length > 0 });
    } catch {
      setView((v) => (v.kind === "idle" ? { ...v, error: "ต่อเซิร์ฟเวอร์ไม่ได้ ลองกดอีกครั้ง" } : v));
    } finally {
      setBusy(false);
    }
  }

  // เดินทีละ event
  useEffect(() => {
    if (view.kind !== "show" || !view.playing) return;
    const last = view.timeline.steps.length - 1;
    const timer = setTimeout(
      () => {
        setView((v) => {
          if (v.kind !== "show" || !v.playing) return v;
          const index = Math.min(last, v.index + 1);
          return { ...v, index, playing: index < last };
        });
      },
      view.index < 0 ? 1200 : stepDelay(view.timeline.steps.length),
    );
    return () => clearTimeout(timer);
  }, [view]);

  // วาดแถบย้อนหลัง
  useEffect(() => {
    if (view.kind !== "show" || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const { timeline, index } = view;
    const draw = () => drawRiver(canvas, timeline, index);
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [view]);

  if (view.kind === "loading") return <main className={styles.page} />;
  if (view.kind === "unauthorized") {
    return (
      <PinForm
        wrong={pinTried}
        onSubmit={(pin) => {
          adminPin.set(pin);
          setPinTried(true);
          fetchStatus().then(setView);
        }}
      />
    );
  }

  if (view.kind === "idle") {
    const notStarted = view.status === "registration";
    const finished = view.status === "finished";
    return (
      <main className={styles.page}>
        <div className={`${styles.stage} ${styles.pre}`}>
          <h1>{finished ? "ประกาศผลแล้ว" : "ยังไม่เปิดเผยผล"}</h1>
          <p>
            {notStarted
              ? "เกมยังไม่เริ่ม เปิดเกมจากหน้า admin ก่อน"
              : finished
                ? "เกมล็อกแล้ว กดเพื่อเล่น recap อีกครั้ง"
                : "กดเริ่มแล้วระบบล็อกการเปลี่ยนทีมทันที และย้อนกลับไม่ได้"}
          </p>
          {view.error && (
            <p className={styles.error} role="alert">
              {view.error}
            </p>
          )}
          <button className={styles.startButton} disabled={busy || notStarted} onClick={start}>
            {busy ? "กำลังโหลด…" : finished ? "เล่น recap" : "เริ่ม"}
          </button>
        </div>
      </main>
    );
  }

  const { timeline, index, playing } = view;
  const state: TimelineState = index < 0 ? timeline.init : timeline.steps[index];
  const day = index < 0 ? 1 : timeline.steps[index].day;
  const done = !playing;
  const winner = state.bread === state.fish ? "tie" : state.bread > state.fish ? "bread" : "fish";

  return (
    <main className={styles.page}>
      <div className={styles.stage}>
        <div className={styles.head}>
          <span className={styles.day}>วันที่ {day}</span>
          <span className={styles.ticker}>
            {index < 0 ? `เริ่มเกม ${clockFormat.format(new Date(timeline.startedAt))} น.` : describe(timeline.steps[index])}
          </span>
        </div>

        <div className={styles.score}>
          <div className={`${styles.side} ${styles.side_bread}`}>
            <span>
              <TeamIcon team="bread" className={styles.icon} />
              ขนมปัง
            </span>
            <b>{state.bread}</b>
          </div>
          <div className={`${styles.side} ${styles.side_none}`}>
            <span>ยังไม่มีทีม</span>
            <b>{state.none}</b>
          </div>
          <div className={`${styles.side} ${styles.side_fish}`}>
            <span>
              ปลา
              <TeamIcon team="fish" className={styles.icon} />
            </span>
            <b>{state.fish}</b>
          </div>
        </div>

        <div className={styles.gauge} role="img" aria-label={`ขนมปัง ${state.bread} ยังไม่มีทีม ${state.none} ปลา ${state.fish}`}>
          <div className={styles.gaugeBread} style={{ flexGrow: state.bread }} />
          <div className={styles.gaugeNone} style={{ flexGrow: state.none }} />
          <div className={styles.gaugeFish} style={{ flexGrow: state.fish }} />
          <i />
        </div>

        <canvas ref={canvasRef} className={styles.river} height={200} />

        {done && (
          <div className={`${styles.verdict} ${styles[`verdict_${winner}`]}`}>
            <h2>{winner === "tie" ? "เสมอ" : `ทีม${TEAM[winner].name}ชนะ`}</h2>
            <p>
              ขนมปัง {state.bread} คน · ปลา {state.fish} คน
              {state.none > 0 && ` · ยังไม่มีทีม ${state.none} คน ไม่นับให้ฝ่ายไหน`}
            </p>
          </div>
        )}

        <div className={styles.actions}>
          {playing && (
            <button className={styles.button} onClick={() => setView({ ...view, index: timeline.steps.length - 1, playing: false })}>
              ข้ามไปผลสุดท้าย
            </button>
          )}
          {done && timeline.steps.length > 0 && (
            <button className={styles.button} onClick={() => setView({ ...view, index: -1, playing: true })}>
              เล่นซ้ำ
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
