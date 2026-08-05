/** Deterministic PRNG utilities so the generated mock dataset is stable across reloads. */

export type Rng = () => number;

/** mulberry32 seeded PRNG — small, fast, good-enough distribution for fixture generation. */
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomInt(rng: Rng, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function randomFloat(rng: Rng, min: number, max: number): number {
  return rng() * (max - min) + min;
}

export function chance(rng: Rng, probability: number): boolean {
  return rng() < probability;
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[randomInt(rng, 0, items.length - 1)];
}

export function pickN<T>(rng: Rng, items: readonly T[], count: number): T[] {
  const pool = [...items];
  const result: T[] = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const idx = randomInt(rng, 0, pool.length - 1);
    result.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return result;
}

/** Weighted pick: `weights` must have the same length as `items`. */
export function pickWeighted<T>(
  rng: Rng,
  items: readonly T[],
  weights: readonly number[],
): T {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = rng() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) {
      return items[i];
    }
  }
  return items[items.length - 1];
}

export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(rng, 0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

let uidCounter = 0;
/** Stable, human-scannable fake vCenter MoRef-style ID. */
export function fakeMoRef(prefix: string, index: number): string {
  return `${prefix}-${index.toString(36)}${(uidCounter++).toString(36)}`;
}

export function pad(num: number, width: number): string {
  return String(num).padStart(width, "0");
}
