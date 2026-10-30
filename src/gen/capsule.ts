/**
 * CAPSULE: a Metabolist capsule tower on a night-market podium.
 *
 * One or two concrete service cores rise from the podium roof; prefabricated
 * capsule pods (rounded shells, porthole window with a tiny interior, vents,
 * AC units, number plates, neon rings) are bolted onto every free face slot,
 * with small offsets so the stack reads hand-assembled. Sky bridges tie the
 * cores together. The podium is an open arcade of food stalls under lantern
 * strings and menu boards, with neon tube words on the fascia above.
 */
import { BoxGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, TorusGeometry, Vector3 } from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { Builder } from "./builder";
import { framedWindow, sides, STYLE, winQuad } from "./facade";
import { PALETTES } from "./materials";
import { neonText, neonTextWidth } from "./neonfont";
import { acUnit, antenna, beacon, cableBundle, lanterns, pipeRun, plate, railing, shutter, vent, waterTank } from "./props";
import { Rng } from "./rng";
import { CJK_WORDS, face, glow, signBox, signMaterial, signTexture, tickerMaterial } from "./signs";
import { opt } from "./types";
import type { Params } from "./types";

const GF = 4.6; // ground floor (arcade)
const F1 = 4.0; // upper podium floor
const POD_FH = 2.62;
const CORE = 5.0;
const POD_L = 4.0, POD_W = 2.36, POD_H = 2.4;
const podGeo = new RoundedBoxGeometry(POD_W, POD_H, POD_L, 2, 0.2);

export function buildCapsule(p: Params, b: Builder): { halfW: number; halfD: number; height: number } {
  const rng = new Rng(p.seed * 3571 + 17);
  const pal = PALETTES[p.palette];
  const W = (p.depth + 2) * 4, D = 16;
  const podTop = GF + F1;
  const cores = p.width >= 2 ? [-6.2, 6.2] : [0];
  const F = p.floors;
  const towerTop = podTop + 0.6 + F * POD_FH;
  const O = (k: string) => opt(p, k);
  const gap = Math.min(O("coreGap"), Math.max(0, F - 3));
  const jit = O("jitter") / 0.3;
  const bridgeEvery = O("bridgeEvery");

  podium(b, rng.fork(1), p, pal, W, D);

  // ------------------------------------------------ cores
  cores.forEach((cx, ci) => {
    const crng = rng.fork(100 + ci);
    const top = towerTop + (ci === 1 ? -POD_FH * gap : 0);
    b.box("concrete", cx, (podTop + top + 4) / 2, 0, CORE, top + 4 - podTop, CORE);
    // stair slit windows on the back face
    for (let f = 0; f < F; f++) winQuad(b, cx, podTop + 1.3 + f * POD_FH, -CORE / 2 - 0.01, 0.5, 1.6, crng.next() * 999, STYLE.dim);
    // corner pipes + chase LED
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      pipeRun(b, cx + sx * (CORE / 2 + 0.12), podTop, top + 3, sz * (CORE / 2 + 0.12), 0.07, crng.pick(["pipe", "pipePVC", "rust"]), POD_FH);
    }
    const led = crng.pick(pal);
    b.box(`chase:${led}:${ci}:6`, cx + CORE / 2 + 0.02, (podTop + top) / 2, CORE / 2 + 0.02, 0.06, top - podTop, 0.06);
    b.box(`chase:${led}:${ci + 2}:6`, cx - CORE / 2 - 0.02, (podTop + top) / 2, CORE / 2 + 0.02, 0.06, top - podTop, 0.06);

    // pods
    const faces: { ry: number; inner: boolean }[] = [
      { ry: 0, inner: false }, { ry: Math.PI, inner: false },
      { ry: Math.PI / 2, inner: cores.length > 1 && ci === 0 },
      { ry: -Math.PI / 2, inner: cores.length > 1 && ci === 1 },
    ];
    for (let f = 0; f < Math.round((top - podTop - 0.6) / POD_FH); f++) {
      const bridgeFloor = cores.length > 1 && f % bridgeEvery === 2 % bridgeEvery;
      for (const fc of faces) {
        if (fc.inner && (bridgeFloor || f % 2 !== ci)) continue;
        for (const slot of [-1.22, 1.22]) {
          if (!crng.chance(O("podDensity"))) continue;
          const yb = podTop + 0.6 + f * POD_FH + crng.range(-0.08, 0.08) * jit;
          b.pushT(cx, 0, 0, fc.ry);
          pod(b, crng.fork(f * 13 + slot * 7 + fc.ry * 3), p, pal, slot + crng.range(-0.04, 0.04) * jit, yb, CORE / 2 + 0.04 + crng.range(0, 0.26) * jit);
          b.pop();
        }
      }
    }
    // machine room + roof kit
    const ry = top + 4;
    b.box("concreteDark", cx, ry + 0.2, 0, CORE + 0.6, 0.4, CORE + 0.6);
    waterTank(b, crng, cx - 1.2, ry + 0.4, -1, 0.9, 1.6);
    const tip = antenna(b, crng, cx + 1.6, ry + 0.4, -1.6, crng.range(5, 9));
    beacon(b, tip.x, tip.y + 0.1, tip.z);
    railing(b, cx - CORE / 2, cx + CORE / 2, ry + 0.4, CORE / 2 + 0.2, 1.0);
    if (ci === cores.length - 1 && p.signs > 0.15 && O("cube")) cubeSign(b, crng, pal, cx, ry + 0.4);
    if (ci === 0 && p.signs > 0.1 && O("coreSign")) coreBlade(b, crng, pal, cx, podTop, top);
  });

  // sky bridges between two cores
  if (cores.length > 1) {
    for (let f = 2; f < F - 2 - gap; f += bridgeEvery) {
      const y = podTop + 0.6 + f * POD_FH;
      const x0 = cores[0] + CORE / 2, x1 = cores[1] - CORE / 2;
      b.box("metalPanel", (x0 + x1) / 2, y + 0.15, 0, x1 - x0, 0.3, 2.6);
      b.box("metalPanel", (x0 + x1) / 2, y + POD_H, 0, x1 - x0, 0.25, 2.6);
      for (const sz of [-1, 1]) {
        winQuad(b, (x0 + x1) / 2, y + 1.25, sz * 1.31, x1 - x0 - 0.2, 1.8, rng.next() * 999, STYLE.dim);
        b.box("frame", (x0 + x1) / 2, y + 1.25, sz * 1.3, x1 - x0, 0.05, 0.06);
      }
      b.box(`emit:${pal[1]}:4`, (x0 + x1) / 2, y + 0.02, 1.32, x1 - x0, 0.04, 0.04);
    }
  }

  // cables strung between pods and cores
  for (let i = 0; i < Math.round(10 * p.cables); i++) {
    const y = podTop + rng.range(2, F * POD_FH * 0.7);
    const cx = rng.pick(cores);
    cableBundle(b, rng, new Vector3(cx + rng.range(-3, 3), y, CORE / 2 + POD_L + 0.1), new Vector3(cx + rng.range(-6, 6), y - rng.range(1, 6), CORE / 2 + POD_L + 0.2), rng.range(0.4, 1.2));
  }
  return { halfW: W / 2, halfD: D / 2, height: towerTop + 12 };
}

/** one capsule pod in the core-face frame: z = outward, attached at z0 */
function pod(b: Builder, rng: Rng, p: Params, pal: readonly string[], x: number, yb: number, z0: number): void {
  const key = rng.chance(opt(p, "darkPods")) ? "podDark" : "pod";
  const zc = z0 + POD_L / 2;
  const yc = yb + POD_H / 2;
  b.addRaw(key, podGeo, new Matrix4().makeTranslation(x, yc, zc));
  // bolted mounting plates
  for (const sx of [-0.8, 0.8]) for (const sy of [-0.8, 0.8]) b.box("metalDark", x + sx, yc + sy, z0 - 0.03, 0.3, 0.3, 0.12);
  // seam bands
  for (const zz of [z0 + 0.9, z0 + POD_L - 0.9]) b.box("frame", x, yc, zz, POD_W + 0.03, POD_H + 0.03, 0.06);
  // porthole on the outer end
  const ez = z0 + POD_L + 0.005;
  const r = 0.62;
  winQuad(b, x, yc + 0.08, ez + 0.01, r * 2.1, r * 2.1, rng.next() * 999, STYLE.pod);
  b.addRaw("frameLight", new TorusGeometry(r + 0.05, 0.075, 8, 32), new Matrix4().makeTranslation(x, yc + 0.08, ez + 0.03));
  // window shade ring / neon ring
  if (rng.chance(opt(p, "rings") * (0.4 + 0.6 * p.signs))) {
    const nc = rng.pick(pal);
    b.addRaw(`neon:${nc}:${rng.chance(0.2) ? rng.int(1, 5) : 0}:4`, new TorusGeometry(r + 0.17, 0.025, 6, 40), new Matrix4().makeTranslation(x, yc + 0.08, ez + 0.06));
    glow(b, x, yc + 0.08, ez + 0.12, 3.2, 3.2, nc, 0.12);
  }
  // number plate
  if (rng.chance(0.5)) plate(b, String(rng.int(100, 1499)), rng.pick(["e8e2d0", "ffd9a0"]), x + POD_W * 0.28, yc - 0.82, ez + 0.03, 0.42);
  // vent on the side, AC on top / side
  b.pushT(x + POD_W / 2 + 0.005, 0, zc, Math.PI / 2);
  vent(b, 0.6, yc + 0.4, 0, 0.7, 0.4);
  b.pop();
  if (rng.chance(p.ac * 0.55)) {
    b.pushT(x - POD_W / 2 - 0.005, 0, zc + rng.range(-0.8, 0.8), -Math.PI / 2);
    acUnit(b, rng, 0, yc - 0.6, 0, 0.85);
    b.pop();
  } else if (rng.chance(p.ac * 0.3)) {
    b.box("acUnit", x, yb + POD_H + 0.28, zc + 0.5, 0.9, 0.5, 0.7);
    b.cyl("grille", x, yb + POD_H + 0.54, zc + 0.5, 0.22, 0.03, 12);
  }
  if (rng.chance(0.15 * p.clutter)) {
    // satellite dish bracket under the window
    b.box("metalDark", x - 0.7, yc - 0.6, ez + 0.2, 0.05, 0.05, 0.4);
    b.blob("paintWhite", x - 0.7, yc - 0.5, ez + 0.45, 0.25, 0.25, 0.08, 10);
  }
}

function podium(b: Builder, rng: Rng, p: Params, pal: readonly string[], W: number, D: number): void {
  const podTop = GF + F1;
  // mass behind the arcade + slabs
  b.box("concreteDark", 0, podTop / 2, 0, W - 6, podTop, D - 6);
  b.box("slab", 0, GF, 0, W + 0.4, 0.4, D + 0.4);
  b.box("slab", 0, podTop + 0.15, 0, W + 0.6, 0.3, D + 0.6);
  sides(W, D).forEach(([x0, z0, ry, L], s) => {
    const srng = rng.fork(s + 1);
    const street = s < 2;
    b.pushT(x0, 0, z0, ry);
    const nb = Math.max(2, Math.round(L / 4));
    const bw = L / nb;
    // arcade columns + ceiling tubes
    for (let i = 0; i <= nb; i++) b.box("concrete", i * bw, GF / 2, -0.25, 0.5, GF, 0.5);
    b.box("concreteDark", L / 2, GF - 0.45, -0.25, L, 0.7, 0.55);
    for (let i = 0; i < nb; i++) {
      const xc = (i + 0.5) * bw;
      // back wall shops (3 m deep arcade)
      const back = -3.0;
      if (srng.chance(0.7)) {
        winQuad(b, xc, 1.7, back + 0.02, bw - 0.6, 3.0, srng.next() * 999, STYLE.shop);
        b.box("frame", xc, 3.25, back + 0.05, bw - 0.5, 0.1, 0.1);
        // noren curtain
        if (srng.chance(0.5)) {
          const nc = srng.pick(["cloth0", "cloth1", "cloth5", "awningBlue"]);
          for (let k = 0; k < 4; k++) b.box(nc, xc - 0.75 + k * 0.5, 2.85, back + 0.25, 0.46, 0.75, 0.02);
        }
      } else {
        shutter(b, xc, bw - 0.6, 3.2, srng.range(0.7, 1));
      }
      b.box("emit:e6f0ff:3.5", xc, GF - 0.82, -1.6, bw * 0.6, 0.04, 0.06);
      // stall
      if (street && srng.chance(opt(p, "stalls"))) stall(b, srng, pal, xc, bw);
      // menu lightbox hanging under the arcade beam
      if (srng.chance(opt(p, "menus") * (0.6 + 0.4 * p.signs))) {
        const text = b.text(`menu.${s}.${i}`, srng.pick(CJK_WORDS), "sign", "Menu board", { maxLen: 8 });
        const { tex, aspect } = signTexture(text, "lightbox", srng.pick(["fff2d0", "ffd23f", "ff4a4a", "e8f4ff"]), false, srng.pick(["111111", "b00020"]));
        const sw = Math.min(bw - 0.8, 0.55 * aspect);
        b.barXYZ("metalDark", xc - sw / 3, GF - 0.8, 0.1, xc - sw / 3, GF - 1.2, 0.1, 0.01, 3);
        b.barXYZ("metalDark", xc + sw / 3, GF - 0.8, 0.1, xc + sw / 3, GF - 1.2, 0.1, 0.01, 3);
        signBox(b, xc, GF - 1.2 - sw / aspect / 2, 0.1, sw, sw / aspect, 0.1, 0, signMaterial(tex, 1.5, 0), true);
        b.textProxy(`menu.${s}.${i}`, xc, GF - 1.2 - sw / aspect / 2, 0.1, sw, sw / aspect, 0.3);
      }
    }
    // lantern strings across the arcade front
    if (street && opt(p, "lanterns")) {
      for (let i = 0; i < nb; i++) lanterns(b, srng, new Vector3(i * bw + 0.3, GF - 0.9, 0.15), new Vector3((i + 1) * bw - 0.3, GF - 0.9, 0.15), srng.pick(["ff3b1f", "ff5a2a", "ffb03b"]), 0.35);
      b.light(L / 2, GF - 1.5, 1.5, "#ff6a3a", 25, 14);
    }
    // upper podium floor: wall, windows, neon words on the fascia
    b.box(street ? "tileB" : "tileC", L / 2, GF + F1 / 2, 0.02, L, F1 - 0.2, 0.06);
    for (let i = 0; i < nb; i++) {
      if (srng.chance(0.25)) continue;
      framedWindow(b, srng, (i + 0.5) * bw, GF + 1.9, 0.06, bw - 1.2, 1.8, { cols: 3, style: STYLE.shop, frame: "frame" });
    }
    if (street && p.signs > 0.1) {
      const word = b.text(`podium.${s}`, srng.pick(s === 0 ? ["RAMEN", "KARAOKE", "NOODLE", "SUSHI", "DINER"] : ["ARCADE", "GAMES", "LUCKY", "TATTOO", "VIDEO"]), "neon", "Podium neon", { maxLen: 10 });
      const lh = Math.min(1.6, ((L * 0.55) / (word.length * 5.4 - 1.4)) * 6);
      const tw = neonTextWidth(word, lh);
      const color = srng.pick(pal);
      const xs = srng.range(0.6, L - tw - 0.6);
      b.box("metalDark", xs + tw / 2, GF + F1 / 2 + 0.2, 0.18, tw + 0.8, lh + 0.7, 0.16);
      neonText(b, word, xs, GF + F1 / 2 + 0.2 - lh / 2, 0.32, lh, `neon:${color}:0:4`, { brokenKey: `neon:${color}:3:4`, brokenIndex: srng.int(0, word.length - 1) });
      glow(b, xs + tw / 2, GF + F1 / 2, 0.5, tw * 1.6, lh * 3, color, 0.1);
      b.light(xs + tw / 2, GF + F1 / 2, 2.5, "#" + color, 22, 12);
      b.textProxy(`podium.${s}`, xs + tw / 2, GF + F1 / 2 + 0.2, 0.3, tw + 0.8, lh + 0.7, 0.5);
      // ticker along the slab edge
      const msg = b.text(`ticker.${s}`, srng.pick(CJK_WORDS) + "  OPEN 24H  " + word + "  " + srng.pick(CJK_WORDS), "sign", "LED ticker", { maxLen: 60 });
      face(b, tickerMaterial(msg, srng.pick(["ff3b1f", "ffb000", "35ff6a"]), L - 1, 0.3), L / 2, GF + 0.02, 0.33, L - 1, 0.3);
      b.textProxy(`ticker.${s}`, L / 2, GF + 0.02, 0.33, L - 1, 0.4, 0.25);
    }
    b.pop();
  });
  // podium roof terrace
  const y = podTop + 0.3;
  for (const [x0, z0, ry, L] of sides(W, D)) {
    b.pushT(x0, 0, z0, ry);
    railing(b, 0, L, y, -0.2, 1.05, "metalBare");
    b.pop();
  }
  for (let i = 0; i < Math.round(3 + 6 * p.ac); i++) {
    const x = rng.range(-W / 2 + 1.5, W / 2 - 1.5), z = rng.range(-D / 2 + 1.2, -D / 2 + 3);
    b.box("acUnit", x, y + 0.45, z, 1.0, 0.9, 0.5);
    b.cyl("grille", x, y + 0.45, z + 0.26, 0.3, 0.02, 14);
  }
  for (let x = -W / 2 + 2; x < W / 2 - 2; x += 2.5) {
    if (Math.abs(x) < 9.5) continue;
    b.box("pot", x, y + 0.3, D / 2 - 1, 0.8, 0.6, 0.8);
    b.blob("plant", x, y + 0.9, D / 2 - 1, 0.5, 0.6, 0.5, 7);
  }
}

function stall(b: Builder, rng: Rng, pal: readonly string[], xc: number, bw: number): void {
  const z = -1.3;
  const w = bw - 1.4;
  b.box("wood", xc, 0.5, z, w, 1.0, 0.8);
  b.box("metalBare", xc, 1.02, z, w + 0.1, 0.04, 0.9);
  // steaming pots / grill
  for (let k = 0; k < rng.int(1, 3); k++) {
    const px = xc - w / 2 + 0.4 + k * 0.7;
    b.cyl("metalBare", px, 1.2, z - 0.1, 0.22, 0.32, 14);
    if (rng.chance(0.7)) b.steamAt(px, 1.4, z - 0.1);
  }
  b.box("emit:ff7a2a:2.5", xc + w / 2 - 0.4, 1.06, z, 0.5, 0.02, 0.4);
  // stools
  for (let k = 0; k < 3; k++) {
    const sx = xc - w / 2 + 0.4 + k * (w / 3);
    b.cyl("metalDark", sx, 0.33, z + 0.85, 0.03, 0.66, 6);
    b.cyl("paintRed", sx, 0.68, z + 0.85, 0.18, 0.06, 12);
  }
  // little awning over the stall
  b.boxR(rng.pick(["awningRed", "awningTeal", "awningYellow"]), xc, 2.6, z + 0.3, w + 0.4, 0.03, 1.4, 0.25, 0, 0);
  b.light(xc, 2.2, z + 0.6, "#ffb070", 6, 6);
  void pal;
}

/** vertical blade on the front-right corner of the first core, katakana + neon tubes */
function coreBlade(b: Builder, rng: Rng, pal: readonly string[], cx: number, podTop: number, top: number): void {
  const color = rng.pick(pal);
  const word = b.text("coreSign", rng.pick(["CAPSULE", "HOTEL", "SLEEP", "DREAM"]), "neon", "Core neon (vertical)", { vertical: true, maxLen: 9 });
  const lh = 1.1;
  const s = lh / 6;
  const h = ([...word].length * 7.6 - 1.6) * s;
  const yTop = Math.min(top - 2, podTop + 4 + h + rng.range(2, 8));
  b.pushT(cx - CORE / 2, 0, CORE / 2, -Math.PI / 4);
  const out = 2.6;
  b.box("metalDark", 0, yTop - h / 2, out / 2, 0.15, h + 1.4, out);
  b.box("frame", 0, yTop - h / 2, out, 1.5, h + 1.6, 0.2);
  neonText(b, word, -2 * s, yTop - lh, out + 0.2, lh, `neon:${color}:0:6`, { vertical: true, brokenKey: `neon:${color}:5:6`, brokenIndex: rng.int(0, word.length - 1) });
  glow(b, 0, yTop - h / 2, out + 0.4, 6, h * 1.5, color, 0.25);
  b.light(0, yTop - h / 2, out + 2, "#" + color, 35, 18);
  b.textProxy("coreSign", 0, yTop - h / 2, out + 0.2, 1.6, h + 1.6, 0.5);
  // katakana lightbox below it
  const kt = b.text("coreSign.kana", rng.pick(["カプセル", "ホテル", "夢幻", "電脳"]), "sign", "Core sign (vertical)", { vertical: true, maxLen: 6 });
  const { tex, aspect } = signTexture(kt, rng.pick(["neon", "outline"] as const), rng.pick(pal), true, color);
  const sw = 1.3, sh = sw / aspect;
  signBox(b, 0, yTop - h - 1.2 - sh / 2, out, sw, sh, 0.25, 0, signMaterial(tex, 3.6, 0), true);
  b.textProxy("coreSign.kana", 0, yTop - h - 1.2 - sh / 2, out, sw, sh, 0.4);
  b.box("metalDark", 0, yTop - h - 1.2 - sh / 2, out / 2, 0.12, sh, out);
  b.pop();
}

/** a rotating four-sided sign on a mast */
function cubeSign(b: Builder, rng: Rng, pal: readonly string[], cx: number, y: number): void {
  b.cyl("metalDark", cx, y + 2, 0, 0.25, 4, 10);
  const g = new Group();
  const s = 3.2;
  const casing = new Mesh(new BoxGeometry(s, s * 0.7, s), new MeshStandardMaterial({ color: 0x111216, roughness: 0.4, metalness: 0.7 }));
  g.add(casing);
  for (let i = 0; i < 4; i++) {
    const text = b.text(`cube.${i}`, rng.chance(0.5) ? rng.pick(["カプセル", "電脳", "夢", "愛", "酒"]) : rng.pick(["SLEEP", "24H", "CHROME", "NEON"]), "sign", "Rotating sign face", { maxLen: 8 });
    const { tex, aspect } = signTexture(text, rng.pick(["neon", "outline"] as const), rng.pick(pal), false, rng.pick(pal));
    const fw = Math.min(s - 0.2, (s * 0.7 - 0.2) * aspect);
    const m = new Mesh(new BoxGeometry(fw, fw / aspect, 0.01), signMaterial(tex, 3.6, 0));
    const a = (i * Math.PI) / 2;
    m.position.set(Math.sin(a) * (s / 2 + 0.01), 0, Math.cos(a) * (s / 2 + 0.01));
    m.rotation.y = a;
    m.userData.noAO = true;
    g.add(m);
    const px = b.makeProxy(`cube.${i}`, fw, fw / aspect, 0.3);
    px.position.copy(m.position);
    px.rotation.y = a;
    g.add(px);
  }
  g.position.set(cx, y + 4 + s * 0.35, 0);
  b.extra(g);
  b.animators.push(t => (g.rotation.y = t * 0.3));
  b.light(cx, y + 5, 3, "#" + pal[2], 20, 14);
}
