"use client";

import { useState, type FormEvent } from "react";
import { NICKNAME_MAX } from "@/lib/nickname";
import { meStore, type Me } from "./me-store";
import styles from "./my-team.module.css";

// ตั้งชื่อเล่นครั้งแรก (เต็มจอ ก่อนเห็นทีม) หรือแก้ทีหลัง (ใน sheet)
// เพื่อนค้นหาคุณด้วยชื่อนี้ตอนเลือกว่าใครอธิษฐานเผื่อ ซ้ำกับคนอื่นได้

const REQUEST_TIMEOUT_MS = 8_000;
const ATTEMPTS = 3;

export function NicknameForm({
  initial,
  onDone,
  onCancel,
}: {
  initial: string;
  onDone: () => void;
  /** มีเฉพาะตอนแก้ชื่อ ตั้งครั้งแรกต้องตั้งก่อนเล่น */
  onCancel?: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nickname = value.trim();
    if (!nickname || saving) return;
    setSaving(true);
    setError(null);
    // ส่งซ้ำได้อย่างปลอดภัย: ตั้งชื่อเดิมซ้ำก็ได้ผลเหมือนเดิม
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      try {
        const res = await fetch("/api/nickname", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nickname }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (res.status === 400) {
          setError(`ชื่อเล่นต้องมี 1 ถึง ${NICKNAME_MAX} ตัวอักษร`);
          break;
        }
        if (res.ok) {
          const { saved, ...me }: Me & { saved: boolean } = await res.json();
          meStore.set(me);
          if (saved) onDone();
          else setError("เกมจบแล้ว เปลี่ยนชื่อเล่นไม่ได้");
          setSaving(false);
          return;
        }
      } catch {
        // timeout หรือเน็ตหลุด ลองใหม่
      }
    }
    setError((e) => e ?? "สัญญาณไม่ดี ยังบันทึกไม่ได้ กดอีกครั้งได้เลย");
    setSaving(false);
  }

  return (
    <form className={styles.nickname} onSubmit={submit}>
      <label htmlFor="nickname">ชื่อเล่นของคุณ</label>
      <input
        id="nickname"
        className={styles.search}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={NICKNAME_MAX * 3}
        placeholder="เช่น ต้น"
        autoComplete="nickname"
        enterKeyHint="done"
        autoFocus
      />
      <p className={styles.rule}>เพื่อนจะค้นหาคุณด้วยชื่อนี้ ตอนเลือกว่าใครอธิษฐานเผื่อ</p>
      {error && (
        <p className={styles.sheetError} role="alert">
          {error}
        </p>
      )}
      <button className={styles.prayedFor} disabled={saving || !value.trim()}>
        {saving ? "กำลังบันทึก…" : onCancel ? "บันทึก" : "เข้าเกม"}
      </button>
      {onCancel && !saving && (
        <button type="button" className={styles.ghost} onClick={onCancel}>
          ยกเลิก
        </button>
      )}
    </form>
  );
}
