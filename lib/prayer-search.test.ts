import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePrayerQuery } from "./prayer-search";

test("ช่องว่างหรือเว้นวรรคอย่างเดียว ไม่ค้นหา", () => {
  assert.equal(parsePrayerQuery(""), null);
  assert.equal(parsePrayerQuery("   "), null);
});

test("ตัวเลขล้วนค้นด้วยเลขผู้เล่น รวมเลขไทย", () => {
  assert.deepEqual(parsePrayerQuery(" 27 "), { kind: "seq", seq: 27 });
  assert.deepEqual(parsePrayerQuery("๒๗"), { kind: "seq", seq: 27 });
  assert.deepEqual(parsePrayerQuery("007"), { kind: "seq", seq: 7 });
});

test("ข้อความอื่นค้นชื่อบางส่วน", () => {
  assert.deepEqual(parsePrayerQuery("สม"), { kind: "name", pattern: "%สม%" });
  assert.deepEqual(parsePrayerQuery("Kim 2"), { kind: "name", pattern: "%Kim 2%" });
});

test("escape อักขระพิเศษของ LIKE", () => {
  assert.deepEqual(parsePrayerQuery("50%_a\\b"), { kind: "name", pattern: "%50\\%\\_a\\\\b%" });
});
