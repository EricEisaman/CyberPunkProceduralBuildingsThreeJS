/**
 * HIVE: a Kowloon-style residential megablock.
 *
 * Every bay of every facade is a vertical stack of room modules that
 * cantilever out by different amounts (the "illegal additions"), each with
 * its own tile, window type, cages, AC units and laundry. The two street
 * facades carry stacked vertical blade signs over the sidewalk, shop signs,
 * an LED ticker and a vertical neon tube sign on the corner. The roof is a
 * shanty of shacks, water tanks, antennas, dishes and a scaffold billboard.
 */
import { Vector3 } from "three";
import { Builder } from "./builder";
import { framedWindow, sides, STYLE, winQuad } from "./facade";
import { neonText, neonTextWidth } from "./neonfont";
import { PALETTES } from "./materials";
import {
  acUnit, antenna, awning, beacon, cableBundle, cage, dish, junction, lanterns, laundry, pipeRun, plate, railing,
  shutter, vendingMachine, vent, waterTank,
} from "./props";
import { Rng } from "./rng";
import { CJK_WORDS, EN_WORDS, face, glow, signBox, signMaterial, signTexture, tickerMaterial } from "./signs";
import { opt } from "./types";
import type { Params } from "./types";

const BW = 3.0; // bay width
const GH = 4.6; // ground floor height
const FH = 2.95; // upper floor height
const TILES = ["tileA", "tileB", "tileC", "tileD", "tileE", "plaster", "plasterBlue", "concreteLight"];
let SIGN_Z = 1.45; // blade signs start clear of the deepest module (set per build)

export function buildHive(p: Params, b: Builder): { halfW: number; halfD: number; height: number } {
  const rng = new Rng(p.seed * 7919 + 11);
  const pal = PALETTES[p.palette];
  const F = p.floors;
  const nx = p.width, nz = p.depth;
  const W = nx * BW, D = nz * BW;
  const top = GH + F * FH;
  const O = (k: string) => opt(p, k);
  const cantK = (O("cantilever") / 1.15) * (0.4 + 0.6 * p.clutter);
  SIGN_Z = Math.max(0.7, 1.15 * cantK + 0.3);

  // core volume + ground floor slab
  b.box("concreteDark", 0, top / 2, 0, W - 0.1, top, D - 0.1);
  b.box("slab", 0, GH, 0, W + 0.3, 0.25, D + 0.3);

  const sideList = sides(W, D);
  sideList.forEach(([x0, z0, ry, L], s) => {
    const srng = rng.fork(s + 1);
    const street = s === 0 || s === 1;
    const nb = Math.round(L / BW);
    b.pushT(x0, 0, z0, ry);

    // ------------------------------------------------ upper floors: module stacks
    const depthAt: number[][] = [];
    for (let i = 0; i < nb; i++) {
      const col: number[] = [];
      const tileBase = srng.pick(TILES);
      let f = 0;
      while (f < F) {
        const run = srng.int(1, O("runs"));
        const pr = srng.pick([0, 0, 0.45, 0.8, 1.15]) * cantK;
        const tile = srng.chance(O("tileMix")) ? srng.pick(TILES) : tileBase;
        for (let k = 0; k < run && f < F; k++, f++) {
          col.push(pr);
          module(b, srng.fork(i * 100 + f), p, i * BW, GH + f * FH, pr, tile, f, F);
        }
      }
      depthAt.push(col);
    }

    // slab bands
    for (let f = 1; f <= F; f++) b.box("slab", L / 2, GH + f * FH - 0.02, 0.06, L + 0.1, 0.14, 0.14);

    // pipes in the gaps between module stacks
    const nPipes = Math.round((1 + nb * 0.5) * (0.4 + p.clutter));
    for (let k = 0; k < nPipes; k++) {
      const i = srng.int(1, nb - 1);
      const r = srng.range(0.035, 0.06);
      pipeRun(b, i * BW + srng.range(-0.03, 0.03), 0, top + 0.6, 0.1 + r, r, srng.pick(["pipe", "pipePVC", "pipePVC", "rust"]));
    }
    // corner drain
    pipeRun(b, 0.15, 0, top + 0.4, 0.15, 0.06, "pipePVC");

    // cables across the facade
    const nCab = Math.round(nb * 1.5 * p.cables);
    for (let k = 0; k < nCab; k++) {
      const fa = srng.int(0, Math.min(F - 1, 6));
      const ia = srng.int(0, nb - 1), ib = Math.min(nb - 1, ia + srng.int(1, 3));
      const za = (depthAt[ia]?.[fa] ?? 0) + 0.12, zb = (depthAt[ib]?.[fa] ?? 0) + 0.12;
      cableBundle(b, srng, new Vector3(ia * BW + 0.5, GH + fa * FH + 2.6, za), new Vector3(ib * BW + 2.5, GH + fa * FH + 2.5, zb), srng.range(0.3, 0.9));
    }

    // ------------------------------------------------ ground floor shops
    for (let i = 0; i < nb; i++) shopBay(b, srng.fork(500 + i), p, pal, i * BW, street, `shop.${s}.${i}`);
    for (let i = 0; i <= nb; i++) b.box("concrete", i * BW, GH / 2, 0.12, 0.4, GH, 0.34);
    // fascia + ticker on street sides
    b.box("concreteDark", L / 2, GH - 0.45, 0.2, L, 0.9, 0.3);
    if (street && p.signs > 0.2 && O("ticker")) {
      const tw = L - 1.0;
      b.box("frame", L / 2, GH + 0.25, 0.3, tw + 0.1, 0.42, 0.12);
      const msg = b.text(`ticker.${s}`, srng.pick(EN_WORDS) + "  " + srng.pick(CJK_WORDS) + "  OPEN 24H  " + srng.pick(EN_WORDS), "sign", "LED ticker", { maxLen: 60 });
      face(b, tickerMaterial(msg, srng.pick(["ff3b1f", "ffb000", "35ff6a"]), tw, 0.34), L / 2, GH + 0.25, 0.362, tw, 0.34);
      b.textProxy(`ticker.${s}`, L / 2, GH + 0.25, 0.36, tw, 0.45, 0.25);
    }

    // ------------------------------------------------ blade signs over the street
    const density = street ? p.signs : p.signs * 0.35;
    for (let i = 0; i <= nb; i++) {
      if (i === 0 && s === 1) continue; // corner neon lives there
      if (!srng.chance(density * 0.85)) continue;
      let yb = GH + srng.range(0.3, 1.2);
      const tiers = O("bladeTiers");
      const yMax = Math.min(top - 2, GH + FH * (3 + tiers * 1.5));
      for (let c = 0; c < tiers; c++) {
        if (c > 0 && !srng.chance(0.25 + 0.45 * density)) break;
        const ysz = bladeSign(b, srng, p, pal, i * BW + (i === 0 ? 0.25 : i === nb ? -0.25 : 0), yb, top, `blade.${s}.${i}.${c}`);
        yb += ysz + srng.range(0.4, 1.5);
        if (yb > yMax) break;
      }
    }
    b.pop();
  });

  // ------------------------------------------------ corner neon tube sign (front-right)
  if (p.signs > 0.1 && O("corner")) cornerNeon(b, rng.fork(77), pal, W, D, top);

  // ------------------------------------------------ roof
  roof(b, rng.fork(99), p, pal, W, D, top);

  return { halfW: W / 2, halfD: D / 2, height: top + 8 };
}

function module(b: Builder, rng: Rng, p: Params, x0: number, y0: number, pr: number, tile: string, f: number, F: number): void {
  const xc = x0 + BW / 2;
  const fz = Math.max(pr, 0.07);
  if (pr > 0) {
    b.box(tile, xc, y0 + FH / 2, pr / 2, BW - 0.12, FH - 0.06, pr);
    b.box("slab", xc, y0 + 0.05, pr / 2 + 0.03, BW - 0.06, 0.12, pr + 0.06);
  } else {
    b.box(tile, xc, y0 + FH / 2, 0.035, BW - 0.12, FH - 0.06, 0.07);
  }
  const forced = opt(p, "windows");
  const r0 = rng.next();
  const kind = forced > 0 && rng.chance(0.85) ? [0.2, 0.5, 0.7][forced - 1] : r0;
  const cages = opt(p, "cages"), wash = opt(p, "laundry");
  const wy = y0 + 0.95;
  if (kind < 0.42) {
    // sliding window
    const w = rng.range(1.5, 2.1), h = rng.range(1.15, 1.4);
    const cx = xc + rng.range(-0.25, 0.25);
    framedWindow(b, rng, cx, wy + h / 2, fz, w, h, { frame: rng.chance(0.6) ? "frameLight" : "frame", cols: 2 });
    if (rng.chance(cages * p.clutter) && f < F - 1) cage(b, rng, cx, wy, w, h, fz + 0.38);
    else if (rng.chance(wash * p.clutter)) laundry(b, rng, cx, wy + h + 0.18, w, fz + 0.65);
  } else if (kind < 0.62) {
    // two small windows
    for (const o of [-0.62, 0.62]) {
      if (rng.chance(0.15)) continue;
      framedWindow(b, rng, xc + o, wy + 0.55, fz, 0.8, 1.05, { frame: "frame", cols: 1, rows: rng.chance(0.5) ? 2 : 1 });
      if (rng.chance(cages * 0.7 * p.clutter)) cage(b, rng, xc + o, wy, 0.8, 1.05, fz + 0.3);
    }
  } else if (kind < 0.82) {
    // enclosed balcony: wide glazing behind a cage
    const w = BW - 0.5, h = 1.55;
    framedWindow(b, rng, xc, wy + h / 2 - 0.05, fz, w, h, { frame: "frameLight", cols: 4, sill: false });
    b.box("tileE", xc, wy - 0.45, fz + 0.04, w + 0.1, 0.8, 0.08);
    if (rng.chance(Math.min(1, cages * 1.4) * p.clutter)) cage(b, rng, xc, wy - 0.05, w, h, fz + 0.45);
    if (rng.chance(Math.min(1, wash * 1.6) * p.clutter)) laundry(b, rng, xc, wy + h + 0.05, w - 0.2, fz + 0.5);
  } else {
    // small window + louvred vent
    framedWindow(b, rng, xc - 0.5, wy + 0.5, fz, 0.9, 0.95, { cols: 1 });
    vent(b, xc + 0.75, wy + 0.8, fz + 0.03, 0.6, 0.45);
  }
  // AC units
  if (rng.chance(p.ac * 0.75)) {
    const ax = xc + rng.pick([-1, 1]) * rng.range(0.7, 1.0);
    acUnit(b, rng, ax, y0 + rng.pick([0.2, 2.15]), fz, rng.range(0.85, 1.05));
    if (rng.chance(p.ac * 0.25)) acUnit(b, rng, xc - (ax - xc), y0 + 0.2, fz, 0.8);
  }
  if (rng.chance(0.08 * p.clutter)) junction(b, rng, x0 + 0.4, y0 + 2.2);
  if (pr > 0.4 && rng.chance(0.25 * p.ac)) {
    // drip stain pipe under the module
    b.barXYZ("pipePVC", xc + 1.2, y0 + 0.05, pr - 0.1, xc + 1.2, y0 - 0.5, pr - 0.1, 0.02, 5);
  }
}

function shopBay(b: Builder, rng: Rng, p: Params, pal: readonly string[], x0: number, street: boolean, id: string): void {
  const xc = x0 + BW / 2;
  const w = BW - 0.4;
  const kind = street ? rng.next() : rng.next() * 0.6 + 0.4;
  const color = rng.pick(pal);
  // wall behind (back of the shop / shutter)
  if (kind < 0.55) {
    // open shop: big glass with a lit interior, door
    winQuad(b, xc, 0.15 + (GH - 1.35) / 2, 0.04, w, GH - 1.35, rng.next() * 997, STYLE.shop);
    b.box("frame", xc, GH - 1.15, 0.08, w, 0.08, 0.1);
    b.box("frame", xc, 0.12, 0.08, w, 0.12, 0.12);
    b.box("frame", xc + w * 0.18, (GH - 1.2) / 2, 0.08, 0.06, GH - 1.2, 0.1);
    b.box("frame", xc - w * 0.18, (GH - 1.2) / 2, 0.08, 0.06, GH - 1.2, 0.1);
    if (rng.chance(0.5)) awning(b, xc, GH - 1.05, w, rng.range(1.0, 1.6), rng.pick(["awningRed", "awningTeal", "awningYellow", "awningBlue"]));
    if (rng.chance(0.35)) lanterns(b, rng, new Vector3(x0 + 0.25, GH - 1.15, 0.6), new Vector3(x0 + BW - 0.25, GH - 1.15, 0.6), rng.pick(["ff3b1f", "ff6a1a", color]), 0.25);
    glow(b, xc, 0.03, 1.4, w, 2.6, "ffcf9a", 0.12, 0, -Math.PI / 2);
  } else {
    b.box("concreteDark", xc, GH / 2, 0.02, w, GH, 0.04);
    shutter(b, xc, w - 0.1, GH - 1.3, rng.range(0.55, 1.0));
  }
  // shop sign on the fascia
  if (rng.chance(0.25 + p.signs * 0.7)) {
    const cjk = rng.chance(0.65);
    const text = b.text(id, cjk ? rng.pick(CJK_WORDS) : rng.pick(EN_WORDS), "sign", "Shop sign", { maxLen: 12 });
    const style = rng.pick(["lightbox", "lightbox", "neon", "lightboxDark"] as const);
    const { tex, aspect } = signTexture(text, style, color, false, style === "lightbox" ? rng.pick(["111111", "c0102a", "1a2a8a"]) : "ffffff");
    const sw = Math.min(w, 0.78 * aspect);
    const sh = sw / aspect;
    signBox(b, xc, GH - 0.55, 0.42, sw, sh, 0.16, 0, signMaterial(tex, style === "lightbox" ? 1.7 : 3.2, rng.chance(0.15) ? rng.int(1, 4) : 0), false);
    b.textProxy(id, xc, GH - 0.55, 0.42, sw, sh, 0.3);
  }
  if (street && rng.chance(0.18)) vendingMachine(b, rng, x0 + 0.05 + (rng.chance(0.5) ? 0.55 : BW - 0.6), 0.32, rng.pick(["e8f4ff", "9fe0ff", "ffe0a0"]));
}

/** vertical blade sign perpendicular to the wall at x; returns its height */
function bladeSign(b: Builder, rng: Rng, p: Params, pal: readonly string[], x: number, yb: number, top: number, id: string): number {
  const n = rng.int(2, 4);
  let text = rng.pick(CJK_WORDS);
  if ([...text].length > n + 1) text = [...text].slice(0, n + 1).join("");
  text = b.text(id, text, "sign", "Blade sign (vertical)", { vertical: true, maxLen: 6 });
  const picked = rng.pick(["neon", "lightbox", "lightbox", "outline", "lightboxDark"] as const);
  const style = ([picked, "lightbox", "neon", "outline"] as const)[opt(p, "bladeStyle")];
  const color = rng.pick(pal);
  const accent = style === "lightbox" ? rng.pick(["111111", "b00020", "ffffff"]) : rng.pick(pal);
  const { tex, aspect } = signTexture(text, style, color, true, accent);
  const sw = rng.range(0.8, 1.25);
  const sh = Math.min(sw / aspect, top - yb - 1);
  const zc = SIGN_Z + sw / 2;
  const yc = yb + sh / 2;
  const ch = rng.chance(0.2) ? rng.int(1, 5) : 0;
  signBox(b, x, yc, zc, sw, sh, 0.22, Math.PI / 2, signMaterial(tex, style === "lightbox" ? 1.9 : 3.6, ch), true);
  b.textProxy(id, x, yc, zc, 0.4, sh, sw);
  // neon edge tube on some
  if (rng.chance(0.4)) {
    const ek = `neon:${rng.pick(pal)}:${ch}:5`;
    b.tube(ek, [new Vector3(x, yb - 0.08, SIGN_Z - 0.02), new Vector3(x, yb - 0.08, SIGN_Z + sw + 0.08), new Vector3(x, yb + sh + 0.08, SIGN_Z + sw + 0.08), new Vector3(x, yb + sh + 0.08, SIGN_Z - 0.02)], 0.025, 5, false, 0);
  }
  // brackets
  for (const yy of [yb + 0.25, yb + sh - 0.25]) {
    b.box("metalDark", x, yy, SIGN_Z / 2, 0.06, 0.06, SIGN_Z + 0.1);
    b.barXYZ("metalDark", x, yy - 0.6, 0.15, x, yy, SIGN_Z * 0.85, 0.02, 4);
  }
  glow(b, x, yc, SIGN_Z + sw / 2, sw * 3.2, sh * 1.6, color, 0.16, Math.PI / 2);
  glow(b, x, yc, 1.3, sw * 2.6, sh * 1.3, color, 0.12);
  if (rng.chance(0.55)) b.light(x, yc, zc + 0.2, "#" + color, 6 * sh, 9);
  return sh;
}

function cornerNeon(b: Builder, rng: Rng, pal: readonly string[], W: number, D: number, top: number): void {
  const word = b.text("corner", rng.pick(["HOTEL", "NEON", "BAR", "LOVE", "MOTEL", "DREAM", "CYBER", "LUCKY"]), "neon", "Corner neon (vertical)", { vertical: true, maxLen: 8 });
  const color = rng.pick(pal);
  const lh = 0.85;
  const s = lh / 6;
  const totalH = ([...word].length * 7.6 - 1.6) * s;
  const yTop = Math.min(top - 1.5, GH + 1.2 + totalH + 6);
  const out = 1.9;
  b.pushT(W / 2, 0, D / 2, Math.PI / 4);
  // arm brackets
  const by = yTop - totalH - 0.4;
  b.box("metalDark", 0, (by + yTop + 0.4) / 2, out * 0.45, 0.12, yTop - by + 0.8, out * 0.9);
  b.box("frame", 0, (by + yTop + 0.4) / 2, out, 1.25, yTop - by + 0.9, 0.18);
  for (const sgn of [-1, 1]) b.box("metalBare", sgn * 0.62, (by + yTop + 0.4) / 2, out + 0.1, 0.04, yTop - by + 0.9, 0.04);
  const key = `neon:${color}:0:6`;
  neonText(b, word, -2 * s, yTop - lh, out + 0.18, lh, key, { vertical: true, brokenKey: `neon:${color}:5:6`, brokenIndex: rng.int(0, word.length - 1) });
  // a heart / arrow tube on top
  neonText(b, rng.pick(["♥", ">", "!"]), -2 * s, yTop + 0.25, out + 0.18, lh * 0.8, `neon:${rng.pick(pal)}:2:6`);
  glow(b, 0, (by + yTop) / 2, out + 0.3, 6, totalH * 1.8, color, 0.25);
  b.light(0, (by + yTop) / 2, out + 1.5, "#" + color, 30, 16);
  b.textProxy("corner", 0, (by + yTop) / 2, out + 0.2, 1.4, yTop - by + 0.8, 0.5);
  b.pop();
}

function roof(b: Builder, rng: Rng, p: Params, pal: readonly string[], W: number, D: number, top: number): void {
  b.box("roof", 0, top + 0.1, 0, W, 0.2, D);
  // parapet
  for (const [x0, z0, ry, L] of sides(W, D)) {
    b.pushT(x0, top, z0, ry);
    b.box("concrete", L / 2, 0.55, -0.12, L, 0.9, 0.24);
    b.box("slab", L / 2, 1.02, -0.12, L + 0.1, 0.08, 0.34);
    b.pop();
  }
  const y = top + 0.2;
  // stair hut
  const hx = -W / 2 + 3.5, hz = -D / 2 + 3;
  b.box("concreteLight", hx, y + 1.5, hz, 3, 3, 3.2);
  b.box("slab", hx, y + 3.05, hz, 3.3, 0.12, 3.5);
  b.box("metalPanel", hx + 0.6, y + 1.05, hz + 1.61, 0.9, 2.1, 0.05);
  b.box("emit:ffd9a0:4", hx + 0.6, y + 2.35, hz + 1.66, 0.3, 0.12, 0.08);
  b.light(hx + 0.6, y + 2.3, hz + 2.2, "#ffc98a", 4, 6);
  // illegal shacks
  const nShack = opt(p, "shacks");
  for (let i = 0; i < nShack; i++) {
    const sw = rng.range(2.5, 4.5), sd = rng.range(2.4, 3.6), sh = rng.range(2.3, 2.8);
    const sx = rng.range(-W / 2 + sw / 2 + 0.4, W / 2 - sw / 2 - 0.4);
    const sz = rng.range(-D / 2 + sd / 2 + 0.4, D / 2 - sd / 2 - 3.5);
    b.box(rng.pick(["corrugated", "corrugatedRust"]), sx, y + sh / 2, sz, sw, sh, sd);
    b.boxR("corrugatedRust", sx, y + sh + 0.12, sz, sw + 0.4, 0.05, sd + 0.4, 0.06, 0, 0);
    b.pushT(sx, y, sz + sd / 2);
    framedWindow(b, rng, -sw * 0.2, 1.5, 0, 0.9, 0.8, { cols: 1, sill: false });
    acUnit(b, rng, sw * 0.25, 0.4, 0, 0.9);
    b.pop();
  }
  // water tanks
  const nTank = opt(p, "tanks");
  const perRow = Math.max(1, Math.floor((W - 3) / 2.8));
  for (let i = 0; i < nTank; i++) {
    const r = rng.range(0.7, 1.2);
    waterTank(b, rng, W / 2 - 1.8 - (i % perRow) * 2.8, y, -D / 2 + 1.8 + Math.floor(i / perRow) * 2.8 + rng.range(0, 0.6), r, rng.range(1.4, 2.4));
  }
  // HVAC boxes + exhaust
  for (let i = 0; i < rng.int(2, 5); i++) {
    const bx = rng.range(-W / 2 + 1.5, W / 2 - 1.5), bz = rng.range(-D / 2 + 1, D / 2 - 4);
    b.box("acUnit", bx, y + 0.5, bz, 1.6, 1.0, 1.0);
    b.cyl("grille", bx, y + 1.02, bz, 0.4, 0.04, 14);
    if (rng.chance(0.5)) b.steamAt(bx, y + 1.1, bz);
  }
  // antennas + dishes
  let tallest = new Vector3(0, 0, 0);
  for (let i = 0; i < opt(p, "antennas"); i++) {
    const t = antenna(b, rng, rng.range(-W / 2 + 0.6, W / 2 - 0.6), y, rng.range(-D / 2 + 0.6, D / 2 - 0.6), rng.range(2.5, 7));
    if (t.y > tallest.y) tallest = t;
  }
  if (tallest.y > 0) beacon(b, tallest.x, tallest.y + 0.1, tallest.z);
  for (let i = 0; i < rng.int(2, 6); i++) {
    dish(b, rng.range(-W / 2 + 1, W / 2 - 1), y + (rng.chance(0.4) ? 3.1 : 0), rng.range(-D / 2 + 1, D / 2 - 1), rng.range(0.4, 0.9), rng.range(0, Math.PI * 2));
  }
  // cables between antennas / to the edge
  for (let i = 0; i < Math.round(6 * p.cables); i++) {
    cableBundle(b, rng, new Vector3(rng.range(-W / 2, W / 2), y + rng.range(2, 4), rng.range(-D / 2, D / 2)), new Vector3(rng.range(-W / 2, W / 2), y + rng.range(1, 3), D / 2), rng.range(0.4, 1.0));
  }
  // scaffold billboard facing the front, near the front edge
  const bbMode = opt(p, "billboard");
  if (p.signs > 0.15 && bbMode !== 3) {
    const bw = Math.min(W - 1.5, rng.range(9, 14));
    const bh = rng.range(3.4, 4.6);
    const by = y + 2.2;
    const bz = D / 2 - 1.2;
    const bx = rng.range(-(W - bw) / 2, (W - bw) / 2);
    b.pushT(bx, 0, bz);
    // lattice
    const nv = Math.round(bw / 1.6);
    for (let i = 0; i <= nv; i++) {
      const xx = -bw / 2 + (bw * i) / nv;
      b.box("metalDark", xx, (y + by + bh) / 2, -0.4, 0.1, by + bh - y, 0.1);
      b.box("metalDark", xx, (y + by) / 2, -1.6, 0.1, by - y, 0.1);
      b.barXYZ("metalDark", xx, y, -1.6, xx, by, -0.4, 0.03, 4);
      if (i < nv) {
        const xn = -bw / 2 + (bw * (i + 1)) / nv;
        b.barXYZ("metalDark", xx, by, -0.45, xn, by + bh, -0.45, 0.025, 4);
        b.barXYZ("metalDark", xn, by, -0.45, xx, by + bh, -0.45, 0.025, 4);
      }
    }
    for (const yy of [by, by + bh / 2, by + bh]) b.box("metalDark", 0, yy, -0.4, bw, 0.08, 0.08);
    b.box("metalDark", 0, by - 0.05, 0.2, bw + 0.4, 0.06, 1.2);
    railing(b, -bw / 2, bw / 2, by - 0.05, 0.75, 0.9);
    // board
    b.box("metalDark", 0, by + bh / 2, -0.2, bw, bh, 0.12);
    const color = rng.pick(pal);
    const coin = rng.chance(0.5);
    if (bbMode === 1 || (bbMode === 0 && coin)) {
      const word = b.text("billboard", rng.pick(["CYBER", "NEON", "HOTEL", "SYNTH", "DREAM", "RAMEN", "LUCKY", "NIGHT"]), "neon", "Rooftop billboard", { maxLen: 10 });
      const lh = Math.min(bh * 0.62, (bw * 0.85) / (word.length * 5.4 - 1.4) * 6);
      const tw = neonTextWidth(word, lh);
      neonText(b, word, -tw / 2, by + (bh - lh) / 2, -0.08, lh, `neon:${color}:0:6`, { brokenKey: `neon:${color}:3:6`, brokenIndex: rng.int(0, word.length - 1) });
    } else {
      const text = b.text("billboard.kanji", rng.pick(CJK_WORDS), "sign", "Rooftop billboard", { maxLen: 10 });
      const { tex, aspect } = signTexture(text, rng.pick(["neon", "outline"] as const), color, false, rng.pick(pal));
      const fw = Math.min(bw - 0.2, (bh - 0.2) * aspect);
      face(b, signMaterial(tex, 3.6, 0), 0, by + bh / 2, -0.13, fw, fw / aspect);
    }
    // flood lamps
    for (let i = 0; i < 3; i++) {
      const lx = -bw / 3 + (bw / 3) * i;
      b.barXYZ("metalDark", lx, by - 0.05, 0.5, lx, by + 0.3, 1.1, 0.02, 4);
      b.box("emit:fff1d6:6", lx, by + 0.32, 1.1, 0.3, 0.1, 0.1);
    }
    glow(b, 0, by + bh / 2, 0.4, bw * 1.5, bh * 2.4, color, 0.22);
    b.light(0, by + bh / 2, 2.5, "#" + color, 40, 22);
    b.textProxy(b.texts[b.texts.length - 1].id.slice(b.prefix.length), 0, by + bh / 2, -0.1, bw, bh, 0.6);
    b.pop();
    void plate;
  }
}
