/**
 * Material library. Every surface is procedural (no texture files):
 *
 * - surfaces: MeshStandardMaterial + world-space patterns injected with
 *   onBeforeCompile (tile grids, panel seams, ribbed shutters, corrugated
 *   metal), grime streaks, roughness breakup, bump from the pattern, and
 *   rain wetness on up-facing faces;
 * - windows: glass that reflects the environment, with an interior-mapped
 *   room behind it (walls, floor, ceiling lamp, furniture / people
 *   silhouettes, blinds, TV flicker) drawn as emission;
 * - neon: unlit HDR tubes with a rounded core and per-channel flicker.
 *
 * Keys: "concrete", "tileA", ..., "neon:ff2a6d:2" (colour, flicker channel),
 * "emit:ffaa55:3" (colour, HDR intensity), "win", "winOffice", ...
 */
import {
  Color, DoubleSide, FrontSide, Material, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, ShaderMaterial,
  UniformsLib, UniformsUtils, Vector3,
} from "three";
import type { WebGLProgramParametersWithUniforms } from "three";
import { pbr, pickVariant, texSet, tintFor, variants } from "./textures";
import type { TexFamily } from "./textures";

export const shared = {
  uTime: { value: 0 },
  uWet: { value: 0.8 },
  uLit: { value: 0.55 },
  uRoomBright: { value: 1.0 },
  uNeon: { value: 1.0 },
  uWind: { value: new Vector3(1.5, 0, 0.6) },
};

export const GLSL_NOISE = /* glsl */ `
float cpHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float cpHash1(float n) { return fract(sin(n) * 43758.5453123); }
float cpNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(cpHash(i), cpHash(i + vec3(1,0,0)), f.x), mix(cpHash(i + vec3(0,1,0)), cpHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(cpHash(i + vec3(0,0,1)), cpHash(i + vec3(1,0,1)), f.x), mix(cpHash(i + vec3(0,1,1)), cpHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float cpFbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * cpNoise(p); p *= 2.03; a *= 0.5; } return s; }
vec3 cpPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir) {
  vec3 vSigmaX = dFdx(surf_pos); vec3 vSigmaY = dFdy(surf_pos);
  vec3 R1 = cross(vSigmaY, surf_norm); vec3 R2 = cross(surf_norm, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDir;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}
`;

const VERT_PARS = /* glsl */ `
varying vec3 vCpWPos;
varying vec3 vCpWNrm;
`;
const VERT_MAIN = /* glsl */ `
vCpWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vCpWNrm = normalize(mat3(modelMatrix) * objectNormal);
`;

/** pattern ids */
export const PAT = { plain: 0, concrete: 1, tile: 2, panel: 3, ribbed: 4, corrugated: 5, brushed: 6, pod: 7, brick: 8 } as const;

interface SurfaceOpts {
  color: number;
  rough: number;
  metal?: number;
  pattern?: number;
  grime?: number;
  bump?: number;
  scale?: number; // pattern cell size
  vary?: number; // albedo variation
  side?: boolean;
  envI?: number;
  /** "Improved textures": the PBR set, metres per texture tile, rotate 90 degrees (ribs across) */
  tex?: TexFamily;
  tScale?: number;
  tRot?: boolean;
  tRough?: number;
}

const SURF_FRAG_PARS = /* glsl */ `
varying vec3 vCpWPos;
varying vec3 vCpWNrm;
uniform float uWet;
uniform float uGrime;
uniform float uBumpS;
uniform float uCell;
uniform float uVary;
#ifdef USE_TEX
uniform sampler2D tTexC;
uniform sampler2D tTexN;
uniform sampler2D tTexR;
uniform sampler2D tLeak;
uniform float uPBR;
uniform float uTexScale;
uniform float uTexRough;
uniform float uTexRot;
uniform vec3 uTexTint;
#endif
${GLSL_NOISE}
`;

/** pattern evaluation: sets cpAlb (albedo multiplier), cpH (height), cpR (roughness multiplier), cpWetM */
const SURF_FRAG_EVAL = /* glsl */ `
vec3 cpP = vCpWPos;
vec3 cpN = normalize(vCpWNrm);
vec2 cpF;
float cpVert = 1.0 - smoothstep(0.55, 0.8, abs(cpN.y));
if (abs(cpN.y) > 0.7) { cpF = cpP.xz; } else { vec3 cpT = normalize(cross(vec3(0.0, 1.0, 0.0), cpN)); cpF = vec2(dot(cpP, cpT), cpP.y); }
float cpAlb = 1.0; float cpH = 0.0; float cpR = 1.0;
float cpDet = 1.0 - smoothstep(0.003, 0.02, length(fwidth(cpP)));
float cpN1 = cpFbm(cpP * 0.9);
float cpN2 = cpNoise(cpP * 7.0);
cpAlb *= mix(1.0 - uVary, 1.0 + uVary, cpN1);
cpH += cpN2 * 0.15;
#if PATTERN == 1
  cpH += cpFbm(cpP * 3.0) * 0.4;
  float cpForm = smoothstep(0.012, 0.0, abs(fract(cpF.y / 0.75) - 0.5) * 0.75 - 0.36);
  cpAlb *= 1.0 - cpForm * 0.08;
#elif PATTERN == 2
  vec2 cpC = cpF / uCell;
  vec2 cpG = abs(fract(cpC) - 0.5);
  float cpLine = smoothstep(0.42, 0.48, max(cpG.x, cpG.y));
  float cpTileJ = cpHash(vec3(floor(cpC), 3.1));
  cpAlb *= mix(0.86 + 0.24 * cpTileJ, 0.55, cpLine);
  cpH += (1.0 - cpLine) * 0.6;
  cpR *= mix(0.75, 1.25, cpLine);
#elif PATTERN == 3 || PATTERN == 7
  vec2 cpCell = PATTERN == 7 ? vec2(uCell, uCell * 0.55) : vec2(uCell, uCell * 0.5);
  vec2 cpC = cpF / cpCell;
  cpC.x += step(1.0, mod(floor(cpC.y), 2.0)) * 0.5 * float(PATTERN == 3);
  vec2 cpG = abs(fract(cpC) - 0.5) * cpCell;
  float cpLine = smoothstep(cpCell.y * 0.5 - 0.02, cpCell.y * 0.5 - 0.008, cpG.y) + smoothstep(cpCell.x * 0.5 - 0.02, cpCell.x * 0.5 - 0.008, cpG.x);
  cpLine = clamp(cpLine, 0.0, 1.0);
  float cpPanJ = cpHash(vec3(floor(cpC), 7.7));
  cpAlb *= mix(0.9 + 0.18 * cpPanJ, 0.45, cpLine);
  cpH += (1.0 - cpLine) * 0.5;
  #if PATTERN == 7
    vec2 cpB = abs(fract(cpC) - 0.5) * cpCell - cpCell * 0.5 + 0.07;
    float cpBolt = 1.0 - smoothstep(0.012, 0.022, length(cpB));
    cpH += cpBolt * 0.6; cpAlb *= 1.0 - cpBolt * 0.3;
  #endif
#elif PATTERN == 4
  float cpRib = sin(cpF.y * 6.2831 / uCell) * cpDet;
  cpH += cpRib * 0.5;
  cpAlb *= 0.92 + 0.08 * cpRib;
#elif PATTERN == 5
  float cpRib = sin(cpF.x * 6.2831 / uCell) * cpDet;
  cpH += cpRib * 0.6;
  cpAlb *= 0.9 + 0.1 * cpRib;
#elif PATTERN == 6
  cpH += cpNoise(vec3(cpF.x * 300.0, cpF.y * 3.0, 0.0)) * 0.1;
  cpR *= 0.85 + 0.3 * cpNoise(vec3(cpF.x * 80.0, cpF.y * 2.0, 1.0));
#elif PATTERN == 8
  vec2 cpC = cpF / vec2(0.24, 0.075);
  cpC.x += step(1.0, mod(floor(cpC.y), 2.0)) * 0.5;
  vec2 cpG = abs(fract(cpC) - 0.5) * vec2(0.24, 0.075);
  float cpLine = max(smoothstep(0.029, 0.035, cpG.y), smoothstep(0.112, 0.118, cpG.x));
  cpAlb *= mix(0.8 + 0.35 * cpHash(vec3(floor(cpC), 2.0)), 0.55, cpLine);
  cpH += (1.0 - cpLine) * 0.6;
#endif
// fade fine relief once a pattern cell is only a few pixels: no glitter in the distance
float cpPix = length(fwidth(cpP));
cpH *= 1.0 - smoothstep(0.004, 0.025, cpPix);
// grime: long vertical streaks, heavier low down and under ledges
float cpStreak = cpFbm(vec3(cpF.x * 2.2, cpP.y * 0.22, 4.0 + cpF.x * 0.05));
float cpStreak2 = cpNoise(vec3(cpF.x * 9.0, cpP.y * 0.6, 1.3));
float cpG1 = smoothstep(0.42, 0.85, cpStreak) * (0.6 + 0.4 * cpStreak2);
float cpGround = 1.0 - smoothstep(0.0, 2.5, cpP.y);
float cpGrimeA = clamp((cpG1 * cpVert + cpGround * 0.5) * uGrime, 0.0, 0.85);
cpAlb *= 1.0 - cpGrimeA * 0.6;
cpR *= 1.0 + cpGrimeA * 0.2;
// rain wetness
float cpUp = clamp(cpN.y, 0.0, 1.0);
float cpWetM = uWet * clamp(mix(0.12 + 0.3 * cpStreak2 * cpG1, 1.0, cpUp), 0.0, 1.0);
`;

const PBR_COLOR = /* glsl */ `
#ifdef USE_TEX
  // Improved textures: project the PBR set along the wall (u along the facade, v up) or on the ground plane
  vec3 cpTN = vec3(0.0, 0.0, 1.0);
  float cpTR = 1.0;
  vec3 cpTT = vec3(1.0, 0.0, 0.0);
  vec3 cpTB = vec3(0.0, 1.0, 0.0);
  bool cpPbrOn = uPBR > 0.5;
  if (cpPbrOn) {
    vec2 cpUV;
    if (cpVert > 0.5) { cpTT = normalize(cross(vec3(0.0, 1.0, 0.0), cpN)); cpTB = vec3(0.0, 1.0, 0.0); cpUV = cpF; }
    else { float sy = cpN.y >= 0.0 ? 1.0 : -1.0; cpTT = vec3(1.0, 0.0, 0.0); cpTB = vec3(0.0, 0.0, -sy); cpUV = vec2(cpP.x, -cpP.z * sy); }
    if (uTexRot > 0.5) { cpUV = vec2(cpUV.y, -cpUV.x); vec3 t0 = cpTT; cpTT = cpTB; cpTB = -t0; }
    cpUV /= uTexScale;
    vec3 cpTC = texture2D(tTexC, cpUV).rgb;
    // rain-streak grime, scattered down the walls
    float cpLeak = 0.0;
    if (cpVert > 0.5) {
      vec2 lu = cpF / vec2(1.4, 4.5);
      vec2 lc = floor(lu);
      float lh = cpHash(vec3(lc, 9.0));
      cpLeak = step(0.5, lh) * texture2D(tLeak, vec2(fract(lu.x + lh * 0.3), fract(lu.y))).r;
    }
    diffuseColor.rgb = cpTC * uTexTint * (1.0 - cpGrimeA * 0.45) * (1.0 - cpLeak * 0.6 * min(uGrime, 1.0)) * mix(1.0, 0.5, cpWetM * 0.8);
    cpTR = texture2D(tTexR, cpUV).r;
    cpTN = texture2D(tTexN, cpUV).xyz * 2.0 - 1.0;
  }
#endif
`;

function surface(o: SurfaceOpts): MeshStandardMaterial {
  const m = new MeshStandardMaterial({
    color: o.color,
    roughness: o.rough,
    metalness: o.metal ?? 0,
    side: o.side ? DoubleSide : FrontSide,
    envMapIntensity: o.envI ?? 1,
  });
  const pattern = o.pattern ?? PAT.plain;
  m.defines = o.tex ? { PATTERN: pattern, USE_TEX: 1 } : { PATTERN: pattern };
  // texture uniforms live outside the shader so the set can be swapped any time (texture variety)
  let texU: Record<string, { value: unknown }> | null = null;
  if (o.tex) {
    const v = variants(o.tex)[0];
    const set = texSet(v.id);
    texU = {
      tTexC: { value: set.c }, tTexN: { value: set.n }, tTexR: { value: set.r },
      uTexScale: { value: o.tScale ?? 2 }, uTexRough: { value: o.tRough ?? 1 }, uTexRot: { value: o.tRot ? 1 : 0 },
      // tint = the material's own colour / the set's average, so textured walls keep the palette
      uTexTint: { value: tintFor(new Color(o.color), v) },
    };
    m.userData.tex = { family: o.tex, base: new Color(o.color), u: texU };
  }
  m.onBeforeCompile = (s: WebGLProgramParametersWithUniforms) => {
    s.uniforms.uWet = shared.uWet;
    s.uniforms.uGrime = { value: o.grime ?? 0.6 };
    s.uniforms.uBumpS = { value: o.bump ?? 0.012 };
    s.uniforms.uCell = { value: o.scale ?? 1 };
    s.uniforms.uVary = { value: o.vary ?? 0.18 };
    if (texU) Object.assign(s.uniforms, texU, { tLeak: pbr.tLeak, uPBR: pbr.uPBR });
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\n" + VERT_PARS)
      .replace("#include <project_vertex>", "#include <project_vertex>\n" + VERT_MAIN);
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\n" + SURF_FRAG_PARS)
      .replace("#include <color_fragment>", "#include <color_fragment>\n" + SURF_FRAG_EVAL +
        "diffuseColor.rgb *= cpAlb;\n diffuseColor.rgb *= mix(1.0, 0.5, cpWetM * 0.8);" + PBR_COLOR)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n" +
        "roughnessFactor = clamp(roughnessFactor * cpR, 0.04, 1.0);\n roughnessFactor = mix(roughnessFactor, 0.1, cpWetM * 0.85);" +
        "\n#ifdef USE_TEX\n if (cpPbrOn) roughnessFactor = mix(clamp(cpTR * uTexRough, 0.04, 1.0), 0.1, cpWetM * 0.85);\n#endif\n")
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n" +
        "normal = cpPerturb(-vViewPosition, normal, vec2(dFdx(cpH), dFdy(cpH)) * uBumpS * 60.0, faceDirection);" +
        "\n#ifdef USE_TEX\n if (cpPbrOn) { vec3 cpWN = normalize(cpTT * cpTN.x + cpTB * cpTN.y + cpN * max(cpTN.z, 0.05)); normal = normalize((viewMatrix * vec4(cpWN, 0.0)).xyz) * faceDirection; }\n#endif\n");
  };
  m.customProgramCacheKey = () => `surf-${pattern}-${o.grime}-${o.bump}-${o.scale}-${o.vary}-${o.tex ?? ""}`;
  return m;
}

// ---------------------------------------------------------------- windows

export const GLSL_INTERIOR = /* glsl */ `
uniform float uTime;
uniform float uLit;
uniform float uRoomBright;
vec3 cpH3(float n) { return fract(sin(vec3(n, n + 1.7, n + 3.1)) * vec3(43758.5453, 22578.1459, 19642.3490)); }

// style: 0 home, 1 shop, 2 office, 3 stairwell/dim, 4 pod (round)
vec3 cpRoomLight(float seed, float style) {
  vec3 h = cpH3(seed * 7.13 + 1.0);
  vec3 c;
  if (style > 1.5 && style < 2.5) {
    c = mix(vec3(0.75, 0.88, 1.0), vec3(1.0, 0.92, 0.8), step(0.7, h.x));
    if (h.y > 0.88) c = vec3(0.3, 0.8, 1.0);
  } else if (style > 0.5 && style < 1.5) {
    c = h.x < 0.5 ? vec3(1.0, 0.95, 0.85) : (h.x < 0.75 ? vec3(0.85, 0.95, 1.0) : vec3(1.0, 0.75, 0.5));
  } else {
    if (h.x < 0.38) c = vec3(1.0, 0.6, 0.3);          // tungsten
    else if (h.x < 0.6) c = vec3(0.78, 0.92, 1.0);    // fluorescent
    else if (h.x < 0.72) c = vec3(1.0, 0.25, 0.75);   // magenta LED
    else if (h.x < 0.84) c = vec3(0.2, 0.85, 1.0);    // cyan LED
    else if (h.x < 0.92) c = vec3(0.55, 0.35, 1.0);   // violet
    else c = vec3(1.0, 0.82, 0.55);
  }
  return c;
}

vec3 cpInterior(vec2 uv, vec4 win, vec3 Vw, vec3 Nw) {
  float seed = win.x; float W = win.y; float H = win.z; float style = win.w;
  vec3 h = cpH3(seed * 91.7);
  vec3 h2 = cpH3(seed * 13.3 + 7.0);
  vec3 h3 = cpH3(seed * 3.71 + 2.0);
  float litP = style > 1.5 && style < 2.5 ? uLit * 1.15 : (style > 0.5 && style < 1.5 ? 0.92 : uLit);
  float lit = step(h.x, litP);
  vec3 T = normalize(cross(vec3(0.0, 1.0, 0.0), Nw));
  vec3 B = vec3(0.0, 1.0, 0.0);
  vec3 d = vec3(dot(Vw, T), dot(Vw, B), dot(Vw, Nw));
  d.z = min(d.z, -0.02);
  d = normalize(d);
  vec3 p = vec3(uv.x * W, uv.y * H, 0.0);
  float depth = style > 1.5 && style < 2.5 ? 7.0 + h.y * 6.0 : 2.6 + h.y * 2.8;
  vec3 bmin, bmax;
  if (style > 1.5 && style < 2.5) { bmin = vec3(-9.0, -0.02, -depth); bmax = vec3(W + 9.0, H + 0.02, 0.0); }
  else if (style > 3.5) { bmin = vec3(-0.35, -0.6, -3.4); bmax = vec3(W + 0.35, H + 0.25, 0.0); }
  else if (style > 0.5 && style < 1.5) { bmin = vec3(-1.0 - h2.x, -0.05, -depth); bmax = vec3(W + 1.0 + h2.y, H + 0.3, 0.0); }
  else { bmin = vec3(-0.5 - h2.x * 1.6, -0.95, -depth); bmax = vec3(W + 0.5 + h2.y * 1.6, H + 0.35, 0.0); }
  vec3 dd = d + vec3(1e-5);
  vec3 t1 = (bmin - p) / dd; vec3 t2 = (bmax - p) / dd;
  vec3 tf = max(t1, t2);
  float t = min(min(tf.x, tf.y), tf.z);
  vec3 hit = p + d * t;

  vec3 L = cpRoomLight(seed, style);
  vec3 wallC = mix(vec3(0.55, 0.52, 0.48), vec3(0.35, 0.4, 0.45), h3.x);
  if (h3.y > 0.8) wallC = mix(wallC, vec3(0.5, 0.2, 0.3), 0.6);
  vec3 col;
  float roomH = bmax.y - bmin.y;
  vec2 lampP = vec2(mix(bmin.x, bmax.x, 0.3 + 0.4 * h3.z), mix(bmin.z, 0.0, 0.45));
  if (t == tf.z) {
    // back wall: poster / shelf / screen
    col = wallC * 0.75;
    vec2 q = hit.xy;
    float poster = step(abs(q.x - (bmin.x + (bmax.x - bmin.x) * h2.z)), 0.35) * step(abs(q.y - (bmin.y + roomH * 0.62)), 0.45);
    col = mix(col, cpH3(seed * 2.0) * 0.9, poster * step(0.4, h3.x));
    if (style > 1.5 && style < 2.5) col = mix(vec3(0.25, 0.27, 0.3), vec3(0.6, 0.65, 0.7), step(0.5, fract(q.x * 0.35)) * 0.3);
  } else if (t == tf.y) {
    if (d.y > 0.0) {
      // ceiling + lamp
      col = wallC * 0.9;
      float lamp = 1.0 - smoothstep(0.1, 0.22, length(hit.xz - lampP));
      if (style > 1.5 && style < 2.5) {
        vec2 g = abs(fract(hit.xz * vec2(0.42, 0.55)) - 0.5);
        lamp = step(g.x, 0.12) * step(g.y, 0.3) * 0.45;
      }
      col += lamp * 6.0;
    } else {
      // floor
      col = mix(vec3(0.25, 0.2, 0.17), vec3(0.18, 0.2, 0.22), h3.z) * 0.6;
      col *= 0.8 + 0.2 * step(0.5, fract(hit.x * 1.5));
    }
  } else {
    col = wallC * 0.55;
  }
  // light falloff from the lamp
  float dist = length(vec2(hit.x, hit.z) - lampP);
  col *= 0.35 + 0.9 / (1.0 + dist * dist * 0.25);
  col *= mix(1.0, 0.65, smoothstep(0.0, depth, -hit.z));

  // silhouettes: furniture / people on a mid plane
  float zs = 0.9 + h2.x * 1.6;
  float ts = zs / -d.z;
  if (ts < t) {
    vec3 q = p + d * ts;
    float floorY = bmin.y;
    float sil = 0.0;
    float cx = mix(bmin.x + 0.4, bmax.x - 0.4, h3.x);
    // sofa / desk / counter
    sil = max(sil, step(abs(q.x - cx), 0.5 + h.z * 0.6) * step(q.y, floorY + 0.75 + h2.y * 0.25));
    // a person
    if (h3.y < 0.45) {
      float px = mix(bmin.x + 0.6, bmax.x - 0.6, h.z);
      float head = 1.0 - step(0.12, length(q.xy - vec2(px, floorY + 1.62)));
      float body = step(abs(q.x - px), 0.22 - max(0.0, q.y - floorY - 1.25) * 0.4) * step(q.y, floorY + 1.45);
      sil = max(sil, max(head, body));
    }
    // plant / shelf
    if (h.y > 0.6) {
      float sx = mix(bmin.x + 0.3, bmax.x - 0.3, fract(h.y * 7.0));
      sil = max(sil, step(abs(q.x - sx), 0.25) * step(q.y, floorY + 1.9) * step(0.5, fract(q.y * 2.5) + 0.35));
    }
    col = mix(col, col * 0.06, sil);
  }

  // TV flicker
  float tv = step(0.75, h2.z) * step(style, 0.5);
  float fl = 0.75 + 0.25 * sin(uTime * 11.0 + seed) * sin(uTime * 3.7 + seed * 2.0);
  vec3 lightC = mix(L, vec3(0.45, 0.6, 1.0) * fl, tv);

  vec3 room = col * lightC * lit;

  // blinds / curtains on the glass
  float cover = h3.x < 0.35 ? 0.0 : (h3.x < 0.7 ? h2.y : 1.0);
  if (style > 0.5 && style < 1.5) cover *= 0.2;
  if (style > 3.5) cover = 0.0;
  float blindsOn = step(1.0 - cover, uv.y) * step(0.55, h.y + 0.2);
  if (style > 1.5 && style < 2.5) blindsOn *= step(0.75, h3.z);
  float slat = 0.55 + 0.45 * smoothstep(0.2, 0.5, abs(fract(uv.y * H * 14.0) - 0.5));
  float curtain = 0.6 + 0.4 * sin(uv.x * W * 18.0 + sin(uv.x * 7.0) * 2.0);
  float isCurtain = step(0.5, h2.x);
  vec3 blinds = lightC * (lit * 0.55 + 0.03) * mix(slat, curtain, isCurtain) * mix(vec3(1.0), vec3(1.0, 0.75, 0.6), isCurtain);
  room = mix(room, blinds, blindsOn);

  // unlit rooms still catch a little city glow
  room += (1.0 - lit) * col * vec3(0.05, 0.04, 0.08);
  return room * uRoomBright * (style > 0.5 && style < 1.5 ? 1.15 : 1.0) * (style > 2.5 && style < 3.5 ? 0.35 : 1.0);
}
`;

function windowMat(): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color: 0x050608, roughness: 0.06, metalness: 0.1, envMapIntensity: 1.2 });
  m.onBeforeCompile = (s: WebGLProgramParametersWithUniforms) => {
    s.uniforms.uTime = shared.uTime;
    s.uniforms.uLit = shared.uLit;
    s.uniforms.uRoomBright = shared.uRoomBright;
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\n attribute vec4 aWin;\n varying vec4 vWin;\n varying vec2 vWinUv;\n" + VERT_PARS)
      .replace("#include <project_vertex>", "#include <project_vertex>\n vWin = aWin; vWinUv = uv;\n" + VERT_MAIN);
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\n varying vec4 vWin;\n varying vec2 vWinUv;\n varying vec3 vCpWPos;\n varying vec3 vCpWNrm;\n" + GLSL_INTERIOR)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        vec3 cpV = normalize(vCpWPos - cameraPosition);
        vec3 cpNw = normalize(vCpWNrm);
        vec2 cpUv = vWinUv;
        if (vWin.w > 3.5) { float r = length(cpUv - 0.5); if (r > 0.5) discard; }
        totalEmissiveRadiance += cpInterior(cpUv, vWin, cpV, cpNw);`);
  };
  m.customProgramCacheKey = () => "win";
  return m;
}

// ---------------------------------------------------------------- neon

const NEON_VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
varying vec3 vN;
varying vec3 vV;
varying vec3 vW;
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mvPosition.xyz);
  vW = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

export const GLSL_FLICKER = /* glsl */ `
float cpFlicker(float ch, float t) {
  if (ch < 0.5) return 1.0;
  float s = ch * 17.31;
  float n = fract(sin(floor(t * 22.0 + s) * 12.9898 + s) * 43758.5453);
  if (ch > 4.5) {
    // broken tube: mostly dim, sputters
    float b = step(0.55, fract(sin(floor(t * 3.0 + s) * 78.233) * 43758.5453));
    return mix(0.08, step(0.3, n), b);
  }
  float burst = step(0.86, fract(sin(floor(t * 0.9 + s) * 78.233 + s) * 43758.5453));
  return mix(1.0, step(0.4, n) * 0.9 + 0.1, burst);
}
`;

const NEON_FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform vec3 uColor;
uniform float uIntensity;
uniform float uCh;
uniform float uTime;
uniform float uNeon;
uniform float uChase;
varying vec3 vN;
varying vec3 vV;
varying vec3 vW;
${GLSL_FLICKER}
void main() {
  float facing = abs(dot(normalize(vN), normalize(vV)));
  float core = pow(facing, 3.0);
  vec3 c = uColor * (0.55 + 0.6 * facing) + vec3(1.0) * core * 0.35 * length(uColor);
  float f = cpFlicker(uCh, uTime);
  if (uChase > 0.0) {
    float ph = fract(vW.y * 0.045 - uTime * 0.35 + uCh * 0.13);
    f *= 0.25 + 0.75 * smoothstep(0.0, 0.08, ph) * (1.0 - smoothstep(0.08, 0.5, ph)) + 0.25 * step(0.97, ph);
  }
  gl_FragColor = vec4(c * uIntensity * uNeon * f, 1.0);
  #include <fog_fragment>
}`;

function neonMat(hex: string, ch: number, intensity = 5, chase = false): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      { uColor: { value: new Color("#" + hex) }, uIntensity: { value: intensity }, uCh: { value: ch }, uChase: { value: chase ? 1 : 0 } },
    ]) as Record<string, { value: unknown }>,
    vertexShader: NEON_VERT,
    fragmentShader: NEON_FRAG,
    fog: true,
  });
}

function bindShared(m: ShaderMaterial): ShaderMaterial {
  m.uniforms.uTime = shared.uTime;
  m.uniforms.uNeon = shared.uNeon;
  return m;
}

// ---------------------------------------------------------------- library

const SURFACES: Record<string, SurfaceOpts> = {
  concrete: { color: 0x55534f, rough: 0.9, pattern: PAT.concrete, grime: 0.9, vary: 0.22, tex: "concrete", tScale: 2.4 },
  concreteDark: { color: 0x34343a, rough: 0.9, pattern: PAT.concrete, grime: 0.8, tex: "concrete", tScale: 2.4 },
  concreteLight: { color: 0x8a857c, rough: 0.85, pattern: PAT.concrete, grime: 1.0, vary: 0.2, tex: "concrete", tScale: 2.4 },
  slab: { color: 0x4a4844, rough: 0.9, pattern: PAT.concrete, grime: 1.2, tex: "concrete", tScale: 2.0 },
  tileA: { color: 0x6f8784, rough: 0.55, pattern: PAT.tile, scale: 0.11, grime: 0.9, tex: "tiles", tScale: 0.9 },
  tileB: { color: 0x9a8f7a, rough: 0.55, pattern: PAT.tile, scale: 0.11, grime: 1.0, tex: "tiles", tScale: 0.9 },
  tileC: { color: 0x8a6e72, rough: 0.55, pattern: PAT.tile, scale: 0.11, grime: 0.9, tex: "tiles", tScale: 0.9 },
  tileD: { color: 0x5d6a80, rough: 0.5, pattern: PAT.tile, scale: 0.15, grime: 0.8, tex: "tiles", tScale: 1.2 },
  tileE: { color: 0xb0aca2, rough: 0.5, pattern: PAT.tile, scale: 0.09, grime: 1.1, tex: "tiles", tScale: 0.7 },
  brick: { color: 0x6a4038, rough: 0.85, pattern: PAT.brick, grime: 0.9, tex: "bricks", tScale: 1.6 },
  plaster: { color: 0x7d786d, rough: 0.9, pattern: PAT.plain, grime: 1.1, vary: 0.3, tex: "plaster", tScale: 2.0 },
  plasterBlue: { color: 0x4a6070, rough: 0.9, pattern: PAT.plain, grime: 1.1, vary: 0.3, tex: "plaster", tScale: 2.0 },
  metal: { color: 0x2b2e33, rough: 0.5, metal: 0.65, pattern: PAT.panel, scale: 1.6, grime: 0.5, tex: "metalDark", tScale: 1.6 },
  metalPanel: { color: 0x3a3e45, rough: 0.42, metal: 0.7, pattern: PAT.panel, scale: 1.2, grime: 0.35, tex: "metalDark", tScale: 1.4 },
  metalBare: { color: 0x8c9096, rough: 0.38, metal: 0.9, pattern: PAT.brushed, grime: 0.4, tex: "brushed", tScale: 1.0 },
  metalDark: { color: 0x141518, rough: 0.45, metal: 0.7, pattern: PAT.plain, grime: 0.2, tex: "metalDark", tScale: 1.6 },
  frame: { color: 0x1c1d20, rough: 0.4, metal: 0.8, pattern: PAT.plain, grime: 0.2, vary: 0.05, tex: "metalDark", tScale: 1.0 },
  frameLight: { color: 0x9a9da2, rough: 0.35, metal: 0.85, pattern: PAT.plain, grime: 0.3, vary: 0.05, tex: "brushed", tScale: 1.0 },
  rust: { color: 0x5c3a26, rough: 0.85, metal: 0.3, pattern: PAT.plain, grime: 0.8, vary: 0.4, tex: "rusty", tScale: 1.4 },
  corrugated: { color: 0x6b6e70, rough: 0.5, metal: 0.75, pattern: PAT.corrugated, scale: 0.09, grime: 0.8, tex: "corrugated", tScale: 1.4 },
  corrugatedRust: { color: 0x6a4a36, rough: 0.7, metal: 0.5, pattern: PAT.corrugated, scale: 0.09, grime: 0.9, vary: 0.35, tex: "rusty", tScale: 1.6 },
  shutter: { color: 0x7a7c80, rough: 0.5, metal: 0.7, pattern: PAT.ribbed, scale: 0.075, grime: 0.9, tex: "corrugated", tScale: 1.2, tRot: true },
  acUnit: { color: 0xb7b3a8, rough: 0.55, metal: 0.2, pattern: PAT.panel, scale: 0.5, grime: 1.1, vary: 0.12, tex: "painted", tScale: 1.0 },
  grille: { color: 0x0e0f11, rough: 0.6, metal: 0.4, pattern: PAT.plain, grime: 0.1 },
  rubber: { color: 0x09090a, rough: 0.75, pattern: PAT.plain, grime: 0 },
  pipe: { color: 0x7d8086, rough: 0.45, metal: 0.8, pattern: PAT.plain, grime: 0.9, vary: 0.3, tex: "brushed", tScale: 1.0 },
  pipePVC: { color: 0x9c9a90, rough: 0.6, metal: 0.0, pattern: PAT.plain, grime: 1.0, vary: 0.2 },
  pod: { color: 0xbab6aa, rough: 0.45, metal: 0.35, pattern: PAT.pod, scale: 1.2, grime: 0.9, vary: 0.12, tex: "painted", tScale: 1.8 },
  podDark: { color: 0x3c4046, rough: 0.4, metal: 0.6, pattern: PAT.pod, scale: 1.2, grime: 0.6, tex: "painted", tScale: 1.8 },
  glassSpandrel: { color: 0x07090c, rough: 0.07, metal: 0.9, pattern: PAT.plain, grime: 0.15, vary: 0.05, envI: 1.4 },
  roof: { color: 0x2c2b2a, rough: 0.95, pattern: PAT.concrete, grime: 0.6, tex: "concrete", tScale: 3.0 },
  roofTile: { color: 0x3a3836, rough: 0.8, pattern: PAT.tile, scale: 0.5, grime: 0.6 },
  wood: { color: 0x4a3426, rough: 0.8, pattern: PAT.plain, grime: 0.6, vary: 0.35 },
  plant: { color: 0x1f3a1c, rough: 0.8, pattern: PAT.plain, grime: 0, vary: 0.4 },
  pot: { color: 0x7a4a32, rough: 0.8, pattern: PAT.plain, grime: 0.5 },
  awningRed: { color: 0x7a1418, rough: 0.8, pattern: PAT.plain, grime: 0.8, side: true },
  awningTeal: { color: 0x0f4a4c, rough: 0.8, pattern: PAT.plain, grime: 0.8, side: true },
  awningYellow: { color: 0x8a6a10, rough: 0.8, pattern: PAT.plain, grime: 0.8, side: true },
  awningBlue: { color: 0x1a2a6a, rough: 0.8, pattern: PAT.plain, grime: 0.8, side: true },
  cloth0: { color: 0xc23a3a, rough: 0.9, side: true, grime: 0 },
  cloth1: { color: 0x2a5ab0, rough: 0.9, side: true, grime: 0 },
  cloth2: { color: 0xd8d4c8, rough: 0.9, side: true, grime: 0 },
  cloth3: { color: 0x3a8a4a, rough: 0.9, side: true, grime: 0 },
  cloth4: { color: 0xd0a030, rough: 0.9, side: true, grime: 0 },
  cloth5: { color: 0x7a3aa0, rough: 0.9, side: true, grime: 0 },
  paintRed: { color: 0x8a1a1a, rough: 0.5, metal: 0.3, grime: 0.5, tex: "painted", tScale: 1.2 },
  paintYellow: { color: 0xb08a10, rough: 0.5, metal: 0.3, grime: 0.6, tex: "painted", tScale: 1.2 },
  paintWhite: { color: 0xd0cec8, rough: 0.5, metal: 0.2, grime: 0.6, tex: "painted", tScale: 1.2 },
  vending: { color: 0xb8bcc2, rough: 0.35, metal: 0.4, grime: 0.4, tex: "painted", tScale: 1.2 },
  trash: { color: 0x101012, rough: 0.35, metal: 0.0, grime: 0 },
  sidewalkCurb: { color: 0x6a6864, rough: 0.8, pattern: PAT.concrete, grime: 0.8, tex: "concrete", tScale: 1.5 },
};

export class MaterialLib {
  private cache = new Map<string, Material>();

  /**
   * Texture variety: point every textured material at a set of its family
   * chosen from (seed, shuffle). Only uniform values change: instant.
   */
  applyTextureVariety(seed: number, shuffle: number): void {
    for (const [key, m] of this.cache) {
      const t = m.userData.tex as { family: TexFamily; base: Color; u: Record<string, { value: unknown }> } | undefined;
      if (!t) continue;
      const v = pickVariant(t.family, key, seed, shuffle);
      const set = texSet(v.id);
      t.u.tTexC.value = set.c;
      t.u.tTexN.value = set.n;
      t.u.tTexR.value = set.r;
      tintFor(t.base, v, t.u.uTexTint.value as Color);
    }
  }

  get(key: string): Material {
    let m = this.cache.get(key);
    if (m) return m;
    m = this.create(key);
    this.cache.set(key, m);
    return m;
  }

  private create(key: string): Material {
    if (key.startsWith("win")) return windowMat();
    const parts = key.split(":");
    if (parts[0] === "neon" || parts[0] === "chase") {
      return bindShared(neonMat(parts[1], Number(parts[2] ?? 0), Number(parts[3] ?? 5), parts[0] === "chase"));
    }
    if (parts[0] === "emit") {
      const c = new Color("#" + parts[1]).multiplyScalar(Number(parts[2] ?? 2));
      return new MeshBasicMaterial({ color: c });
    }
    if (parts[0] === "glass") {
      // clear glass for shafts / canopies
      return new MeshPhysicalMaterial({
        color: 0x9ab0c0, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.18, depthWrite: false,
        envMapIntensity: 1.5, side: DoubleSide,
      });
    }
    const name = parts[0] === "uv" ? parts[1] : key;
    const o = SURFACES[name];
    if (!o) {
      console.warn("unknown material", key);
      return surface({ color: 0xff00ff, rough: 0.5 });
    }
    return surface(o);
  }

  dispose(): void {
    for (const m of this.cache.values()) m.dispose();
    this.cache.clear();
  }
}

export const PALETTES = {
  Kabukicho: ["ff2a6d", "05d9e8", "ff6ec7", "ffd23f", "7b61ff", "ff9e3d"],
  Toxic: ["39ff14", "ff00a0", "00ffd5", "d4ff00", "b026ff", "ff3864"],
  Amber: ["ff8c1a", "00e5ff", "ffb000", "ff3b3b", "1de9b6", "ffd166"],
  Vapor: ["b967ff", "01cdfe", "ff71ce", "05ffa1", "fffb96", "6a5cff"],
} as const;
export type PaletteName = keyof typeof PALETTES;
