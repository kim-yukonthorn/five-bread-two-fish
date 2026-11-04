import assert from "node:assert/strict";
import { test } from "node:test";
import { NICKNAME_MAX, cleanNickname } from "./nickname";

test("ตัดช่องว่างหัวท้ายและยุบช่องว่างกลาง", () => {
  assert.equal(cleanNickname("  ต้น  "), "ต้น");
  assert.equal(cleanNickname("พี่   ต้น"), "พี่ ต้น");
});

test("ว่าง ไม่ใช่ข้อความ หรือมีตัวควบคุม ใช้ไม่ได้", () => {
  assert.equal(cleanNickname(""), null);
  assert.equal(cleanNickname("   "), null);
  assert.equal(cleanNickname(42), null);
  assert.equal(cleanNickname("ต้น\u0000"), null);
  assert.equal(cleanNickname("‮ต้น"), null);
});

test("นับความยาวแบบที่ตาเห็น สระและวรรณยุกต์ไทยไม่นับแยก", () => {
  const thai = "สมศรี".repeat(5); // 20 ตัวที่ตาเห็น (ส ม ศ รี) แต่ 25 code point
  assert.equal(cleanNickname(thai), thai);
  assert.equal(cleanNickname("ก".repeat(NICKNAME_MAX + 1)), null);
  assert.equal(cleanNickname("Kim 🌸👨‍👩‍👧"), "Kim 🌸👨‍👩‍👧");
});
