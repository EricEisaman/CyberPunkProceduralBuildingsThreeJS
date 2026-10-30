/**
 * Prop kit. Every function draws into the builder's current frame:
 * x along the wall, y up, z out of the wall (towards the street).
 */
import { CylinderGeometry, LatheGeometry, Matrix4, Vector2, Vector3 } from "three";
import type { Builder } from "./builder";
import type { Rng } from "./rng";
import { face, glow, signMaterial, signTexture } from "./signs";

/** wall-mounted AC condenser on a bracket; (x, y) = bottom centre on the wall */
export function acUnit(b: Builder, rng: Rng, x: number, y: number, z: number, s = 1): void {
  const w = 0.82 * s, h = 0.56 * s, d = 0.3 * s;
  const zc = z + 0.06 + d / 2;
  b.pushT(x, y, 0);
  // bracket: two L arms
  for (const sx of [-w * 0.35, w * 0.35]) {
    b.box("metalDark", sx, -0.03, z + 0.2 * s, 0.04, 0.04, 0.42 * s);
    b.barXYZ("metalDark", sx, -0.03, z + 0.38 * s, sx, -0.35 * s, z + 0.02, 0.014, 4);
  }
  b.box("acUnit", 0, h / 2, zc, w, h, d);
  // fan grille ring + spokes + hub
  const fx = -w * 0.14, fy = h / 2, fz = zc + d / 2;
  b.pushT(fx, fy, fz);
  b.push(new Matrix4().makeRotationX(Math.PI / 2));
  b.cyl("grille", 0, 0.005, 0, h * 0.4, 0.02, 16);
  b.cyl("acUnit", 0, 0.012, 0, h * 0.42, 0.012, 16);
  b.cyl("metalDark", 0, 0.02, 0, h * 0.08, 0.03, 10);
  b.pop();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI + rng.next() * 0.2;
    b.boxR("grille", 0, 0, 0.026, h * 0.8, 0.012, 0.008, 0, 0, a);
  }
  for (let i = -3; i <= 3; i++) b.box("grille", 0, (i * h * 0.4) / 3.5, 0.03, h * 0.82 * Math.sqrt(1 - (i / 3.6) ** 2), 0.006, 0.006);
  b.pop();
  // coil fins on the side + control panel
  for (let i = 0; i < 9; i++) b.box("grille", w * 0.3, h * (0.15 + i * 0.085), fz + 0.004, w * 0.25, 0.012, 0.01);
  // pipes into the wall
  b.barXYZ("pipe", w * 0.42, h * 0.2, zc, w * 0.42 + 0.08, h * 0.2, z, 0.018, 6);
  b.barXYZ("rubber", w * 0.42, h * 0.32, zc, w * 0.42 + 0.12, h * 0.32, z, 0.022, 6);
  // drip pipe
  if (rng.chance(0.6)) {
    const len = rng.range(0.4, 1.6);
    b.barXYZ("pipePVC", -w * 0.45, 0, zc, -w * 0.45, -len, zc - 0.05, 0.012, 5);
  }
  b.pop();
}

/** cylindrical water tank on legs, centred at (x, z), standing on y */
export function waterTank(b: Builder, rng: Rng, x: number, y: number, z: number, r: number, h: number): void {
  const legH = rng.range(0.8, 1.6);
  const key = rng.pick(["metalBare", "rust", "paintWhite", "pipe"]);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const lx = x + Math.cos(a) * r * 0.75, lz = z + Math.sin(a) * r * 0.75;
    b.box("metalDark", lx, y + legH / 2, lz, 0.1, legH, 0.1);
  }
  b.barXYZ("metalDark", x - r * 0.53, y + 0.1, z - r * 0.53, x + r * 0.53, y + legH - 0.1, z - r * 0.53, 0.02, 4);
  b.barXYZ("metalDark", x - r * 0.53, y + legH - 0.1, z + r * 0.53, x + r * 0.53, y + 0.1, z + r * 0.53, 0.02, 4);
  b.box("metalDark", x, y + legH, z, r * 1.6, 0.08, r * 1.6);
  b.cyl(key, x, y + legH + h / 2, z, r, h, 20);
  b.cyl(key, x, y + legH + h + 0.08, z, r * 0.85, 0.16, 20);
  b.cyl("metalDark", x, y + legH + h + 0.22, z, r * 0.25, 0.14, 10);
  for (let k = 1; k < 4; k++) b.cyl("metalDark", x, y + legH + (h * k) / 4, z, r + 0.015, 0.05, 20);
  // ladder
  const lz = z + r + 0.08;
  b.box("metalBare", x - 0.18, y + (legH + h) / 2, lz, 0.03, legH + h, 0.03);
  b.box("metalBare", x + 0.18, y + (legH + h) / 2, lz, 0.03, legH + h, 0.03);
  for (let yy = 0.3; yy < legH + h; yy += 0.3) b.box("metalBare", x, y + yy, lz, 0.36, 0.025, 0.025);
  // outlet pipe
  b.barXYZ("pipe", x + r * 0.7, y + legH + 0.1, z, x + r * 0.7, y, z, 0.04, 6);
}

/** satellite dish on a short mast; faces direction ry */
export function dish(b: Builder, x: number, y: number, z: number, r: number, ry: number, tilt = 0.5): void {
  b.cyl("metalDark", x, y + 0.4, z, 0.03, 0.8, 6);
  const pts: Vector2[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push(new Vector2(t * r, t * t * r * 0.35));
  }
  const geo = new LatheGeometry(pts, 20);
  const m = new Matrix4()
    .makeTranslation(x, y + 0.85, z)
    .multiply(new Matrix4().makeRotationY(ry))
    .multiply(new Matrix4().makeRotationX(Math.PI / 2 - tilt));
  b.addRaw("paintWhite", geo, m);
  // feed arm + LNB
  const tip = new Vector3(0, r * 0.75, 0).applyMatrix4(m);
  const base = new Vector3(0, 0, -r * 0.6).applyMatrix4(m);
  b.bar("metalDark", base, tip, 0.012, 4);
  b.sphere("metalDark", tip.x, tip.y, tip.z, 0.05, 6);
}

/** TV / radio antenna mast with crossbars */
export function antenna(b: Builder, rng: Rng, x: number, y: number, z: number, h: number): Vector3 {
  b.cyl("metalBare", x, y + h / 2, z, 0.03, h, 6);
  const n = rng.int(1, 4);
  for (let i = 0; i < n; i++) {
    const yy = y + h * (0.55 + 0.42 * (i / Math.max(1, n)));
    const len = rng.range(0.6, 1.6);
    const ry = rng.range(0, Math.PI);
    b.box("metalBare", x, yy, z, len, 0.025, 0.025, ry);
    for (let k = -2; k <= 2; k++) {
      const o = (k / 2) * len * 0.45;
      b.box("metalBare", x + Math.cos(ry) * o, yy, z - Math.sin(ry) * o, 0.015, 0.015, len * 0.4, ry);
    }
  }
  // guy wires
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + rng.next();
    b.barXYZ("rubber", x, y + h * 0.7, z, x + Math.cos(a) * h * 0.35, y, z + Math.sin(a) * h * 0.35, 0.005, 3);
  }
  return new Vector3(x, y + h, z);
}

/** red blinking aircraft beacon */
export function beacon(b: Builder, x: number, y: number, z: number, phase = 0): void {
  b.sphere("emit:ff1a1a:9", x, y, z, 0.09, 8);
  glow(b, x, y, z + 0.01, 1.4, 1.4, "ff2020", 0.5);
  void phase;
}

/** vertical pipe run with brackets every `step` metres */
export function pipeRun(b: Builder, x: number, y0: number, y1: number, z: number, r: number, key = "pipe", step = 2.9): void {
  b.cyl(key, x, (y0 + y1) / 2, z, r, y1 - y0, 8);
  for (let y = y0 + 0.4; y < y1; y += step) {
    b.box("metalDark", x, y, z - r / 2, r * 2.6, 0.05, r * 1.4 + z);
  }
}

/** pipe with elbows following a polyline (local points) */
export function pipePath(b: Builder, pts: Vector3[], r: number, key = "pipe"): void {
  for (let i = 1; i < pts.length; i++) b.bar(key, pts[i - 1], pts[i], r, 8);
  for (let i = 1; i < pts.length - 1; i++) b.sphere(key, pts[i].x, pts[i].y, pts[i].z, r * 1.15, 8);
}

/** a bundle of 2-4 sagging cables between two points */
export function cableBundle(b: Builder, rng: Rng, a: Vector3, c: Vector3, sag: number): void {
  const n = rng.int(1, 4);
  for (let i = 0; i < n; i++) {
    const o = new Vector3(rng.range(-0.06, 0.06), rng.range(-0.06, 0.06), rng.range(-0.06, 0.06));
    b.cable("rubber", a.clone().add(o), c.clone().add(o), sag * rng.range(0.8, 1.3), rng.range(0.008, 0.02));
  }
}

/** railing along x at height y (local), from x0 to x1 */
export function railing(b: Builder, x0: number, x1: number, y: number, z: number, h = 1.0, key = "metalDark"): void {
  b.box(key, (x0 + x1) / 2, y + h, z, Math.abs(x1 - x0), 0.04, 0.05);
  b.box(key, (x0 + x1) / 2, y + h * 0.5, z, Math.abs(x1 - x0), 0.025, 0.025);
  const n = Math.max(1, Math.round(Math.abs(x1 - x0) / 1.2));
  for (let i = 0; i <= n; i++) b.box(key, x0 + ((x1 - x0) * i) / n, y + h / 2, z, 0.035, h, 0.035);
}

/** window security cage on the wall around a window (w x h at x,y) */
export function cage(b: Builder, rng: Rng, x: number, y: number, w: number, h: number, depth: number): void {
  const key = rng.chance(0.4) ? "rust" : "metalBare";
  const x0 = x - w / 2 - 0.05, x1 = x + w / 2 + 0.05, y0 = y - 0.08, y1 = y + h + 0.08;
  // frame
  for (const yy of [y0, y1]) b.box(key, x, yy, depth, x1 - x0, 0.03, 0.03);
  for (const xx of [x0, x1]) b.box(key, xx, (y0 + y1) / 2, depth, 0.03, y1 - y0, 0.03);
  for (const xx of [x0, x1]) for (const yy of [y0, y1]) b.box(key, xx, yy, depth / 2, 0.025, 0.025, depth);
  b.box(key, x, y0, depth / 2, x1 - x0, 0.02, depth); // floor tray
  // bars
  const n = Math.round((x1 - x0) / 0.12);
  for (let i = 1; i < n; i++) b.box(key, x0 + ((x1 - x0) * i) / n, (y0 + y1) / 2, depth, 0.014, y1 - y0, 0.014);
  b.box(key, x, y0 + (y1 - y0) * 0.5, depth, x1 - x0, 0.02, 0.02);
  // stuff on the tray
  if (rng.chance(0.5)) {
    for (let i = 0; i < rng.int(1, 3); i++) {
      const px = rng.range(x0 + 0.2, x1 - 0.2);
      b.box("pot", px, y0 + 0.1, depth * 0.5, 0.18, 0.18, 0.18);
      b.blob("plant", px, y0 + 0.3, depth * 0.5, 0.18, 0.22, 0.16, 6);
    }
  }
}

/** laundry pole sticking out of the wall with clothes */
export function laundry(b: Builder, rng: Rng, x: number, y: number, w: number, out: number): void {
  b.barXYZ("metalBare", x - w / 2, y, 0.05, x - w / 2, y, out, 0.012, 4);
  b.barXYZ("metalBare", x + w / 2, y, 0.05, x + w / 2, y, out, 0.012, 4);
  b.barXYZ("metalBare", x - w / 2, y, out, x + w / 2, y, out, 0.012, 4);
  b.barXYZ("metalBare", x - w / 2, y, out * 0.6, x + w / 2, y, out * 0.6, 0.01, 4);
  for (const zz of [out, out * 0.6]) {
    let cx = x - w / 2 + 0.1;
    while (cx < x + w / 2 - 0.2) {
      const cw = rng.range(0.2, 0.5);
      const ch = rng.range(0.3, 0.75);
      if (rng.chance(0.75)) b.box("cloth" + rng.int(0, 5), cx + cw / 2, y - ch / 2, zz, cw, ch, 0.015, rng.range(-0.08, 0.08));
      cx += cw + rng.range(0.03, 0.15);
    }
  }
}

/** louvred vent */
export function vent(b: Builder, x: number, y: number, z: number, w: number, h: number): void {
  b.box("frame", x, y, z, w + 0.06, h + 0.06, 0.06);
  const n = Math.max(2, Math.round(h / 0.07));
  for (let i = 0; i < n; i++) b.boxR("metalPanel", x, y - h / 2 + (h * (i + 0.5)) / n, z + 0.04, w, 0.012, h / n * 1.3, -0.7, 0, 0);
}

/** electric meter box / junction box cluster */
export function junction(b: Builder, rng: Rng, x: number, y: number): void {
  const n = rng.int(1, 4);
  for (let i = 0; i < n; i++) {
    const w = rng.range(0.25, 0.5), h = rng.range(0.3, 0.6);
    b.box(rng.pick(["paintWhite", "metalPanel", "acUnit"]), x + i * 0.55, y, 0.08, w, h, 0.16);
    if (rng.chance(0.4)) b.sphere("emit:33ff66:6", x + i * 0.55 + w * 0.3, y + h * 0.35, 0.17, 0.012, 4);
  }
  b.barXYZ("rubber", x, y + 0.3, 0.1, x, y + rng.range(1.5, 3), 0.1, 0.02, 5);
}

/** vending machine standing on the ground against the wall; x = centre */
export function vendingMachine(b: Builder, rng: Rng, x: number, z: number, color: string): void {
  const w = 1.0, h = 1.85, d = 0.75;
  b.pushT(x, 0, z + d / 2);
  b.box(rng.pick(["vending", "paintRed", "paintWhite"]), 0, h / 2, 0, w, h, d);
  b.box("frame", 0, h - 0.08, d / 2 + 0.01, w, 0.12, 0.02);
  // glowing product window
  b.box("emit:" + color + ":1.6", -0.08, h * 0.62, d / 2 + 0.004, w * 0.7, h * 0.52, 0.01);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 6; c++) {
      const cc = rng.pick(["ff3b3b", "ffd23f", "3bb0ff", "ffffff", "3bff8a"]);
      b.box("emit:" + cc + ":0.8", -0.08 - w * 0.3 + c * w * 0.12, h * 0.42 + r * h * 0.12, d / 2 + 0.03, 0.06, 0.13, 0.05);
    }
  }
  b.box("frame", w * 0.35, h * 0.55, d / 2 + 0.02, 0.16, 0.4, 0.03);
  b.box("emit:33ff66:3", w * 0.35, h * 0.68, d / 2 + 0.035, 0.08, 0.04, 0.01);
  b.box("metalDark", -0.08, h * 0.17, d / 2 + 0.02, w * 0.6, 0.18, 0.04);
  glow(b, 0, 0.02, d / 2 + 0.8, 2.2, 1.6, color, 0.25, 0, -Math.PI / 2);
  b.pop();
}

/** roll-up shutter shopfront, closed fraction `closed` (0..1); x = centre, w wide, h tall */
export function shutter(b: Builder, x: number, w: number, h: number, closed: number): void {
  const sh = h * closed;
  b.box("shutter", x, h - sh / 2, 0.06, w, sh, 0.03);
  b.box("metalDark", x, h + 0.15, 0.12, w + 0.1, 0.32, 0.3); // roll box
  b.box("metalDark", x - w / 2 - 0.04, h / 2, 0.06, 0.06, h, 0.08);
  b.box("metalDark", x + w / 2 + 0.04, h / 2, 0.06, 0.06, h, 0.08);
  b.box("metalDark", x, h - sh, 0.075, w, 0.05, 0.05);
}

/** fabric awning sloping out from the wall */
export function awning(b: Builder, x: number, y: number, w: number, depth: number, key: string): void {
  const drop = depth * 0.45;
  const len = Math.hypot(depth, drop);
  const ang = Math.atan2(drop, depth);
  b.boxR(key, x, y - drop / 2, depth / 2, w, 0.02, len, ang, 0, 0);
  b.box(key, x, y - drop - 0.12, depth, w, 0.25, 0.02);
  b.barXYZ("metalDark", x - w / 2, y, 0.05, x - w / 2, y - drop, depth, 0.015, 4);
  b.barXYZ("metalDark", x + w / 2, y, 0.05, x + w / 2, y - drop, depth, 0.015, 4);
}

/** string of glowing paper lanterns between two points */
export function lanterns(b: Builder, rng: Rng, a: Vector3, c: Vector3, color: string, sag = 0.4): void {
  b.cable("rubber", a, c, sag, 0.008);
  const n = Math.max(2, Math.round(a.distanceTo(c) / 0.75));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const p = a.clone().lerp(c, t);
    p.y -= sag * 4 * t * (1 - t) + 0.22;
    const col = rng.chance(0.15) ? "ffd9a0" : color;
    b.blob("emit:" + col + ":2.6", p.x, p.y, p.z, 0.14, 0.19, 0.14, 8);
    b.cyl("metalDark", p.x, p.y + 0.2, p.z, 0.06, 0.04, 8);
    b.cyl("metalDark", p.x, p.y - 0.2, p.z, 0.06, 0.04, 8);
  }
}

/** street lamp at (x, z) on the ground, arm pointing towards ry */
export function streetLamp(b: Builder, x: number, z: number, ry: number, color = "cfe6ff"): void {
  b.pushT(x, 0, z, ry);
  b.cyl("metalDark", 0, 0.3, 0, 0.14, 0.6, 10);
  b.cyl("metalDark", 0, 3.6, 0, 0.07, 7.2, 10);
  b.barXYZ("metalDark", 0, 7.1, 0, 0, 7.4, 1.4, 0.05, 6);
  b.box("metalDark", 0, 7.4, 1.8, 0.35, 0.12, 0.9);
  b.box("emit:" + color + ":8", 0, 7.33, 1.8, 0.25, 0.02, 0.75);
  b.light(0, 7.0, 1.8, "#" + color, 30, 16);
  glow(b, 0, 0.03, 1.8, 7, 7, color, 0.12, 0, -Math.PI / 2);
  b.pop();
}

/** where a pole's wires attach: power lines on the crossarms, telecom on the lower bracket */
export interface PoleWires {
  power: Vector3[];
  tel: Vector3[];
}

/**
 * Tokyo-style utility pole at (x, z) on the ground. Local +z faces the road:
 * the crossarms run across the street (so the wires run along it) and the
 * lamp arm reaches out over the road.
 */
export function wirePole(b: Builder, rng: Rng, x: number, z: number, ry: number, o: { lamp?: string | null; light?: boolean; transformer?: boolean } = {}): PoleWires {
  const h = rng.range(10.2, 11.6);
  const out: PoleWires = { power: [], tel: [] };
  b.pushT(x, 0, z, ry);
  // tapered concrete pole + cap
  b.addRaw("concreteLight", new CylinderGeometry(0.13, 0.18, h, 12).translate(0, h / 2, 0));
  b.cyl("metalDark", 0, h + 0.04, 0, 0.14, 0.08, 10);
  // two power crossarms, braced, four insulators each
  for (const [k, yy] of [h - 0.35, h - 1.2].entries()) {
    const half = k === 0 ? 1.15 : 0.95;
    b.box("metalDark", 0, yy, 0, 0.09, 0.09, half * 2 + 0.2);
    b.barXYZ("metalDark", 0, yy - 0.7, 0, 0, yy - 0.05, half * 0.7, 0.018, 4);
    b.barXYZ("metalDark", 0, yy - 0.7, 0, 0, yy - 0.05, -half * 0.7, 0.018, 4);
    for (const zz of [-half, -half * 0.35, half * 0.35, half]) {
      b.cyl("paintWhite", 0, yy + 0.12, zz, 0.045, 0.16, 8);
      b.cyl("paintWhite", 0, yy + 0.06, zz, 0.06, 0.03, 8);
      out.power.push(b.world(0, yy + 0.21, zz));
    }
  }
  // telecom bracket with black cable clamps
  const ty = h - 3.3;
  b.box("metalDark", 0, ty, 0.35, 0.07, 0.07, 1.0);
  for (const zz of [0.0, 0.4, 0.8]) {
    b.box("rubber", 0, ty - 0.06, zz, 0.12, 0.1, 0.1);
    out.tel.push(b.world(0, ty - 0.08, zz));
  }
  // transformer can + drop leads to the arm above
  if (o.transformer) {
    b.box("metalDark", 0, h - 2.55, -0.45, 0.1, 0.1, 0.9);
    for (const [i, dx] of [-0.32, 0.32].entries()) {
      b.cyl("pipe", dx, h - 2.15, -0.55, 0.26, 0.8, 14);
      b.cyl("metalDark", dx, h - 1.73, -0.55, 0.27, 0.06, 14);
      b.cable("rubber", new Vector3(dx, h - 1.72, -0.55), new Vector3(0, h - 0.99, -0.95 + i * 0.6), 0.12, 0.012);
    }
    for (let i = 0; i < 3; i++) b.cable("rubber", new Vector3(0.25, h - 2.4, -0.5), new Vector3(0.05, ty - 0.5 - i * 0.4, 0.05), 0.2, 0.014);
  }
  // street lamp arm reaching over the road
  if (o.lamp) {
    const ly = rng.range(6.6, 7.2);
    b.barXYZ("metalDark", 0, ly - 0.6, 0.12, 0, ly + 0.15, 2.3, 0.045, 6);
    b.barXYZ("metalDark", 0, ly - 0.15, 0.12, 0, ly + 0.05, 1.4, 0.03, 5);
    b.box("metalDark", 0, ly + 0.12, 2.55, 0.32, 0.12, 0.75);
    b.box("emit:" + o.lamp + ":8", 0, ly + 0.05, 2.55, 0.24, 0.02, 0.62);
    if (o.light) b.light(0, ly - 0.4, 2.6, "#" + o.lamp, 34, 18);
    glow(b, 0, 0.04, 3.2, 8, 9, o.lamp, 0.13, 0, -Math.PI / 2);
  }
  // street-level bits: yellow guard sleeve, step bolts, address plate, junction box
  b.addRaw("paintYellow", new CylinderGeometry(0.185, 0.19, 1.8, 12, 1, true).translate(0, 0.9, 0));
  for (let i = 0; i < 8; i++) b.box("metalBare", (i % 2 ? 0.17 : -0.17), 2.6 + i * 0.42, 0, 0.18, 0.025, 0.025);
  b.box("paintWhite", 0, 2.3, 0.18, 0.2, 0.55, 0.02);
  if (rng.chance(0.4)) b.box("metalPanel", 0, 3.4, -0.24, 0.32, 0.45, 0.18);
  b.pop();
  return out;
}

/** the wires between two poles: every power line, the telecom bundle, and a few strays */
export function wireSpan(b: Builder, rng: Rng, a: PoleWires, c: PoleWires, sagScale = 1): void {
  const n = Math.min(a.power.length, c.power.length);
  for (let k = 0; k < n; k++) {
    if (rng.chance(0.12)) continue;
    b.cable("rubber", a.power[k], c.power[k], rng.range(0.35, 0.7) * sagScale, 0.011);
  }
  const m = Math.min(a.tel.length, c.tel.length);
  for (let k = 0; k < m; k++) {
    const thick = rng.range(0.018, 0.035);
    b.cable("rubber", a.tel[k], c.tel[k], rng.range(0.8, 1.5) * sagScale, thick);
    if (rng.chance(0.5)) b.cable("rubber", a.tel[k].clone().add(new Vector3(0, -0.05, 0)), c.tel[k].clone().add(new Vector3(0, -0.07, 0)), rng.range(1.0, 1.8) * sagScale, thick * 0.6);
  }
  // strays: crossing from one level to another
  for (let i = 0; i < rng.int(1, 3); i++) {
    b.cable("rubber", rng.pick(a.power), rng.pick(c.tel), rng.range(0.6, 1.4) * sagScale, 0.01);
  }
}

/** ground-level street clutter: trash bags, crates, a bike */
export function clutter(b: Builder, rng: Rng, x: number, z: number): void {
  const k = rng.int(0, 2);
  if (k === 0) {
    for (let i = 0; i < rng.int(2, 5); i++) b.blob("trash", x + rng.range(-0.5, 0.5), 0.22, z + rng.range(-0.3, 0.3), 0.3, 0.26, 0.28, 7);
  } else if (k === 1) {
    for (let i = 0; i < rng.int(1, 3); i++) {
      const yy = i * 0.32;
      b.box(rng.pick(["paintRed", "paintYellow", "awningBlue"]), x + rng.range(-0.05, 0.05), yy + 0.16, z, 0.5, 0.3, 0.36, rng.range(-0.2, 0.2));
    }
  } else {
    b.box("pipePVC", x, 0.45, z, 0.5, 0.9, 0.5);
    b.cyl("metalDark", x, 0.92, z, 0.27, 0.05, 10);
  }
}

/** small lit number / name plate */
export function plate(b: Builder, text: string, color: string, x: number, y: number, z: number, w: number): void {
  const { tex, aspect } = signTexture(text, "lightbox", color, false, "111111");
  const h = w / aspect;
  b.box("frame", x, y, z - 0.02, w + 0.04, h + 0.04, 0.04);
  face(b, signMaterial(tex, 1.6, 0), x, y, z + 0.002, w, h);
}
