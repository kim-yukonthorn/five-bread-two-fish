"use client";

import { useSyncExternalStore } from "react";

function subscribe(onTick: () => void) {
  const id = setInterval(onTick, 500);
  return () => clearInterval(id);
}

/** เวลาของเครื่องเป็นวินาที อัปเดตทุกครึ่งวินาที (0 ระหว่าง render ฝั่ง server) */
export function useClockSeconds(): number {
  return useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / 1000),
    () => 0,
  );
}

export function formatCountdown(msLeft: number): string {
  const s = Math.max(0, Math.ceil(msLeft / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
