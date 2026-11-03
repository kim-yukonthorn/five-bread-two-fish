"use client";

import { useEffect, useState } from "react";
import type { PrayerCandidate } from "@/lib/players";
import styles from "./my-team.module.css";
import { Avatar } from "./ui/avatar";
import { TEAM } from "./ui/teams";

// ค้นคนที่อธิษฐานเผื่อจากช่องเดียว: เลขบนจอของเขา หรือชื่อ LINE บางส่วน
// server ส่งเฉพาะคนทีมตรงข้ามไม่เกิน 8 คน และต้องพิมพ์ก่อน จึงไม่มีรายชื่อทั้งทีมให้นับจำนวน

const DEBOUNCE_MS = 300;
const REQUEST_TIMEOUT_MS = 8_000;

type Search =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; q: string; players: PrayerCandidate[] }
  | { kind: "error" };

export function PrayerPicker({
  query,
  onQuery,
  onPick,
  onClose,
}: {
  query: string;
  onQuery: (q: string) => void;
  onPick: (player: PrayerCandidate) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState<Search>({ kind: "idle" });
  const [retry, setRetry] = useState(0);
  const q = query.trim();

  useEffect(() => {
    if (!q) return;
    // พิมพ์ต่อหรือปิด sheet แล้ว ผลของคำค้นเก่าทิ้งไป (ไม่ใช้ AbortSignal.any เพราะ iOS รุ่นเก่ายังไม่มี)
    let stale = false;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      setSearch({ kind: "loading" });
      timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      fetch(`/api/prayers?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error(`prayers ${res.status}`);
          const data: { players: PrayerCandidate[] } = await res.json();
          if (!stale) setSearch({ kind: "done", q, players: data.players });
        })
        .catch(() => {
          if (!stale) setSearch({ kind: "error" });
        })
        .finally(() => clearTimeout(timeout));
    }, DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
      clearTimeout(timeout);
      controller.abort();
    };
  }, [q, retry]);

  function change(value: string) {
    onQuery(value);
    if (!value.trim()) setSearch({ kind: "idle" });
  }

  const players = search.kind === "done" && search.q === q ? search.players : [];

  return (
    <div className={styles.sheetWrap}>
      <div className={`${styles.sheet} ${styles.pickerSheet}`} role="dialog" aria-modal="true" aria-labelledby="picker-title">
        <h2 id="picker-title">ใครอธิษฐานเผื่อคุณ?</h2>
        <p>พิมพ์เลขบนจอของเขา หรือชื่อ LINE</p>
        <input
          className={styles.search}
          value={query}
          onChange={(e) => change(e.target.value)}
          placeholder="เช่น 27 หรือ สมศรี"
          aria-label="เลขหรือชื่อของคนที่อธิษฐานเผื่อคุณ"
          autoComplete="off"
          autoCorrect="off"
          enterKeyHint="search"
          autoFocus
        />

        <div className={styles.results} aria-live="polite">
          {!q ? null : search.kind === "error" ? (
            <>
              <p>สัญญาณไม่ดี ค้นหาไม่ได้</p>
              <button className={styles.ghost} onClick={() => setRetry((n) => n + 1)}>
                ลองใหม่
              </button>
            </>
          ) : search.kind === "done" && search.q === q && players.length === 0 ? (
            <p>ไม่เจอคนทีมตรงข้ามที่ตรงกับ “{q}” ลองพิมพ์เลขบนจอของเขาแทน</p>
          ) : players.length === 0 ? (
            <p>กำลังค้นหา…</p>
          ) : (
            players.map((p) => (
              <button key={p.id} className={`${styles.person} ${styles[`person_${p.team}`]}`} onClick={() => onPick(p)}>
                <Avatar name={p.name} src={p.pictureUrl} size={48} className={styles.avatar} />
                <span className={styles.personName}>{p.name}</span>
                <span className={styles.personMeta}>
                  เลข {p.seq}
                  <br />
                  ทีม{TEAM[p.team].name}
                </span>
              </button>
            ))
          )}
        </div>

        <button className={styles.ghost} onClick={onClose}>
          ยกเลิก
        </button>
      </div>
    </div>
  );
}
