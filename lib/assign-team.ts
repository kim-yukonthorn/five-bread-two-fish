export type Team = "bread" | "fish";

// 7 คนแรกที่ลงทะเบียน: ขนมปัง 5 ปลา 2 (สุ่มลำดับด้วย seed ของเกม)
const SEEDS: readonly Team[] = ["bread", "bread", "bread", "bread", "bread", "fish", "fish"];

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** seq เริ่มที่ 1 คนที่ 8 เป็นต้นไปได้ null (ยังไม่มีทีม) */
export function assignTeam(seq: number, seed: number): Team | null {
  if (seq < 1 || seq > SEEDS.length) return null;
  const rand = mulberry32(seed);
  const deck = [...SEEDS];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck[seq - 1];
}
