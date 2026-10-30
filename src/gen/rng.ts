/** Small seeded random generator (mulberry32) with the helpers the generators use. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = (seed >>> 0) ^ 0x9e3779b9;
    for (let i = 0; i < 4; i++) this.next();
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  /** a child generator, so one feature's randomness doesn't shift another's */
  fork(salt: number): Rng {
    return new Rng(Math.floor(this.next() * 4294967296) ^ Math.imul(salt, 2654435761));
  }
}
