/**
 * The street around the building: wet asphalt with blurred planar
 * reflections, puddles and rain ripples, a tiled sidewalk with curbs, lane
 * markings and zebra crossings, plus street furniture (lamps, a utility pole
 * wired to the building, bollards, manholes with steam).
 */
import {
  Group, Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry, Texture, Vector3,
} from "three";
import type { WebGLProgramParametersWithUniforms } from "three";
import { Builder } from "../gen/builder";
import { GLSL_NOISE, shared } from "../gen/materials";
import type { MaterialLib } from "../gen/materials";
import { clutter, wirePole, wireSpan } from "../gen/props";
import type { PoleWires } from "../gen/props";
import { Rng } from "../gen/rng";
import { pbr, pickVariant, texSet } from "../gen/textures";

export const SIDEWALK = 4.5;
export const ROAD = 12;

export const groundUniforms = {
  tRefl: { value: null as Texture | null },
  uTexMat: { value: new Matrix4() },
  uBlock: { value: new Vector3(20, 20, ROAD) },
  uPuddles: { value: 0.55 },
  uReflect: { value: 1.0 },
  uRain: { value: 1.0 },
};

const FRAG_PARS = /* glsl */ `
uniform sampler2D tRefl;
uniform vec3 uBlock;
uniform float uPuddles;
uniform float uReflect;
uniform float uRain;
uniform float uWet;
uniform float uTime;
uniform float uPBR;
uniform sampler2D tRoadC; uniform sampler2D tRoadN; uniform sampler2D tRoadR;
uniform sampler2D tPaveC; uniform sampler2D tPaveN; uniform sampler2D tPaveR;
uniform sampler2D tTactC; uniform sampler2D tTactN;
varying vec4 vRefl;
varying vec3 vGW;
${GLSL_NOISE}
vec2 cpRipple(vec2 p, float t) {
  vec2 acc = vec2(0.0);
  for (int k = 0; k < 3; k++) {
    vec2 cp = p * 2.2 + float(k) * vec2(0.37, 0.71);
    vec2 cell = floor(cp);
    vec2 f = fract(cp) - 0.5;
    float h = cpHash(vec3(cell, float(k)));
    vec2 off = (vec2(cpHash(vec3(cell, 3.1 + float(k))), cpHash(vec3(cell, 7.7 + float(k)))) - 0.5) * 0.6;
    float tt = fract(t * 0.8 + h);
    vec2 d = f - off;
    float r = length(d);
    float a = (1.0 - tt) * exp(-abs(r - tt * 0.45) * 45.0) * sin((r - tt * 0.45) * 80.0);
    acc += normalize(d + 1e-4) * a;
  }
  return acc;
}
`;

function groundMaterial(): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color: 0x1a1a1d, roughness: 0.8, metalness: 0, envMapIntensity: 0.6 });
  m.onBeforeCompile = (s: WebGLProgramParametersWithUniforms) => {
    Object.assign(s.uniforms, groundUniforms);
    Object.assign(s.uniforms, groundTex, { uPBR: pbr.uPBR });
    s.uniforms.uWet = shared.uWet;
    s.uniforms.uTime = shared.uTime;
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\n uniform mat4 uTexMat;\n varying vec4 vRefl;\n varying vec3 vGW;")
      .replace("#include <project_vertex>", "#include <project_vertex>\n vec4 gw = modelMatrix * vec4(transformed, 1.0); vGW = gw.xyz; vRefl = uTexMat * gw;");
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\n" + FRAG_PARS)
      .replace("#include <color_fragment>", `#include <color_fragment>
        vec2 xz = vGW.xz;
        vec2 ax = abs(xz);
        float inBlock = step(ax.x, uBlock.x) * step(ax.y, uBlock.y);
        float outer = 1.0 - step(ax.x, uBlock.x + uBlock.z) * step(ax.y, uBlock.y + uBlock.z);
        float walk = max(inBlock, outer);
        float grain = cpNoise(vec3(xz * 18.0, 0.0)) * 0.5 + cpNoise(vec3(xz * 3.0, 1.0)) * 0.5;
        float aPatch = smoothstep(0.45, 0.7, cpFbm(vec3(xz * 0.15, 2.0)));
        vec3 asphalt = vec3(0.055, 0.055, 0.06) * (0.75 + 0.5 * grain) * (1.0 - aPatch * 0.25);
        // tiles
        vec2 tc = xz / 0.6;
        vec2 tg = abs(fract(tc) - 0.5);
        float grout = smoothstep(0.44, 0.48, max(tg.x, tg.y));
        vec3 tile = mix(vec3(0.16, 0.155, 0.15) * (0.8 + 0.4 * cpHash(vec3(floor(tc), 1.0))), vec3(0.05), grout);
        // Improved textures: real asphalt, paving stones, and a yellow tactile strip along the curb
        vec2 gUV = vec2(xz.x, -xz.y);
        float tactile = inBlock * step(0.55, min(uBlock.x - ax.x, uBlock.y - ax.y)) * step(min(uBlock.x - ax.x, uBlock.y - ax.y), 0.85);
        float gTexR = 0.85;
        if (uPBR > 0.5) {
          asphalt = texture2D(tRoadC, gUV / 5.0).rgb * 0.55 * (1.0 - aPatch * 0.15);
          vec3 pv = texture2D(tPaveC, gUV / 2.4).rgb;
          tile = mix(vec3(dot(pv, vec3(0.299, 0.587, 0.114))), pv, 0.35) * 0.42;
          tile = mix(tile, texture2D(tTactC, gUV / 1.2).rgb * 0.8, tactile);
          gTexR = mix(texture2D(tRoadR, gUV / 5.0).r, texture2D(tPaveR, gUV / 2.4).r, inBlock);
        }
        vec3 col = mix(asphalt, tile, inBlock);
        vec3 plainC = vec3(0.032, 0.031, 0.036) * (0.92 + 0.16 * grain);
        col = mix(col, plainC, outer);
        // markings on the road ring
        float road = (1.0 - walk);
        float paint = 0.0;
        // lane centre lines (dashed) of the four roads
        float cx = abs(ax.x - (uBlock.x + uBlock.z * 0.5));
        float cz = abs(ax.y - (uBlock.y + uBlock.z * 0.5));
        float dashZ = step(0.5, fract(xz.y / 6.0));
        float dashX = step(0.5, fract(xz.x / 6.0));
        paint = max(paint, step(cx, 0.08) * dashZ * step(ax.y, uBlock.y));
        paint = max(paint, step(cz, 0.08) * dashX * step(ax.x, uBlock.x));
        // zebra crossings at the corners
        float zx = step(ax.x, uBlock.x - 1.0) * step(uBlock.x - 4.5, ax.x) * step(uBlock.y + 0.6, ax.y) * step(ax.y, uBlock.y + uBlock.z - 0.6);
        float zz = step(ax.y, uBlock.y - 1.0) * step(uBlock.y - 4.5, ax.y) * step(uBlock.x + 0.6, ax.x) * step(ax.x, uBlock.x + uBlock.z - 0.6);
        paint = max(paint, zx * step(0.5, fract(xz.y / 1.0)));
        paint = max(paint, zz * step(0.5, fract(xz.x / 1.0)));
        // yellow kerb lines
        float kerb = step(abs(ax.x - uBlock.x - 0.35), 0.06) * step(ax.y, uBlock.y) + step(abs(ax.y - uBlock.y - 0.35), 0.06) * step(ax.x, uBlock.x);
        // white edge line where the road meets the open plane
        float edgeOut = step(abs(ax.x - (uBlock.x + uBlock.z - 0.4)), 0.08) * step(ax.y, uBlock.y + uBlock.z - 0.32)
                      + step(abs(ax.y - (uBlock.y + uBlock.z - 0.4)), 0.08) * step(ax.x, uBlock.x + uBlock.z - 0.32);
        paint = max(paint, clamp(edgeOut, 0.0, 1.0));
        paint *= road;
        float wornP = smoothstep(0.25, 0.6, cpNoise(vec3(xz * 4.0, 5.0)));
        col = mix(col, vec3(0.55) * (0.6 + 0.4 * wornP), paint * 0.85);
        col = mix(col, vec3(0.5, 0.38, 0.05), clamp(kerb, 0.0, 1.0) * road * 0.8);
        // puddles: water collects in the road, less on tiles
        float pm = cpFbm(vec3(xz * 0.22, 9.0)) + grain * 0.06 - 0.02 * walk;
        float puddle = smoothstep(0.62 - uPuddles * 0.22, 0.66 - uPuddles * 0.22, pm) * uWet * (1.0 - outer);
        float wet = uWet * (1.0 - 0.55 * outer);
        diffuseColor.rgb = col * mix(1.0, 0.45, wet) * (1.0 - puddle * 0.6);
        float cpPud = puddle;
        float cpWetG = wet;
        float cpGrout = grout * inBlock * (1.0 - step(0.5, uPBR));
        float cpTexR = gTexR;
        float cpInBlock = inBlock;
        float cpTactile = tactile;
        vec2 cpGUV = gUV;`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        roughnessFactor = mix(cpTexR, 0.32, cpWetG);
        roughnessFactor = mix(roughnessFactor, 0.03, cpPud);
        roughnessFactor = mix(roughnessFactor, 0.12, cpGrout * cpWetG);`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        if (uPBR > 0.5) {
          vec3 gn = mix(texture2D(tRoadN, cpGUV / 5.0).xyz, texture2D(tPaveN, cpGUV / 2.4).xyz, cpInBlock);
          gn = mix(gn, texture2D(tTactN, cpGUV / 1.2).xyz, cpTactile) * 2.0 - 1.0;
          gn.xy *= 1.0 - 0.6 * cpPud;  // standing water is flat
          vec3 gw = normalize(vec3(gn.x, max(gn.z, 0.05), -gn.y));
          normal = normalize((viewMatrix * vec4(gw, 0.0)).xyz);
        }`)
      .replace("#include <opaque_fragment>", `
        {
          vec3 V = normalize(cameraPosition - vGW);
          float ndv = clamp(V.y, 0.0, 1.0);
          float fres = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);
          vec2 rip = cpRipple(vGW.xz, uTime) * uRain * uWet;
          vec2 ruv = vRefl.xy / vRefl.w;
          float lod = mix(4.0, 0.5, cpPud);
          vec2 jit = (vec2(cpNoise(vec3(vGW.xz * 6.0, 1.0)), cpNoise(vec3(vGW.xz * 6.0, 4.0))) - 0.5) * mix(0.03, 0.004, cpPud);
          ruv += rip * mix(0.004, 0.02, cpPud) + jit;
          // vertical streaks: taps stretched along screen y
          float spread = mix(0.018, 0.004, cpPud);
          vec3 refl = vec3(0.0);
          float wsum = 0.0;
          for (int i = -3; i <= 3; i++) {
            float w = exp(-float(i * i) * 0.25);
            refl += textureLod(tRefl, ruv + vec2(0.0, float(i) * spread), lod).rgb * w;
            wsum += w;
          }
          refl /= wsum;
          float strength = mix(0.35 * cpWetG, 1.0, cpPud) * mix(fres, 1.0, 0.25 + 0.45 * cpPud);
          outgoingLight += refl * strength * uReflect;
        }
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => "ground-pbr";
  return m;
}

const roadSet = texSet("road-0"), paveSet = texSet("paving-0"), tactSet = texSet("tactile-0");
/** the street's texture bindings, shared by every ground material and swapped by setGroundTextures */
export const groundTex = {
  tRoadC: { value: roadSet.c }, tRoadN: { value: roadSet.n }, tRoadR: { value: roadSet.r },
  tPaveC: { value: paveSet.c }, tPaveN: { value: paveSet.n }, tPaveR: { value: paveSet.r },
  tTactC: { value: tactSet.c }, tTactN: { value: tactSet.n },
};

/** texture variety for the street: asphalt and paving sets for this seed / shuffle */
export function setGroundTextures(seed: number, shuffle: number): void {
  const road = texSet(pickVariant("road", "street", seed, shuffle).id);
  const pave = texSet(pickVariant("paving", "sidewalk", seed, shuffle).id);
  groundTex.tRoadC.value = road.c;
  groundTex.tRoadN.value = road.n;
  groundTex.tRoadR.value = road.r;
  groundTex.tPaveC.value = pave.c;
  groundTex.tPaveN.value = pave.n;
  groundTex.tPaveR.value = pave.r;
}

export interface StageResult {
  group: Group;
  builder: Builder;
}

export function buildStage(halfW: number, halfD: number, seed: number, mats: MaterialLib, attach: Vector3[]): StageResult {
  const bx = halfW + SIDEWALK, bz = halfD + SIDEWALK;
  groundUniforms.uBlock.value.set(bx, bz, ROAD);
  const group = new Group();
  const gm = groundMaterial();
  const road = new Mesh(new PlaneGeometry(1200, 1200).rotateX(-Math.PI / 2), gm);
  road.userData.noReflect = true;
  road.userData.ground = true;
  group.add(road);
  const walk = new Mesh(new PlaneGeometry(bx * 2, bz * 2).rotateX(-Math.PI / 2).translate(0, 0.15, 0), gm);
  walk.userData.noReflect = true;
  walk.userData.ground = true;
  group.add(walk);

  const b = new Builder();
  const rng = new Rng(seed * 31 + 5);
  // curbs
  b.box("sidewalkCurb", 0, 0.08, bz, bx * 2 + 0.3, 0.16, 0.3);
  b.box("sidewalkCurb", 0, 0.08, -bz, bx * 2 + 0.3, 0.16, 0.3);
  b.box("sidewalkCurb", bx, 0.08, 0, 0.3, 0.16, bz * 2);
  b.box("sidewalkCurb", -bx, 0.08, 0, 0.3, 0.16, bz * 2);

  // ------------------------------------------------ utility poles + wires
  // A ring of poles just inside the curb, all round the block, plus a line on
  // the far side of the front and right streets. Every pole's +z faces the
  // road, so its lamp lights the street. Wires run pole to pole, across the
  // streets and into the building's front facade.
  const lampC = () => rng.pick(["cfe6ff", "ffd6a0", "cfe6ff"]);
  const inset = 0.75;
  const px = bx - inset, pz = bz - inset;
  const corners: [number, number][] = [[-px, pz], [px, pz], [px, -pz], [-px, -pz]];
  const normals: [number, number][] = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  const ring: { w: PoleWires; side: number }[] = [];
  b.pushT(0, 0.15, 0);
  for (let sd = 0; sd < 4; sd++) {
    const [x0, z0] = corners[sd];
    const [x1, z1] = corners[(sd + 1) % 4];
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 13));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      let [ox, oz] = normals[sd];
      if (i === 0) {
        // corner pole: face diagonally out
        ox += normals[(sd + 3) % 4][0];
        oz += normals[(sd + 3) % 4][1];
      }
      const lit = sd < 2 || (i === 0 && sd === 2);
      const w = wirePole(b, rng, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, Math.atan2(ox, oz), {
        lamp: lampC(), light: lit, transformer: rng.chance(0.3),
      });
      ring.push({ w, side: sd });
    }
  }
  b.pop();
  for (let i = 0; i < ring.length; i++) wireSpan(b, rng, ring[i].w, ring[(i + 1) % ring.length].w);

  // outer contour: a ring of poles on the far side of every street, facing in
  const fx = bx + ROAD + inset, fz = bz + ROAD + inset;
  const oCorners: [number, number][] = [[-fx, fz], [fx, fz], [fx, -fz], [-fx, -fz]];
  const outer: { w: PoleWires; side: number }[] = [];
  for (let sd = 0; sd < 4; sd++) {
    const [x0, z0] = oCorners[sd];
    const [x1, z1] = oCorners[(sd + 1) % 4];
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 13));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      let [ox, oz] = normals[sd];
      if (i === 0) {
        ox += normals[(sd + 3) % 4][0];
        oz += normals[(sd + 3) % 4][1];
      }
      const w = wirePole(b, rng, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, Math.atan2(-ox, -oz), { lamp: lampC(), transformer: rng.chance(0.25) });
      outer.push({ w, side: sd });
    }
  }
  for (let i = 0; i < outer.length; i++) wireSpan(b, rng, outer[i].w, outer[(i + 1) % outer.length].w);

  // wires across the streets: each outer pole to the nearest pole on the block
  const near = (q: Vector3, side: number) => ring.filter(r => r.side === side)
    .reduce((best, r) => (r.w.tel[0].distanceTo(q) < best.w.tel[0].distanceTo(q) ? r : best)).w;
  for (const { w: fw, side } of outer) {
    const nw = near(fw.tel[0], side);
    for (const k of [0, 3, 4, 7]) if (rng.chance(0.75)) b.cable("rubber", fw.power[k], nw.power[k], rng.range(1.6, 2.6), 0.011);
    b.cable("rubber", fw.tel[0], nw.tel[0], rng.range(2.2, 3.2), 0.03);
    if (rng.chance(0.5)) b.cable("rubber", fw.tel[1], nw.tel[2], rng.range(2.4, 3.4), 0.02);
  }

  // drops from the front poles into the building
  const front = ring.filter(r => r.side === 0).map(r => r.w);
  attach.forEach((pt, i) => {
    const pw = front.reduce((best, w) => (Math.abs(w.tel[0].x - pt.x) < Math.abs(best.tel[0].x - pt.x) ? w : best));
    b.cable("rubber", pw.tel[i % pw.tel.length], pt, rng.range(0.6, 1.4), rng.range(0.012, 0.022));
  });
  b.pushT(0, 0.15, 0);
  // bollards + clutter
  for (let x = -bx + 2; x < bx - 2; x += 2.2) {
    if (Math.abs(x) < 3) continue;
    if (rng.chance(0.5)) b.cyl("paintYellow", x, 0.45, bz - 0.35, 0.09, 0.9, 10);
  }
  for (let i = 0; i < 6; i++) {
    const onFront = rng.chance(0.6);
    const x = onFront ? rng.range(-halfW + 1, halfW - 1) : halfW + rng.range(0.8, 1.6);
    const z = onFront ? halfD + rng.range(0.8, 1.6) : rng.range(-halfD + 1, halfD - 1);
    clutter(b, rng, x, z);
  }
  b.pop();
  // manholes with steam
  for (let i = 0; i < 3; i++) {
    const x = rng.range(-bx, bx), z = bz + ROAD * rng.range(0.25, 0.75);
    b.cyl("metalDark", x, 0.01, z, 0.45, 0.02, 20);
    b.steamAt(x, 0.05, z);
  }
  const x = bx + ROAD * 0.5, z = rng.range(-bz, bz);
  b.cyl("metalDark", x, 0.01, z, 0.45, 0.02, 20);
  b.steamAt(x, 0.05, z);

  group.add(b.build(mats));
  return { group, builder: b };
}
