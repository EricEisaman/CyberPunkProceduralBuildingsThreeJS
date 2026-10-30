import type { Group, Vector3 } from "three";
import type { Animator, LightSpec } from "./builder";
import type { PaletteName } from "./materials";

export type BuildingType = "hive" | "arcology" | "capsule" | "lineup";

export interface Params {
  type: BuildingType;
  seed: number;
  floors: number;
  width: number; // bays along x
  depth: number; // bays along z
  clutter: number; // 0..1: cages, laundry, plants, pipes
  signs: number; // 0..1: sign density
  ac: number; // 0..1: AC unit density
  cables: number; // 0..1
  palette: PaletteName;
  /** per-type style options (see TYPE_INFO[type].options) */
  opts: Record<string, number>;
  /** user text per sign slot id */
  texts: Record<string, string>;
}

/** a style option: a slider, an on/off toggle, or a choice (stored as its index) */
export interface OptDef {
  key: string;
  label: string;
  kind: "range" | "toggle" | "select";
  def: number;
  min?: number;
  max?: number;
  step?: number;
  choices?: string[];
  group: string;
}

/** the value of style option `key` for these params (falls back to the type's default) */
export function opt(p: Params, key: string): number {
  const v = p.opts?.[key];
  if (v !== undefined) return v;
  const d = TYPE_INFO[p.type].options.find(o => o.key === key);
  return d ? d.def : 0;
}

export interface BuildResult {
  group: Group;
  lights: LightSpec[];
  steam: Vector3[];
  animators: Animator[];
  /** footprint half sizes (incl. podium) and total height */
  halfW: number;
  halfD: number;
  height: number;
}

export interface Slider {
  key: keyof Params;
  label: string;
  min: number;
  max: number;
  step: number;
}

export const TYPE_INFO: Record<BuildingType, { name: string; tag: string; defaults: Partial<Params>; sliders: Slider[]; options: OptDef[] }> = {
  hive: {
    name: "HIVE",
    tag: "Kowloon megablock",
    defaults: { floors: 13, width: 6, depth: 4, clutter: 0.75, signs: 0.8, ac: 0.7, cables: 0.7 },
    sliders: [
      { key: "floors", label: "Floors", min: 6, max: 22, step: 1 },
      { key: "width", label: "Bays wide", min: 3, max: 9, step: 1 },
      { key: "depth", label: "Bays deep", min: 3, max: 7, step: 1 },
    ],
    options: [
      { key: "cantilever", label: "Cantilever", kind: "range", def: 1.15, min: 0, max: 1.6, step: 0.05, group: "Massing" },
      { key: "runs", label: "Stack runs", kind: "range", def: 5, min: 1, max: 10, step: 1, group: "Massing" },
      { key: "tileMix", label: "Tile variety", kind: "range", def: 0.3, min: 0, max: 1, step: 0.05, group: "Massing" },
      { key: "windows", label: "Windows", kind: "select", def: 0, choices: ["Mixed", "Sliding", "Small pairs", "Balconies"], group: "Facade" },
      { key: "cages", label: "Window cages", kind: "range", def: 0.42, min: 0, max: 1, step: 0.05, group: "Facade" },
      { key: "laundry", label: "Laundry", kind: "range", def: 0.25, min: 0, max: 1, step: 0.05, group: "Facade" },
      { key: "bladeTiers", label: "Sign tiers", kind: "range", def: 2, min: 1, max: 4, step: 1, group: "Signs" },
      { key: "bladeStyle", label: "Blade signs", kind: "select", def: 0, choices: ["Mixed", "Lightbox", "Neon", "Outline"], group: "Signs" },
      { key: "corner", label: "Corner neon", kind: "toggle", def: 1, group: "Signs" },
      { key: "ticker", label: "LED ticker", kind: "toggle", def: 1, group: "Signs" },
      { key: "billboard", label: "Billboard", kind: "select", def: 0, choices: ["Random", "Neon tubes", "Kanji board", "None"], group: "Roof" },
      { key: "shacks", label: "Roof shacks", kind: "range", def: 2, min: 0, max: 5, step: 1, group: "Roof" },
      { key: "tanks", label: "Water tanks", kind: "range", def: 3, min: 0, max: 6, step: 1, group: "Roof" },
      { key: "antennas", label: "Antennas", kind: "range", def: 7, min: 0, max: 16, step: 1, group: "Roof" },
    ],
  },
  arcology: {
    name: "ARCOLOGY",
    tag: "Megacorp tower",
    defaults: { floors: 38, width: 7, depth: 5, clutter: 0.6, signs: 0.8, ac: 0.4, cables: 0.4 },
    sliders: [
      { key: "floors", label: "Floors", min: 24, max: 70, step: 1 },
      { key: "width", label: "Width", min: 5, max: 9, step: 1 },
      { key: "depth", label: "Depth", min: 4, max: 7, step: 1 },
    ],
    options: [
      { key: "segments", label: "Setbacks", kind: "range", def: 3, min: 1, max: 4, step: 1, group: "Massing" },
      { key: "setback", label: "Setback depth", kind: "range", def: 2.4, min: 0.6, max: 5, step: 0.2, group: "Massing" },
      { key: "chamfer", label: "Chamfer", kind: "range", def: 0.32, min: 0, max: 0.48, step: 0.02, group: "Massing" },
      { key: "podium", label: "Podium floors", kind: "range", def: 3, min: 2, max: 5, step: 1, group: "Massing" },
      { key: "finEvery", label: "Fin rhythm", kind: "range", def: 4, min: 1, max: 8, step: 1, group: "Facade" },
      { key: "mechEvery", label: "Plant floor every", kind: "range", def: 12, min: 4, max: 24, step: 1, group: "Facade" },
      { key: "led", label: "Corner LEDs", kind: "select", def: 0, choices: ["Chasing", "Steady", "Off"], group: "Facade" },
      { key: "screens", label: "Ad screens", kind: "range", def: 2, min: 0, max: 2, step: 1, group: "Signs" },
      { key: "crown", label: "Crown", kind: "select", def: 0, choices: ["Blades + halo", "Halo only", "Blades only", "Plain"], group: "Crown" },
      { key: "spire", label: "Spire", kind: "toggle", def: 1, group: "Crown" },
      { key: "helipad", label: "Helipad", kind: "toggle", def: 1, group: "Crown" },
      { key: "elevators", label: "Glass elevators", kind: "toggle", def: 1, group: "Extras" },
      { key: "hologram", label: "Hologram", kind: "toggle", def: 1, group: "Extras" },
    ],
  },
  capsule: {
    name: "CAPSULE",
    tag: "Metabolist pod tower",
    defaults: { floors: 14, width: 2, depth: 4, clutter: 0.7, signs: 0.8, ac: 0.6, cables: 0.6 },
    sliders: [
      { key: "floors", label: "Pod floors", min: 6, max: 22, step: 1 },
      { key: "width", label: "Cores", min: 1, max: 2, step: 1 },
      { key: "depth", label: "Podium bays", min: 3, max: 6, step: 1 },
    ],
    options: [
      { key: "podDensity", label: "Pod density", kind: "range", def: 0.83, min: 0.2, max: 1, step: 0.05, group: "Pods" },
      { key: "darkPods", label: "Dark pods", kind: "range", def: 0.18, min: 0, max: 1, step: 0.05, group: "Pods" },
      { key: "rings", label: "Neon rings", kind: "range", def: 0.36, min: 0, max: 1, step: 0.05, group: "Pods" },
      { key: "jitter", label: "Pod jitter", kind: "range", def: 0.3, min: 0, max: 1, step: 0.05, group: "Pods" },
      { key: "coreGap", label: "Core height gap", kind: "range", def: 2, min: 0, max: 8, step: 1, group: "Cores" },
      { key: "bridgeEvery", label: "Bridge every", kind: "range", def: 4, min: 2, max: 10, step: 1, group: "Cores" },
      { key: "stalls", label: "Food stalls", kind: "range", def: 0.75, min: 0, max: 1, step: 0.05, group: "Night market" },
      { key: "lanterns", label: "Lanterns", kind: "toggle", def: 1, group: "Night market" },
      { key: "menus", label: "Menu boards", kind: "range", def: 0.82, min: 0, max: 1, step: 0.05, group: "Night market" },
      { key: "coreSign", label: "Core neon sign", kind: "toggle", def: 1, group: "Signs" },
      { key: "cube", label: "Rotating cube sign", kind: "toggle", def: 1, group: "Signs" },
    ],
  },
  lineup: {
    name: "ALL 3",
    tag: "Side-by-side lineup",
    defaults: { floors: 13, width: 6, depth: 4, clutter: 0.7, signs: 0.8, ac: 0.6, cables: 0.6 },
    sliders: [],
    options: [],
  },
};
