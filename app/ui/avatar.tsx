"use client";

import { useState } from "react";

// รูปโปรไฟล์ LINE ถ้าไม่มีรูป (คนที่ admin เพิ่มให้) หรือโหลดไม่ได้ แสดงตัวอักษรแรกของชื่อในวงกลมแทน
export function Avatar({ name, src, size, className }: { name: string; src: string | null; size: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size, fontSize: size * 0.45 };
  if (!src || failed) {
    return (
      <span className={className} style={style} aria-hidden="true" data-avatar="initial">
        {Array.from(name.trim())[0] ?? "?"}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- รูปโปรไฟล์จาก LINE ขนาดเล็ก ไม่ผ่าน image optimizer
    <img
      className={className}
      style={style}
      src={src}
      alt=""
      loading="lazy"
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
