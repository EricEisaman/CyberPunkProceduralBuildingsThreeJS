/**
 * Single-stroke neon font: each glyph is a few polylines on a 4 x 6 grid,
 * bent into glass tubes with rounded corners, like real neon.
 */
import { CatmullRomCurve3, TubeGeometry, Vector3 } from "three";
import type { Builder } from "./builder";

type Stroke = number[][];
const O: Stroke = [[1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 1], [3, 0], [1, 0]];
const P_: Stroke = [[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]];

export const GLYPHS: Record<string, Stroke[]> = {
  A: [[[0, 0], [0, 4], [2, 6], [4, 4], [4, 0]], [[0, 2.6], [4, 2.6]]],
  B: [[[0, 3], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3], [0, 0], [3, 0], [4, 1], [4, 2], [3, 3]]],
  C: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1]]],
  D: [[[0, 0], [0, 6], [2.5, 6], [4, 4.5], [4, 1.5], [2.5, 0], [0, 0]]],
  E: [[[4, 6], [0, 6], [0, 0], [4, 0]], [[0, 3], [3, 3]]],
  F: [[[4, 6], [0, 6], [0, 0]], [[0, 3], [3, 3]]],
  G: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1], [4, 3], [2, 3]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  I: [[[1, 6], [3, 6]], [[2, 6], [2, 0]], [[1, 0], [3, 0]]],
  J: [[[4, 6], [4, 1], [3, 0], [1, 0], [0, 1]]],
  K: [[[0, 0], [0, 6]], [[4, 6], [0, 2.4]], [[1.4, 3.6], [4, 0]]],
  L: [[[0, 6], [0, 0], [4, 0]]],
  M: [[[0, 0], [0, 6], [2, 3], [4, 6], [4, 0]]],
  N: [[[0, 0], [0, 6], [4, 0], [4, 6]]],
  O: [O],
  P: [P_],
  Q: [O, [[2.5, 1.5], [4.2, -0.3]]],
  R: [P_, [[2, 3], [4, 0]]],
  S: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 4], [1, 3], [3, 3], [4, 2], [4, 1], [3, 0], [1, 0], [0, 1]]],
  T: [[[0, 6], [4, 6]], [[2, 6], [2, 0]]],
  U: [[[0, 6], [0, 1], [1, 0], [3, 0], [4, 1], [4, 6]]],
  V: [[[0, 6], [2, 0], [4, 6]]],
  W: [[[0, 6], [1, 0], [2, 4], [3, 0], [4, 6]]],
  X: [[[0, 6], [4, 0]], [[4, 6], [0, 0]]],
  Y: [[[0, 6], [2, 3], [4, 6]], [[2, 3], [2, 0]]],
  Z: [[[0, 6], [4, 6], [0, 0], [4, 0]]],
  "0": [O, [[1, 1.5], [3, 4.5]]],
  "1": [[[1, 5], [2, 6], [2, 0]], [[1, 0], [3, 0]]],
  "2": [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [0, 0], [4, 0]]],
  "3": [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [1.5, 3]], [[3, 3], [4, 2], [4, 1], [3, 0], [1, 0], [0, 1]]],
  "4": [[[3, 0], [3, 6], [0, 2], [4, 2]]],
  "5": [[[4, 6], [0, 6], [0, 3.5], [3, 3.5], [4, 2.5], [4, 1], [3, 0], [0, 0]]],
  "6": [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2.5], [3, 3.5], [0, 3.5]]],
  "7": [[[0, 6], [4, 6], [1.5, 0]]],
  "8": [[[1, 3], [0, 4], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [1, 3], [0, 2], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3]]],
  "9": [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 3.5], [1, 2.5], [4, 2.5]]],
  "-": [[[1, 3], [3, 3]]],
  "/": [[[0, 0], [4, 6]]],
  "!": [[[2, 6], [2, 1.8]], [[2, 0.5], [2, 0]]],
  "♥": [[[2, 0.4], [0, 3], [0, 4.6], [1, 5.6], [2, 4.6], [3, 5.6], [4, 4.6], [4, 3], [2, 0.4]]],
  ">": [[[0.5, 6], [3.5, 3], [0.5, 0]]],
  "<": [[[3.5, 6], [0.5, 3], [3.5, 0]]],
};

export const NEON_CHARS = Object.keys(GLYPHS).join("");

const ADV = 5.4; // glyph advance in grid units

/** points of a polyline with rounded (filleted) corners */
function fillet(stroke: Stroke, r: number): Vector3[] {
  const pts = stroke.map(p => new Vector3(p[0], p[1], 0));
  const closed = pts.length > 2 && pts[0].distanceTo(pts[pts.length - 1]) < 1e-3;
  const out: Vector3[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const isEnd = !closed && (i === 0 || i === n - 1);
    if (isEnd || (closed && i === n - 1)) {
      if (!(closed && i === n - 1)) out.push(p.clone());
      continue;
    }
    const prev = closed && i === 0 ? pts[n - 2] : pts[i - 1];
    const next = pts[i + 1];
    const dIn = p.clone().sub(prev);
    const dOut = next.clone().sub(p);
    const rr = Math.min(r, dIn.length() * 0.45, dOut.length() * 0.45);
    dIn.normalize();
    dOut.normalize();
    const a = p.clone().addScaledVector(dIn, -rr);
    const b = p.clone().addScaledVector(dOut, rr);
    for (let k = 0; k <= 3; k++) {
      const t = k / 3;
      // quadratic bezier a -> p -> b
      const q = a.clone().multiplyScalar((1 - t) * (1 - t)).addScaledVector(p, 2 * (1 - t) * t).addScaledVector(b, t * t);
      out.push(q);
    }
  }
  if (closed) out.push(out[0].clone());
  // densify long straight runs so the spline stays straight
  const dense: Vector3[] = [];
  for (let i = 0; i < out.length; i++) {
    if (i > 0) {
      const a = out[i - 1], b = out[i];
      const len = a.distanceTo(b);
      const steps = Math.floor(len / 1.0);
      for (let k = 1; k < steps; k++) dense.push(a.clone().lerp(b, k / steps));
    }
    dense.push(out[i]);
  }
  return dense;
}

export function neonTextWidth(text: string, height: number): number {
  const s = height / 6;
  return Math.max(0, text.length * ADV - (ADV - 4)) * s;
}

/**
 * Bend `text` into neon tubes in the builder's current frame. The text's
 * bottom-left is at (x, y, z), it reads along +x and faces +z.
 * vertical = letters stacked top to bottom.
 */
export function neonText(
  b: Builder, text: string, x: number, y: number, z: number, height: number, key: string,
  opts: { vertical?: boolean; brokenKey?: string; brokenIndex?: number } = {},
): { w: number; h: number } {
  const s = height / 6;
  const r = height * 0.036;
  const chars = [...text.toUpperCase()];
  let i = 0;
  for (const ch of chars) {
    const strokes = GLYPHS[ch];
    const gx = opts.vertical ? 0 : i * ADV;
    const gy = opts.vertical ? -(i * 7.6) : 0;
    const k = opts.brokenKey && opts.brokenIndex === i ? opts.brokenKey : key;
    if (strokes) {
      for (const st of strokes) {
        const pts = fillet(st, 0.9).map(p => new Vector3(x + (p.x + gx) * s, y + (p.y + gy) * s, z));
        const closed = st.length > 2 && st[0][0] === st[st.length - 1][0] && st[0][1] === st[st.length - 1][1];
        if (closed) pts.pop();
        const curve = new CatmullRomCurve3(pts, closed, "centripetal");
        const segs = Math.min(120, Math.max(8, Math.round(curve.getLength() / (s * 0.35))));
        b.addRaw(k, new TubeGeometry(curve, segs, r, 6, closed));
      }
    }
    i++;
  }
  const w = opts.vertical ? 4 * s : neonTextWidth(text, height);
  const h = opts.vertical ? (chars.length * 7.6 - 1.6) * s : height;
  return { w, h };
}
