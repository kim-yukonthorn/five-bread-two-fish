import assert from "node:assert/strict";
import { test } from "node:test";
import { assignTeam } from "./assign-team";

test("7 คนแรกได้ขนมปัง 5 ปลา 2 ทุก seed", () => {
  for (let seed = 0; seed < 2000; seed++) {
    const teams = [1, 2, 3, 4, 5, 6, 7].map((seq) => assignTeam(seq, seed));
    assert.equal(teams.filter((t) => t === "bread").length, 5, `seed ${seed}`);
    assert.equal(teams.filter((t) => t === "fish").length, 2, `seed ${seed}`);
  }
});

test("คนที่ 8 เป็นต้นไปยังไม่มีทีม", () => {
  for (const seq of [8, 9, 50, 1000]) assert.equal(assignTeam(seq, 12345), null);
  assert.equal(assignTeam(0, 12345), null);
});

test("seed เดิมได้ผลเดิม และ seed ต่างกันสลับลำดับได้", () => {
  const order = (seed: number) => [1, 2, 3, 4, 5, 6, 7].map((seq) => assignTeam(seq, seed)).join(",");
  assert.equal(order(52), order(52));
  const distinct = new Set(Array.from({ length: 200 }, (_, seed) => order(seed)));
  assert.ok(distinct.size > 5, "ลำดับควรต่างกันไปตาม seed");
});
