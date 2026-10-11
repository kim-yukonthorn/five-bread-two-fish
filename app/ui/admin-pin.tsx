"use client";

import type { FormEvent } from "react";
import styles from "./admin-pin.module.css";

// PIN ของหน้า admin และหน้าประกาศผล จำไว้ในเครื่องหลังใส่ครั้งแรก
// ถ้า server ไม่ได้ตั้ง ADMIN_PIN จะไม่มีการถามเลย

const KEY = "fb_admin_pin";
let cached: string | null | undefined;

export const adminPin = {
  get(): string {
    if (cached === undefined) {
      try {
        cached = localStorage.getItem(KEY);
      } catch {
        cached = null;
      }
    }
    return cached ?? "";
  },
  set(value: string) {
    cached = value;
    try {
      localStorage.setItem(KEY, value);
    } catch {
      // จำไม่ได้ก็ใช้ได้จนกว่าจะปิดหน้า
    }
  },
};

export function pinHeaders(): Record<string, string> {
  const pin = adminPin.get();
  return pin ? { "x-admin-pin": encodeURIComponent(pin) } : {};
}

export function PinForm({ wrong, onSubmit }: { wrong: boolean; onSubmit: (pin: string) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const pin = String(new FormData(event.currentTarget).get("pin") ?? "").trim();
    if (pin) onSubmit(pin);
  }
  return (
    <main className={styles.page}>
      <form className={styles.form} onSubmit={submit}>
        <label htmlFor="pin">ใส่ PIN ของผู้ดูแล</label>
        <input id="pin" name="pin" type="password" autoComplete="off" autoFocus />
        {wrong && (
          <p className={styles.wrong} role="alert">
            PIN ไม่ถูกต้อง
          </p>
        )}
        <button>เข้า</button>
      </form>
    </main>
  );
}
