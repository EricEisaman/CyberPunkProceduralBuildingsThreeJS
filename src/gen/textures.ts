/**
 * "Improved textures": CC0 PBR sets from ambientCG and Poly Haven, grouped
 * into families (src/gen/texManifest.ts, made by tools/prep_textures.py; the
 * credits are in public/tex/CREDITS.txt). Every set is a colour, a normal and
 * a roughness map.
 *
 * All sets load with the preloader and stay bound to the materials:
 * `pbr.uPBR` switches between the procedural look and the textures, and
 * `pickVariant` chooses which set of a family a material uses (from the
 * seed + a shuffle counter), so both changes are instant.
 */
import { Color, LoadingManager, RepeatWrapping, SRGBColorSpace, Texture, TextureLoader } from "three";
import { TEX_FAMILIES } from "./texManifest";
import type { TexFamily, TexVariant } from "./texManifest";

export type { TexFamily, TexVariant };

export interface TexSet {
  c: Texture;
  n: Texture;
  r: Texture;
}

/** shared switch: 0 = procedural, 1 = textured */
export const pbr = { uPBR: { value: 0 }, tLeak: { value: new Texture() } };

const manager = new LoadingManager();
const loader = new TextureLoader(manager);
const sets = new Map<string, TexSet>();
const base = import.meta.env.BASE_URL + "tex/";

function load(url: string, color: boolean): Texture {
  const t = loader.load(url);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  if (color) t.colorSpace = SRGBColorSpace;
  return t;
}

export function texSet(id: string): TexSet {
  let s = sets.get(id);
  if (!s) {
    s = { c: load(`${base}${id}/color.jpg`, true), n: load(`${base}${id}/normal.jpg`, false), r: load(`${base}${id}/rough.jpg`, false) };
    sets.set(id, s);
  }
  return s;
}

export function variants(family: TexFamily): TexVariant[] {
  return TEX_FAMILIES[family];
}

/** which set of `family` the material `key` uses for this seed / shuffle */
export function pickVariant(family: TexFamily, key: string, seed: number, shuffle: number): TexVariant {
  const vs = TEX_FAMILIES[family];
  if (shuffle === 0 && seed === 0) return vs[0];
  let h = 2166136261 ^ Math.imul(seed + 1, 0x9e3779b1) ^ Math.imul(shuffle + 7, 0x85ebca6b);
  for (const ch of key + family) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return vs[(h >>> 0) % vs.length];
}

/** tint that brings a set back to the material's own colour: base / the set's average albedo (capped) */
export function tintFor(baseColor: Color, v: TexVariant, out = new Color()): Color {
  const k = 1 / Math.max(v.avg, 0.02);
  out.copy(baseColor).multiplyScalar(k);
  out.r = Math.min(out.r, 6);
  out.g = Math.min(out.g, 6);
  out.b = Math.min(out.b, 6);
  return out;
}

let ready: Promise<void> | null = null;

/** start loading every set (idempotent); onProgress(done, total) per file */
export function preloadTextures(onProgress?: (done: number, total: number) => void): Promise<void> {
  if (ready) return ready;
  ready = new Promise<void>(resolve => {
    manager.onProgress = (_url, done, total) => onProgress?.(done, total);
    manager.onLoad = () => resolve();
    manager.onError = url => console.warn("texture failed", url);
    for (const vs of Object.values(TEX_FAMILIES)) for (const v of vs) texSet(v.id);
    pbr.tLeak.value = load(`${base}leak/mask.jpg`, false);
  });
  return ready;
}
