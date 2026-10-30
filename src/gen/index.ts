import { Group, Vector3 } from "three";
import { TYPE_INFO } from "./types";
import { Builder } from "./builder";
import { buildArcology } from "./arcology";
import { buildCapsule } from "./capsule";
import { buildHive } from "./hive";
import type { MaterialLib } from "./materials";
import type { BuildResult, Params } from "./types";
import type { TextSpec } from "./builder";
import { NEON_CHARS } from "./neonfont";

type Gen = (p: Params, b: Builder) => { halfW: number; halfD: number; height: number; attach?: Vector3[] };
const GENERATORS: Record<Exclude<Params["type"], "lineup">, Gen> = { hive: buildHive, arcology: buildArcology, capsule: buildCapsule };

export interface Generated extends BuildResult {
  attach: Vector3[];
  /** every editable text slot in the building */
  texts: TextSpec[];
}

export function generate(p: Params, mats: MaterialLib): Generated {
  if (p.type === "lineup") return generateLineup(p, mats);
  const b = new Builder();
  b.prefix = p.type + ".";
  b.overrides = p.texts ?? {};
  b.neonChars = NEON_CHARS;
  const t0 = performance.now();
  const dims = GENERATORS[p.type](p, b);
  const group = b.build(mats);
  console.info(`[gen] ${p.type}: ${b.parts.size} merged meshes, ${b.extras.length} extras, ${(performance.now() - t0).toFixed(0)} ms`);
  // where the utility pole's cables meet the front facade
  const attach = dims.attach ?? [0.15, 0.3, 0.45, 0.2, 0.35, 0.5].map((t, i) => new Vector3(-dims.halfW + dims.halfW * 2 * t, 5.4 + (i % 3) * 0.5, dims.halfD + 0.35));
  return { group, lights: b.lights, steam: b.steam, animators: b.animators, halfW: dims.halfW, halfD: dims.halfD, height: dims.height, attach, texts: b.texts };
}

/** all three buildings side by side, left to right: HIVE, ARCOLOGY, CAPSULE */
function generateLineup(p: Params, mats: MaterialLib): Generated {
  const order = ["hive", "arcology", "capsule"] as const;
  const shared = { seed: p.seed, palette: p.palette, clutter: p.clutter, signs: p.signs, ac: p.ac, cables: p.cables };
  const parts = order.map(type => {
    const sub = { ...p, ...TYPE_INFO[type].defaults, ...shared, type, opts: {} } as Params;
    if (type === "arcology") sub.floors = 28; // keep the tower in frame next to the others
    return generate(sub, mats);
  });
  const GAP = 9;
  const total = parts.reduce((a, r) => a + r.halfW * 2, 0) + GAP * (parts.length - 1);
  const group = new Group();
  const out: Generated = { group, lights: [], steam: [], animators: [], halfW: total / 2, halfD: 0, height: 0, attach: [], texts: [] };
  let x = -total / 2;
  parts.forEach((r, i) => {
    const cx = x + r.halfW;
    x += r.halfW * 2 + GAP;
    r.group.position.x = cx;
    group.add(r.group);
    const off = new Vector3(cx, 0, 0);
    for (const l of r.lights) l.pos.add(off);
    out.lights.push(...r.lights);
    out.steam.push(...r.steam.map(v => v.add(off)));
    out.animators.push(...r.animators);
    out.texts.push(...r.texts);
    out.halfD = Math.max(out.halfD, r.halfD);
    out.height = Math.max(out.height, r.height);
    if (i === 0) out.attach = r.attach.map(v => v.add(off));
  });
  // the street block is as deep as the deepest footprint: pull the others' cable anchors to its front
  for (const a of out.attach) a.z = out.halfD + 0.35;
  return out;
}
