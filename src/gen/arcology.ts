/**
 * ARCOLOGY: a megacorp headquarters tower.
 *
 * A podium (lobby, canopy, screens) carries a tower of chamfered octagonal
 * floor plates in three setback segments. Long faces are office curtain wall
 * (interior-mapped open-plan floors) between full-height fins; the chamfered
 * corners carry chasing LED lines. Giant animated ad screens hang off the
 * facade, glass elevators run up the side, and the crown has slanted blades,
 * halo rings, a spire with beacons, a helipad and the corp name in neon tubes.
 */
import { BoxGeometry, Mesh, MeshBasicMaterial, OctahedronGeometry, Shape, ExtrudeGeometry, Matrix4, TorusGeometry, Vector2, Color } from "three";
import type { Builder } from "./builder";
import { framedWindow, STYLE, winQuad } from "./facade";
import { PALETTES } from "./materials";
import { neonText, neonTextWidth } from "./neonfont";
import { acUnit, antenna, beacon, railing, vent } from "./props";
import { Rng } from "./rng";
import { CORP_NAMES, adTexture, face, glow, holoMaterial, screenMaterial, signMaterial, signTexture } from "./signs";
import { opt } from "./types";
import type { Params } from "./types";

const FH = 3.8;
const PODIUM_FH = 5.2;
let PODIUM_FLOORS = 3; // set per build from the Podium floors option
let CHAMFER = 0.32;
let LED = 0; // 0 chasing, 1 steady, 2 off
const BAY = 1.6;

type V2 = [number, number];

function octagon(a: number, b: number, c: number): V2[] {
  return [[-a + c, b], [a - c, b], [a, b - c], [a, -b + c], [a - c, -b], [-a + c, -b], [-a, -b + c], [-a, b - c]];
}

/** horizontal octagon prism from y0 to y1 */
function prism(b: Builder, key: string, pts: V2[], y0: number, y1: number): void {
  const s = new Shape(pts.map(([x, z]) => new Vector2(x, -z)));
  const g = new ExtrudeGeometry(s, { depth: y1 - y0, bevelEnabled: false });
  // shape is in XY (y = -z); rotate so extrusion goes up
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  b.addRaw(key, g);
}

export function buildArcology(p: Params, b: Builder): { halfW: number; halfD: number; height: number } {
  const rng = new Rng(p.seed * 4241 + 3);
  const pal = PALETTES[p.palette];
  const a0 = (p.width * 3.6) / 2, b0 = (p.depth * 3.6) / 2;
  const F = p.floors;
  const O = (k: string) => opt(p, k);
  PODIUM_FLOORS = O("podium");
  CHAMFER = O("chamfer");
  LED = O("led");
  const podH = PODIUM_FLOORS * PODIUM_FH;
  const pa = a0 + 5, pb = b0 + 5;
  const ledA = rng.pick(pal), ledB = rng.pick(pal.filter(c => c !== ledA));

  // ------------------------------------------------ podium
  podium(b, rng.fork(1), p, pal, pa, pb, podH);

  // ------------------------------------------------ tower segments
  // split the floors into setback segments, each shorter than the one below
  const nSeg = O("segments");
  const weights = [1, 0.55, 0.38, 0.28].slice(0, nSeg);
  const wsum = weights.reduce((a, v) => a + v, 0);
  const cuts = [0];
  let acc = 0;
  for (const wv of weights) {
    acc += wv;
    cuts.push(Math.round((F * acc) / wsum));
  }
  const sb = O("setback");
  let y = podH;
  let topY = podH;
  let segA = a0, segB = b0;
  for (let s = 0; s < nSeg; s++) {
    const floors = cuts[s + 1] - cuts[s];
    if (floors <= 0) continue;
    const y0 = y, y1 = y + floors * FH;
    const c = Math.min(segA, segB) * CHAMFER;
    segment(b, rng.fork(10 + s), p, pal, segA, segB, c, y0, y1, floors, s, s % 2 ? ledB : ledA);
    // setback terrace on top of this segment
    if (s < nSeg - 1 && Math.min(segA, segB) - sb > 4) {
      const na = segA - sb, nb = segB - sb;
      terrace(b, rng.fork(20 + s), segA, segB, c, y1, s % 2 ? ledA : ledB);
      segA = na;
      segB = nb;
    }
    y = y1;
    topY = y1;
  }

  // ------------------------------------------------ crown
  const crownH = crown(b, rng.fork(30), p, pal, segA, segB, topY, ledA, ledB);

  // ------------------------------------------------ big screens on the front face of segment 1
  const seg1Top = podH + cuts[1] * FH;
  const nScreens = O("screens");
  if (p.signs > 0.1 && nScreens > 0 && seg1Top - podH > 14) {
    const sw = a0 * 0.8, sh = Math.min(seg1Top - podH - 8, sw * 1.9);
    const sx = -a0 * 0.35, sy = podH + 4 + sh / 2;
    screen(b, rng, pal, sx, sy, b0 + 0.9, sw, sh, 0, 1);
    if (nScreens > 1) {
      const sw2 = b0 * 1.1, sh2 = sw2 * 0.6;
      screen(b, rng, pal, b0 * 0.05, podH + (seg1Top - podH) * 0.62, a0 + 0.9, sw2, sh2, Math.PI / 2, 2, true);
    }
  }

  // ------------------------------------------------ glass elevators up the right face
  if (O("elevators")) elevators(b, rng.fork(40), a0, b0, podH, seg1Top, pal);

  // ------------------------------------------------ hologram over the podium roof
  if (p.signs > 0.2 && O("hologram")) {
    const holoColor = rng.pick(pal);
    const g = new TorusGeometry(3.2, 0.06, 8, 64);
    const ring1 = new Mesh(g, holoMaterial(holoColor));
    const ring2 = new Mesh(new TorusGeometry(2.4, 0.04, 8, 64), holoMaterial(holoColor));
    const core = new Mesh(new OctahedronGeometry(1.4, 0), holoMaterial(rng.pick(pal)));
    const hx = a0 + 2.2, hz = b0 + 2.6, hy = podH + 5.5;
    for (const m of [ring1, ring2, core]) {
      m.position.set(hx, hy, hz);
      m.userData.noAO = true;
      m.userData.noReflect = false;
      b.extra(m);
    }
    b.animators.push(t => {
      ring1.rotation.set(Math.PI / 2 + Math.sin(t * 0.5) * 0.3, t * 0.6, 0);
      ring2.rotation.set(t * 0.8, Math.PI / 3, t * 0.3);
      core.rotation.set(0, t * 0.9, 0);
      core.position.y = hy + Math.sin(t * 1.2) * 0.25;
    });
    // projector
    b.cyl("metalDark", hx, podH + 0.4, hz, 0.6, 0.8, 16);
    b.cyl("emit:" + holoColor + ":6", hx, podH + 0.82, hz, 0.4, 0.04, 16);
    glow(b, hx, podH + 0.9, hz, 6, 6, holoColor, 0.3, 0, -Math.PI / 2);
    b.light(hx, hy, hz, "#" + holoColor, 40, 18);
  }

  return { halfW: pa, halfD: pb, height: topY + crownH };
}

function podium(b: Builder, rng: Rng, p: Params, pal: readonly string[], pa: number, pb: number, podH: number): void {
  // mass
  b.box("concreteDark", 0, podH / 2, 0, pa * 2 - 0.4, podH, pb * 2 - 0.4);
  b.box("metalPanel", 0, podH + 0.4, 0, pa * 2 + 0.3, 0.8, pb * 2 + 0.3);
  const sideFrames: [number, number, number, number][] = [
    [-pa, pb, 0, pa * 2], [pa, pb, Math.PI / 2, pb * 2], [pa, -pb, Math.PI, pa * 2], [-pa, -pb, -Math.PI / 2, pb * 2],
  ];
  sideFrames.forEach(([x0, z0, ry, L], s) => {
    b.pushT(x0, 0, z0, ry);
    const nCol = Math.max(3, Math.round(L / 6));
    const step = L / nCol;
    // lobby glass between columns
    for (let i = 0; i < nCol; i++) {
      const xc = (i + 0.5) * step;
      winQuad(b, xc, 3.3, 0.02, step - 0.7, 6.2, rng.next() * 999, STYLE.office);
      for (let k = 1; k < 4; k++) b.box("frame", i * step + (step * k) / 4, 3.3, 0.06, 0.05, 6.2, 0.08);
      b.box("frame", xc, 6.45, 0.06, step - 0.6, 0.1, 0.1);
    }
    for (let i = 0; i <= nCol; i++) b.box("metalPanel", i * step, podH / 2, 0.35, 0.9, podH, 0.7);
    // upper podium floors: a glazing band per floor + spandrel
    for (let f = 1; f < PODIUM_FLOORS; f++) {
      const fy = f * PODIUM_FH + 1.6;
      for (let i = 0; i < nCol; i++) {
        const xc = (i + 0.5) * step;
        winQuad(b, xc, fy + 1.2, 0.02, step - 1.0, 2.4, rng.next() * 999, STYLE.office);
        b.box("glassSpandrel", xc, fy - 0.9, 0.04, step - 0.9, 1.4, 0.06);
      }
      b.box("emit:" + (s % 2 ? pal[1] : pal[0]) + ":3.5", L / 2, f * PODIUM_FH + 0.3, 0.75, L, 0.06, 0.06);
    }
    // canopy over the front entrance
    if (s === 0) {
      const cw = Math.min(L * 0.5, 16);
      b.box("metalPanel", L / 2, 7.1, 3.0, cw, 0.35, 6);
      b.box("emit:e8f2ff:5", L / 2, 6.9, 3.0, cw - 0.6, 0.02, 5.4);
      b.box("emit:" + pal[0] + ":6", L / 2, 7.1, 6.02, cw, 0.08, 0.06);
      for (const sx of [-1, 1]) b.barXYZ("metalBare", L / 2 + sx * (cw / 2 - 0.5), 0.15, 5.6, L / 2 + sx * (cw / 2 - 0.5), 6.95, 5.6, 0.12, 12);
      b.light(L / 2, 5.5, 4.5, "#dfeaff", 40, 14);
      glow(b, L / 2, 0.18, 4, cw, 8, "cfe0ff", 0.18, 0, -Math.PI / 2);
      // corp lightbox letters on the canopy
      const corp = b.text("canopy", rng.pick(CORP_NAMES), "sign", "Entrance sign", { maxLen: 14 });
      const { tex, aspect } = signTexture(corp, "neon", pal[1], false);
      const tw = Math.min(cw * 0.8, 1.3 * aspect);
      face(b, signMaterial(tex, 4, 0), L / 2, 7.95, 5.85, tw, tw / aspect);
      b.textProxy("canopy", L / 2, 7.95, 5.85, tw, tw / aspect, 0.4);
      b.box("metalDark", L / 2, 7.95, 5.75, tw + 0.2, tw / aspect + 0.2, 0.15);
      // security booths / bollards
      for (let i = 0; i < 6; i++) b.cyl("metalDark", L / 2 - cw / 2 + (cw * (i + 0.5)) / 6, 0.5, 7.2, 0.14, 1.0, 10);
      for (let i = 0; i < 6; i++) b.cyl("emit:" + pal[1] + ":4", L / 2 - cw / 2 + (cw * (i + 0.5)) / 6, 0.95, 7.2, 0.145, 0.05, 10);
    }
    b.pop();
  });
  // podium roof: plant, vents, AC
  const y = podH + 0.8;
  for (let i = 0; i < Math.round(3 + p.ac * 6); i++) {
    const x = rng.range(-pa + 2, pa - 2), z = rng.range(-pb + 2, -pb + 6);
    b.box("acUnit", x, y + 0.7, z, 2.2, 1.4, 1.6);
    b.cyl("grille", x, y + 1.42, z, 0.55, 0.05, 16);
  }
  railing(b, -pa, pa, y, pb - 0.1, 1.1, "metalBare");
  b.pushT(pa - 0.1, 0, 0, Math.PI / 2);
  railing(b, -pb, pb, y, 0, 1.1, "metalBare");
  b.pop();
  // planters along the podium edge
  for (let x = -pa + 2; x < pa - 2; x += 3) {
    b.box("concrete", x, y + 0.35, pb - 1.2, 2.2, 0.7, 0.9);
    b.blob("plant", x, y + 0.85, pb - 1.2, 1.1, 0.45, 0.45, 7);
  }
}

function segment(
  b: Builder, rng: Rng, p: Params, pal: readonly string[], a: number, bb: number, c: number, y0: number, y1: number,
  floors: number, segIdx: number, led: string,
): void {
  const pts = octagon(a, bb, c);
  // dark core behind the glass + floor slabs
  prism(b, "metalDark", octagon(a - 0.8, bb - 0.8, c * 0.8), y0, y1);
  for (let f = 0; f <= floors; f++) prism(b, "metalPanel", octagon(a + 0.2, bb + 0.2, c + 0.05), y0 + f * FH - 0.18, y0 + f * FH + 0.18);
  const mechEvery = opt(p, "mechEvery"), finEvery = opt(p, "finEvery");
  const mech = (f: number) => (f + 1) % mechEvery === 0 && f < floors - 1;
  const ledKey = (ch: number, i: number) => (LED === 0 ? `chase:${led}:${ch}:${i}` : `neon:${led}:0:${i - 1}`);

  for (let e = 0; e < 8; e++) {
    const [x0, z0] = pts[e];
    const [x1, z1] = pts[(e + 1) % 8];
    const dx = x1 - x0, dz = z1 - z0;
    const L = Math.hypot(dx, dz);
    const ry = Math.atan2(-dz / L, dx / L);
    b.pushT(x0, 0, z0, ry);
    if (e % 2 === 0) {
      // curtain wall
      const nb = Math.max(2, Math.round(L / BAY));
      const bw = L / nb;
      for (let f = 0; f < floors; f++) {
        const fy = y0 + f * FH;
        if (mech(f)) {
          // mechanical floor: louvres + red line
          b.box("metalDark", L / 2, fy + FH / 2, 0.05, L, FH - 0.36, 0.1);
          for (let k = 0; k < 9; k++) b.boxR("metalPanel", L / 2, fy + 0.4 + k * 0.34, 0.2, L, 0.04, 0.3, -0.6, 0, 0);
          b.box("emit:ff2040:5", L / 2, fy + FH - 0.3, 0.32, L, 0.05, 0.04);
          continue;
        }
        for (let i = 0; i < nb; i++) winQuad(b, (i + 0.5) * bw, fy + FH / 2, 0.0, bw - 0.06, FH - 0.36, rng.next() * 9999 + segIdx * 7 + f, STYLE.office);
      }
      // fins
      for (let i = 0; i <= nb; i++) {
        const deep = i % finEvery === 0;
        b.box(deep ? "metalPanel" : "frame", i * bw, (y0 + y1) / 2, deep ? 0.45 : 0.14, deep ? 0.16 : 0.06, y1 - y0, deep ? 0.9 : 0.28);
        if (deep && LED < 2 && rng.chance(0.25)) b.box(ledKey(rng.int(0, 3), 5), i * bw, (y0 + y1) / 2, 0.91, 0.05, y1 - y0, 0.03);
      }
    } else {
      // chamfer: dark panel with chasing LED lines
      b.box("metalDark", L / 2, (y0 + y1) / 2, 0.08, L, y1 - y0, 0.16);
      const n = Math.max(1, Math.round(L / 1.1));
      if (LED < 2) {
        for (let i = 0; i < n; i++) {
          const x = (L * (i + 0.5)) / n;
          b.box(ledKey(i, 6), x, (y0 + y1) / 2, 0.2, 0.07, y1 - y0, 0.06);
        }
        glow(b, L / 2, y0 + 3, 0.6, L * 2.5, 8, led, 0.15);
      }
      for (let f = 0; f <= floors; f += 3) b.box("frame", L / 2, y0 + f * FH, 0.22, L, 0.08, 0.1);
    }
    b.pop();
  }
  void p;
  void pal;
}

function terrace(b: Builder, rng: Rng, a: number, bb: number, c: number, y: number, led: string): void {
  prism(b, "roof", octagon(a, bb, c), y, y + 0.25);
  const pts = octagon(a - 0.15, bb - 0.15, c);
  for (let e = 0; e < 8; e++) {
    const [x0, z0] = pts[e];
    const [x1, z1] = pts[(e + 1) % 8];
    const L = Math.hypot(x1 - x0, z1 - z0);
    const ry = Math.atan2(-(z1 - z0) / L, (x1 - x0) / L);
    b.pushT(x0, 0, z0, ry);
    b.box("glass", L / 2, y + 0.85, 0, L, 1.2, 0.04);
    b.box("metalBare", L / 2, y + 1.47, 0, L, 0.05, 0.08);
    b.box(`emit:${led}:4`, L / 2, y + 0.3, 0.02, L, 0.04, 0.04);
    b.pop();
  }
  // a few trees in planters on the terrace
  for (let i = 0; i < 5; i++) {
    const x = rng.range(-a + 1.2, a - 1.2), z = bb - 1.2;
    b.box("concrete", x, y + 0.5, z, 1.2, 0.5, 1.2);
    b.cyl("wood", x, y + 1.4, z, 0.06, 1.6, 6);
    b.blob("plant", x, y + 2.4, z, 0.8, 0.7, 0.8, 7);
  }
}

function crown(b: Builder, rng: Rng, p: Params, pal: readonly string[], a: number, bb: number, y: number, ledA: string, ledB: string): number {
  const c = Math.min(a, bb) * CHAMFER;
  const style = opt(p, "crown"); // 0 blades + halo, 1 halo, 2 blades, 3 plain
  const blades = style === 0 || style === 2, halo = style === 0 || style === 1;
  // roof slab + plant room
  prism(b, "metalPanel", octagon(a + 0.3, bb + 0.3, c), y, y + 0.6);
  prism(b, "metalDark", octagon(a - 2, bb - 2, c * 0.7), y + 0.6, y + 6);
  for (const [x, z] of [[-a + 3, -bb + 3], [a - 3, -bb + 3]]) {
    b.cyl("acUnit", x, y + 1.8, z, 1.3, 2.4, 20);
    b.cyl("grille", x, y + 3.02, z, 1.1, 0.05, 20);
    b.steamAt(x, y + 3.1, z);
  }
  // name band in neon tubes across the front top
  const corp = b.text("crown", rng.pick(CORP_NAMES), "neon", "Crown name", { maxLen: 12 });
  const lh = Math.min(2.6, ((a - c) * 2 * 0.85) / (corp.length * 5.4 - 1.4) * 6);
  const tw = neonTextWidth(corp, lh);
  b.box("metalDark", 0, y - 2.4, bb + 0.55, tw + 1.4, lh + 1.2, 0.3);
  if (p.signs > 0.05) {
    neonText(b, corp, -tw / 2, y - 2.4 - lh / 2, bb + 0.75, lh, `neon:${ledA}:0:6`, { brokenKey: `neon:${ledA}:4:6`, brokenIndex: rng.int(0, corp.length - 1) });
    glow(b, 0, y - 2.4, bb + 1.0, tw * 1.6, lh * 4, ledA, 0.3);
    b.light(0, y - 2.4, bb + 4, "#" + ledA, 60, 24);
    b.textProxy("crown", 0, y - 2.4, bb + 0.8, tw + 1.4, lh + 1.2, 0.7);
  }
  // slanted blades at the chamfers, LED edged
  const bladeH = 16;
  for (const [sx, sz] of blades ? [[1, 1], [-1, 1], [1, -1], [-1, -1]] : []) {
    const x = sx * (a - c / 2), z = sz * (bb - c / 2);
    const m = new Matrix4()
      .makeTranslation(x, y + bladeH / 2 - 0.5, z)
      .multiply(new Matrix4().makeRotationY(Math.atan2(sx, sz)))
      .multiply(new Matrix4().makeRotationX(-0.22));
    b.addRaw("metalPanel", new BoxGeometry(Math.max(c, 1) * 1.1, bladeH, 0.4), m);
    if (LED < 2) {
      b.addRaw(LED === 0 ? `chase:${ledB}:2:6` : `neon:${ledB}:0:5`, new BoxGeometry(0.08, bladeH, 0.08).translate(Math.max(c, 1) * 0.55, 0, 0.22), m);
      b.addRaw(LED === 0 ? `chase:${ledB}:3:6` : `neon:${ledB}:0:5`, new BoxGeometry(0.08, bladeH, 0.08).translate(-Math.max(c, 1) * 0.55, 0, 0.22), m);
    }
  }
  // halo rings
  const ringCol = rng.pick(pal);
  const r1 = Math.hypot(a, bb) * 0.85;
  if (halo) {
  b.addRaw(`neon:${ringCol}:0:5`, new TorusGeometry(r1, 0.12, 8, 96).rotateX(Math.PI / 2).translate(0, y + 11, 0));
  b.addRaw(`neon:${ringCol}:0:4`, new TorusGeometry(r1 * 0.8, 0.08, 8, 96).rotateX(Math.PI / 2).translate(0, y + 13.5, 0));
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * Math.PI * 2;
    b.barXYZ("metalDark", Math.cos(t) * (a - c), y + 6, Math.sin(t) * (bb - c), Math.cos(t) * r1, y + 11, Math.sin(t) * r1, 0.06, 5);
  }
  b.light(0, y + 11, 0, "#" + ringCol, 60, 30);
  }
  // spire
  const spH = opt(p, "spire") ? 26 : 0;
  if (spH) {
    b.cyl("metalBare", 0, y + 6 + spH / 2, 0, 0.35, spH, 12);
    b.cyl("metalBare", 0, y + 6 + spH + 4, 0, 0.12, 8, 8);
    for (let k = 0; k < 4; k++) beacon(b, 0.4, y + 10 + k * 7, 0.4);
    beacon(b, 0, y + spH + 10.2, 0);
  }
  for (let i = 0; i < 3; i++) antenna(b, rng, (i - 1) * 2.5, y + 6, -1.5, rng.range(3, 6));
  // helipad cantilevered off the back-right
  const hx = a * 0.5, hz = -bb - 3.5, hy = y + 0.6;
  if (opt(p, "helipad")) {
  b.cyl("metalPanel", hx, hy, hz, 6, 0.4, 32);
  b.cyl("paintWhite", hx, hy + 0.21, hz, 5.6, 0.02, 32);
  b.cyl("metalPanel", hx, hy + 0.22, hz, 5.3, 0.02, 32);
  b.box("paintWhite", hx - 1.3, hy + 0.24, hz, 0.5, 0.02, 4);
  b.box("paintWhite", hx + 1.3, hy + 0.24, hz, 0.5, 0.02, 4);
  b.box("paintWhite", hx, hy + 0.24, hz, 2.6, 0.02, 0.5);
  for (let i = 0; i < 16; i++) {
    const t = (i / 16) * Math.PI * 2;
    b.sphere("emit:7cff6a:6", hx + Math.cos(t) * 5.8, hy + 0.3, hz + Math.sin(t) * 5.8, 0.08, 6);
  }
  for (const sx of [-3, 3]) b.barXYZ("metalDark", hx + sx, hy - 0.2, hz + 3, hx + sx * 0.6, hy - 6, -bb + 0.3, 0.15, 6);
  }
  return Math.max(spH + 12, blades ? 17 : halo ? 15 : 8);
}

function screen(b: Builder, rng: Rng, pal: readonly string[], x: number, y: number, z: number, w: number, h: number, ry: number, seed: number, onSide = false): void {
  b.pushT(onSide ? z : x, 0, onSide ? x : z, ry);
  b.box("metalDark", 0, y, -0.25, w + 0.6, h + 0.6, 0.5);
  b.box("frame", 0, y + h / 2 + 0.35, 0.05, w + 0.8, 0.12, 0.25);
  b.box("frame", 0, y - h / 2 - 0.35, 0.05, w + 0.8, 0.12, 0.25);
  for (const sx of [-1, 1]) for (const yy of [y - h / 3, y + h / 3]) b.barXYZ("metalDark", sx * w * 0.4, yy, -0.5, sx * w * 0.4, yy, -0.95, 0.1, 6);
  const brand = b.text(`screen.${seed}`, rng.pick(CORP_NAMES), "sign", "Ad screen brand", { maxLen: 14 });
  const tex = adTexture(rng.fork(seed), pal, w / h, brand);
  face(b, screenMaterial(tex, w, h, seed), 0, y, 0.01, w, h);
  b.textProxy(`screen.${seed}`, 0, y, 0.1, w, h, 0.5);
  glow(b, 0, y, 0.6, w * 1.6, h * 1.3, pal[seed % pal.length], 0.08);
  b.light(0, y, 3.5, "#" + pal[seed % pal.length], 30 + w * h * 0.3, 20 + w);
  b.pop();
}

function elevators(b: Builder, rng: Rng, a: number, bb: number, y0: number, y1: number, pal: readonly string[]): void {
  const shafts = [-bb * 0.45, -bb * 0.45 + 2.6];
  const cabins: { mesh: Mesh; lo: number; hi: number; speed: number; ph: number }[] = [];
  shafts.forEach((z, i) => {
    const x = a + 1.4;
    b.box("glass", x, (y0 + y1) / 2, z, 2.2, y1 - y0, 2.2);
    for (const [ox, oz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) b.box("metalBare", x + ox, (y0 + y1) / 2, z + oz, 0.1, y1 - y0, 0.1);
    for (let yy = y0; yy < y1; yy += FH * 3) b.box("metalBare", x, yy, z, 2.3, 0.12, 2.3);
    b.box(`emit:${pal[i % pal.length]}:4`, x + 1.12, (y0 + y1) / 2, z, 0.04, y1 - y0, 0.04);
    const cabin = new Mesh(new BoxGeometry(1.9, 2.6, 1.9), new MeshBasicMaterial({ color: new Color("#fff0d8").multiplyScalar(2.2) }));
    cabin.position.set(x, y0 + 2, z);
    cabin.userData.noAO = true;
    b.extra(cabin);
    cabins.push({ mesh: cabin, lo: y0 + 1.4, hi: y1 - 1.4, speed: rng.range(0.04, 0.08), ph: rng.next() });
  });
  b.animators.push(t => {
    for (const c of cabins) {
      const s = (Math.sin((t * c.speed + c.ph) * Math.PI * 2) + 1) / 2;
      c.mesh.position.y = c.lo + (c.hi - c.lo) * s;
    }
  });
  void framedWindow;
  void acUnit;
  void vent;
}
