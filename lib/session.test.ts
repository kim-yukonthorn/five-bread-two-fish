import assert from "node:assert/strict";
import { test } from "node:test";

process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-1234";

const ID = "3f2b8c1e-5d4a-4b6f-9a7e-0c1d2e3f4a5b";
const DAY = 24 * 60 * 60 * 1000;

test("sign แล้ว verify ได้ playerId เดิม", async () => {
  const { signSession, verifySession } = await import("./session");
  assert.equal(verifySession(signSession(ID)), ID);
});

test("แก้ playerId หรือ signature แล้วไม่ผ่าน", async () => {
  const { signSession, verifySession } = await import("./session");
  const token = signSession(ID);
  const [, exp, sig] = token.split(".");
  assert.equal(verifySession(`3f2b8c1e-5d4a-4b6f-9a7e-000000000000.${exp}.${sig}`), null);
  assert.equal(verifySession(`${ID}.${Number(exp) + 999999}.${sig}`), null);
  assert.equal(verifySession(token.slice(0, -2) + "xx"), null);
  assert.equal(verifySession(undefined), null);
  assert.equal(verifySession("garbage"), null);
});

test("หมดอายุหลัง 7 วัน", async () => {
  const { signSession, verifySession } = await import("./session");
  const now = Date.now();
  const token = signSession(ID, now);
  assert.equal(verifySession(token, now + 6 * DAY), ID);
  assert.equal(verifySession(token, now + 8 * DAY), null);
});
