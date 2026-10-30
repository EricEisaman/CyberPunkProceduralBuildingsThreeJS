/**
 * Signs: canvas-drawn faces (kanji blade signs, lightboxes, neon-on-dark
 * boards), LED tickers, animated ad screens, holograms, and the soft light
 * spill each big sign throws on the wall behind it.
 */
import {
  AdditiveBlending, CanvasTexture, Color, DoubleSide, LinearMipmapLinearFilter, Mesh, MeshBasicMaterial,
  PlaneGeometry, SRGBColorSpace, ShaderMaterial, Texture, UniformsLib, UniformsUtils, Vector2,
} from "three";
import type { Builder } from "./builder";
import { GLSL_FLICKER, shared } from "./materials";
import type { Rng } from "./rng";

export const CJK_WORDS = [
  "ラーメン", "居酒屋", "カラオケ", "薬局", "ホテル", "電脳", "義体", "未来", "夜市", "酒場", "寿司", "焼鳥",
  "質屋", "修理", "電気", "整体", "占い", "雀荘", "喫茶", "漢方", "金融", "按摩", "眼鏡", "龍門", "夢幻", "極楽",
  "天国", "九龍", "大飯店", "酒家", "海鮮", "牙科", "麻雀", "電腦", "旅館", "牛丼", "餃子", "うどん", "ゲーム",
  "マッサージ", "ネオン", "サイバー", "中華", "焼肉", "スナック", "クラブ", "診療所", "両替", "質店", "理髪",
  "回転", "カプセル", "神経", "夜光", "金龍", "鳳凰", "幸運", "満月", "東京", "新世界", "人工", "記憶", "電子", "義眼",
];
export const EN_WORDS = [
  "HOTEL", "BAR", "OPEN", "24H", "RAMEN", "KARAOKE", "CLINIC", "NOODLE", "SUSHI", "CYBER", "SYNTH", "LOVE",
  "MOTEL", "ARCADE", "DRINKS", "NEON", "LIQUOR", "PAWN", "REPAIR", "CAFE", "DREAM", "IMPLANTS", "CHROME",
  "DATA", "GAMES", "TATTOO", "DINER", "VIDEO", "LUCKY", "NIGHT",
];
export const CORP_NAMES = ["KAIROS", "HELIX", "MIRAI", "SEIREN", "OBSIDIAN", "TAKAMINE", "AURORA", "VANTA"];
export const SLOGANS = [
  "BUY MORE  LIVE MORE", "UPGRADE YOUR BODY", "MEMORY IS A LUXURY", "SLEEP IS OPTIONAL",
  "THE FUTURE IS OWNED", "NEW EYES  NEW YOU", "FEEL NOTHING  FEEL GREAT", "CONNECT  CONSUME  REPEAT",
];

const CJK_FONT = '"Noto Sans JP", "Yu Gothic", "Microsoft YaHei", sans-serif';
const LAT_FONT = 'Orbitron, "Rajdhani", sans-serif';

export const ALL_GLYPHS = CJK_WORDS.join("") + EN_WORDS.join("") + CORP_NAMES.join("") + SLOGANS.join("") + "0123456789株式会社営業中";

/** load every font the signs use; onProgress(done, total) after each one */
export async function loadFonts(onProgress?: (done: number, total: number) => void): Promise<void> {
  const jobs: [string, string][] = [
    [`900 64px "Noto Sans JP"`, ALL_GLYPHS],
    [`700 64px "Noto Sans JP"`, ALL_GLYPHS],
    [`900 64px Orbitron`, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"],
    [`700 64px Orbitron`, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"],
    [`700 64px Rajdhani`, "ABCDEFGHIJKLMNOPQRSTUVWXYZ"],
  ];
  let done = 0;
  await Promise.all(jobs.map(([font, text]) =>
    document.fonts.load(font, text)
      .catch(e => console.warn("font load failed", font, e))
      .then(() => onProgress?.(++done, jobs.length)),
  ));
}

const isCJK = (s: string) => /[　-鿿＀-￯]/.test(s);

function makeTex(c: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  return t;
}

const texCache = new Map<string, { tex: Texture; aspect: number }>();

export type SignStyle = "neon" | "lightbox" | "lightboxDark" | "outline";

/**
 * Draw a sign face. vertical = characters stacked top to bottom.
 * Returns the texture and its aspect (w / h).
 */
export function signTexture(text: string, style: SignStyle, color: string, vertical: boolean, accent = "ffffff"): { tex: Texture; aspect: number } {
  const key = `${text}|${style}|${color}|${vertical}|${accent}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const chars = [...text];
  const cjk = isCJK(text);
  const cell = 160;
  const pad = 26;
  let W: number, H: number;
  if (vertical) {
    W = cell + pad * 2;
    H = chars.length * cell * (cjk ? 1.0 : 0.92) + pad * 2;
  } else {
    const ctx0 = document.createElement("canvas").getContext("2d")!;
    ctx0.font = cjk ? `900 ${cell * 0.8}px ${CJK_FONT}` : `900 ${cell * 0.7}px ${LAT_FONT}`;
    W = Math.ceil(ctx0.measureText(text).width + pad * 4);
    H = cell + pad * 2;
  }
  const c = document.createElement("canvas");
  c.width = Math.min(2048, Math.ceil(W));
  c.height = Math.min(2048, Math.ceil(H));
  const sx = c.width / W, sy = c.height / H;
  const g = c.getContext("2d")!;
  g.scale(sx, sy);
  const col = "#" + color;
  const acc = "#" + accent;

  // background
  if (style === "lightbox" || style === "lightboxDark") {
    const grad = g.createLinearGradient(0, 0, W, 0);
    const base = new Color(col);
    const light = style === "lightbox";
    const bg = light ? base.clone().lerp(new Color(1, 1, 1), 0.15) : new Color(0.03, 0.03, 0.04);
    grad.addColorStop(0, "#" + bg.clone().multiplyScalar(0.7).getHexString());
    grad.addColorStop(0.5, "#" + bg.getHexString());
    grad.addColorStop(1, "#" + bg.clone().multiplyScalar(0.7).getHexString());
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    // fluorescent tubes behind the acrylic
    if (light) {
      for (let i = 0; i < 3; i++) {
        const tg = vertical ? g.createLinearGradient(0, 0, W, 0) : g.createLinearGradient(0, 0, 0, H);
        tg.addColorStop(0, "rgba(255,255,255,0)");
        tg.addColorStop(0.5, "rgba(255,255,255,0.12)");
        tg.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = tg;
        if (vertical) g.fillRect(0, 0, W, H);
        else g.fillRect(0, 0, W, H);
      }
    }
    g.strokeStyle = light ? "rgba(255,255,255,0.85)" : col;
    g.lineWidth = 8;
    g.strokeRect(12, 12, W - 24, H - 24);
  } else {
    g.fillStyle = "#07070a";
    g.fillRect(0, 0, W, H);
    g.strokeStyle = "rgba(255,255,255,0.05)";
    g.lineWidth = 3;
    for (let y = 0; y < H; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    if (style === "outline") {
      g.shadowColor = acc;
      g.shadowBlur = 18;
      g.strokeStyle = acc;
      g.lineWidth = 7;
      g.strokeRect(16, 16, W - 32, H - 32);
      g.shadowBlur = 0;
    }
  }

  // text
  g.textAlign = "center";
  g.textBaseline = "middle";
  const fontPx = cjk ? cell * 0.8 : cell * 0.68;
  g.font = cjk ? `900 ${fontPx}px ${CJK_FONT}` : `900 ${fontPx}px ${LAT_FONT}`;
  const draw = (fn: (t: string, x: number, y: number) => void) => {
    if (vertical) {
      const step = cell * (cjk ? 1.0 : 0.92);
      chars.forEach((ch, i) => fn(ch, W / 2, pad + step * (i + 0.5) + 4));
    } else fn(text, W / 2, H / 2 + 6);
  };
  if (style === "lightbox") {
    g.fillStyle = "#" + accent;
    g.strokeStyle = "rgba(0,0,0,0.5)";
    g.lineWidth = 6;
    draw((t, x, y) => { g.strokeText(t, x, y); g.fillText(t, x, y); });
  } else {
    // neon glow: wide soft pass, colored tube, hot core
    g.shadowColor = col;
    g.shadowBlur = 30;
    g.strokeStyle = col;
    g.lineWidth = 12;
    draw((t, x, y) => g.strokeText(t, x, y));
    g.shadowBlur = 10;
    g.lineWidth = 6;
    draw((t, x, y) => g.strokeText(t, x, y));
    g.shadowBlur = 0;
    g.strokeStyle = "#" + new Color(col).lerp(new Color(1, 1, 1), 0.65).getHexString();
    g.lineWidth = 2.5;
    draw((t, x, y) => g.strokeText(t, x, y));
  }
  const out = { tex: makeTex(c), aspect: W / H };
  texCache.set(key, out);
  return out;
}

// ---------------------------------------------------------------- sign material

const SIGN_VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const SIGN_FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform sampler2D map;
uniform float uIntensity;
uniform float uCh;
uniform float uTime;
uniform float uNeon;
varying vec2 vUv;
${GLSL_FLICKER}
void main() {
  vec3 c = texture2D(map, vUv).rgb;
  float f = cpFlicker(uCh, uTime);
  // keep the dark backboard dark, push the lit parts into HDR
  float l = max(c.r, max(c.g, c.b));
  vec3 col = c * mix(0.6, uIntensity, smoothstep(0.08, 0.6, l)) * mix(1.0, f, smoothstep(0.1, 0.4, l));
  gl_FragColor = vec4(col * uNeon, 1.0);
  #include <fog_fragment>
}`;

const signMatCache = new Map<string, ShaderMaterial>();

export function signMaterial(tex: Texture, intensity: number, ch: number): ShaderMaterial {
  const key = tex.uuid + "|" + intensity + "|" + ch;
  let m = signMatCache.get(key);
  if (m) return m;
  m = new ShaderMaterial({
    uniforms: UniformsUtils.merge([UniformsLib.fog, { map: { value: null }, uIntensity: { value: intensity }, uCh: { value: ch } }]),
    vertexShader: SIGN_VERT,
    fragmentShader: SIGN_FRAG,
    fog: true,
  });
  m.uniforms.map.value = tex;
  m.uniforms.uTime = shared.uTime;
  m.uniforms.uNeon = shared.uNeon;
  signMatCache.set(key, m);
  return m;
}

// ---------------------------------------------------------------- LED ticker

const tickerTexCache = new Map<string, CanvasTexture>();
function tickerTexture(text: string): CanvasTexture {
  let t = tickerTexCache.get(text);
  if (t) return t;
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 32;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#fff";
  g.font = `700 26px ${isCJK(text) ? CJK_FONT : '"Rajdhani", sans-serif'}`;
  g.textBaseline = "middle";
  g.fillText(text, 8, 17);
  t = new CanvasTexture(c);
  t.wrapS = 1000; // RepeatWrapping
  tickerTexCache.set(text, t);
  return t;
}

const TICKER_FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform sampler2D map;
uniform vec3 uColor;
uniform vec2 uCells;
uniform float uSpeed;
uniform float uTime;
uniform float uNeon;
uniform float uSpan;
varying vec2 vUv;
void main() {
  vec2 c = floor(vUv * uCells);
  vec2 f = fract(vUv * uCells);
  float u = fract((c.x + 0.5) / uCells.x * uSpan + uTime * uSpeed);
  float v = (c.y + 0.5) / uCells.y;
  float on = texture2D(map, vec2(u, v)).r;
  float d = 1.0 - smoothstep(0.28, 0.46, length(f - 0.5));
  vec3 col = uColor * (on * 4.0 + 0.05) * d;
  gl_FragColor = vec4(col * uNeon, 1.0);
  #include <fog_fragment>
}`;

export function tickerMaterial(text: string, color: string, w: number, h: number): ShaderMaterial {
  const rows = 16;
  const cols = Math.round((w / h) * rows);
  const m = new ShaderMaterial({
    uniforms: UniformsUtils.merge([UniformsLib.fog, {
      map: { value: null }, uColor: { value: new Color("#" + color) }, uCells: { value: new Vector2(cols, rows) },
      uSpeed: { value: 0.06 }, uSpan: { value: Math.min(1, cols / 512) },
    }]),
    vertexShader: SIGN_VERT,
    fragmentShader: TICKER_FRAG,
    fog: true,
  });
  m.uniforms.map.value = tickerTexture("   " + text + "   " + text + "   ");
  m.uniforms.uTime = shared.uTime;
  m.uniforms.uNeon = shared.uNeon;
  return m;
}

// ---------------------------------------------------------------- ad screens

/** four ad frames stacked vertically in one canvas */
export function adTexture(rng: Rng, palette: readonly string[], aspect: number, brand?: string): CanvasTexture {
  const fw = aspect >= 1 ? 1024 : Math.round(1024 * aspect);
  const fh = aspect >= 1 ? Math.round(1024 / aspect) : 1024;
  const c = document.createElement("canvas");
  c.width = fw;
  c.height = fh * 4;
  const g = c.getContext("2d")!;
  for (let f = 0; f < 4; f++) {
    g.save();
    g.translate(0, f * fh);
    const c1 = "#" + palette[(f * 2) % palette.length];
    const c2 = "#" + palette[(f * 2 + 1) % palette.length];
    const kind = f % 4;
    const bg = g.createLinearGradient(0, 0, fw, fh);
    bg.addColorStop(0, kind === 2 ? "#020208" : c1);
    bg.addColorStop(1, kind === 2 ? "#10061a" : c2);
    g.fillStyle = bg;
    g.fillRect(0, 0, fw, fh);
    // dark overlay for contrast
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.fillRect(0, 0, fw, fh);
    const minD = Math.min(fw, fh);
    if (kind === 0) {
      // big kanji + slogan
      const word = rng.pick(CJK_WORDS);
      g.fillStyle = "#fff";
      g.textAlign = "center";
      g.textBaseline = "middle";
      if (aspect < 1) {
        const chars = [...word];
        const sz = Math.min(fw * 0.8, (fh * 0.8) / chars.length);
        g.font = `900 ${sz}px ${CJK_FONT}`;
        chars.forEach((ch, i) => g.fillText(ch, fw / 2, fh * 0.1 + sz * (i + 0.5)));
      } else {
        g.font = `900 ${minD * 0.5}px ${CJK_FONT}`;
        g.fillText(word, fw / 2, fh * 0.42);
      }
      g.font = `700 ${minD * 0.09}px ${LAT_FONT}`;
      g.fillStyle = "#fff";
      g.fillText(rng.pick(SLOGANS), fw / 2, fh * 0.9, fw * 0.92);
    } else if (kind === 1) {
      // concentric rings product shot
      for (let i = 8; i > 0; i--) {
        g.beginPath();
        g.arc(fw / 2, fh * 0.45, (minD * 0.45 * i) / 8, 0, Math.PI * 2);
        g.fillStyle = i % 2 ? c2 : "#0a0610";
        g.fill();
      }
      g.beginPath();
      g.arc(fw / 2, fh * 0.45, minD * 0.1, 0, Math.PI * 2);
      g.fillStyle = "#fff";
      g.fill();
      g.font = `900 ${minD * 0.12}px ${LAT_FONT}`;
      g.fillStyle = "#fff";
      g.textAlign = "center";
      g.fillText(brand ?? rng.pick(CORP_NAMES), fw / 2, fh * 0.9, fw * 0.9);
    } else if (kind === 2) {
      // a face silhouette made of scan lines
      g.fillStyle = c1;
      for (let y = 0; y < fh; y += 6) {
        const t = y / fh;
        const w = Math.sin(Math.min(1, t * 1.4) * Math.PI) * fw * 0.32 * (t > 0.62 ? 0.75 : 1);
        g.fillRect(fw / 2 - w, y, w * 2, 3);
      }
      g.fillStyle = c2;
      g.fillRect(fw * 0.36, fh * 0.36, fw * 0.08, fh * 0.02);
      g.fillRect(fw * 0.56, fh * 0.36, fw * 0.08, fh * 0.02);
      g.font = `900 ${minD * 0.1}px ${LAT_FONT}`;
      g.fillStyle = "#fff";
      g.textAlign = "center";
      g.fillText("NEW EYES", fw / 2, fh * 0.94, fw * 0.9);
    } else {
      // bold stripes + corp name vertical
      for (let i = 0; i < 12; i++) {
        g.fillStyle = i % 2 ? c1 : c2;
        g.globalAlpha = 0.5;
        g.fillRect(0, (i * fh) / 12, fw, fh / 24);
      }
      g.globalAlpha = 1;
      g.font = `900 ${minD * 0.22}px ${LAT_FONT}`;
      g.fillStyle = "#fff";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(brand ?? rng.pick(CORP_NAMES), fw / 2, fh / 2, fw * 0.92);
      g.font = `700 ${minD * 0.07}px ${CJK_FONT}`;
      g.fillText("株式会社  営業中", fw / 2, fh / 2 + minD * 0.2, fw * 0.9);
    }
    g.restore();
  }
  return makeTex(c);
}

const SCREEN_FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform sampler2D map;
uniform float uTime;
uniform float uSeed;
uniform float uNeon;
uniform float uIntensity;
uniform vec2 uPx;
varying vec2 vUv;
float h1(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  float period = 6.0;
  float tt = uTime + uSeed * 13.0;
  float k = floor(tt / period);
  float ph = fract(tt / period);
  float frame = mod(k, 4.0);
  vec2 uv = vUv;
  // slow push-in
  uv = (uv - 0.5) * (1.0 - ph * 0.06) + 0.5;
  // glitch around the cut
  float g = smoothstep(0.96, 1.0, ph) + (1.0 - smoothstep(0.0, 0.05, ph));
  float band = floor(uv.y * 24.0);
  uv.x += g * (h1(band + k * 7.0) - 0.5) * 0.15;
  float ca = 0.004 + g * 0.02;
  vec2 base = vec2(uv.x, (uv.y + 3.0 - frame) / 4.0);
  base.y = clamp(base.y, (3.0 - frame) / 4.0 + 0.001, (4.0 - frame) / 4.0 - 0.001);
  vec3 c;
  c.r = texture2D(map, base + vec2(ca, 0.0)).r;
  c.g = texture2D(map, base).g;
  c.b = texture2D(map, base - vec2(ca, 0.0)).b;
  // RGB sub-pixels + scanlines
  vec2 px = vUv * uPx;
  vec3 mask = vec3(
    smoothstep(0.0, 0.2, fract(px.x)) * (1.0 - smoothstep(0.33, 0.45, fract(px.x))),
    smoothstep(0.33, 0.45, fract(px.x)) * (1.0 - smoothstep(0.66, 0.78, fract(px.x))),
    smoothstep(0.66, 0.78, fract(px.x)));
  mask = mix(vec3(1.0), mask * 2.4, 0.5);
  float scan = 0.75 + 0.25 * sin(px.y * 6.2831);
  float roll = 0.9 + 0.1 * sin(vUv.y * 3.0 - uTime * 2.0);
  vec3 col = c * mask * scan * roll * uIntensity * (1.0 + g * 1.5);
  gl_FragColor = vec4(col * uNeon, 1.0);
  #include <fog_fragment>
}`;

export function screenMaterial(tex: Texture, w: number, h: number, seed: number, intensity = 2.2): ShaderMaterial {
  const m = new ShaderMaterial({
    uniforms: UniformsUtils.merge([UniformsLib.fog, {
      map: { value: null }, uSeed: { value: seed }, uIntensity: { value: intensity },
      uPx: { value: new Vector2(w * 22, h * 22) },
    }]),
    vertexShader: SIGN_VERT,
    fragmentShader: SCREEN_FRAG,
    fog: true,
  });
  m.uniforms.map.value = tex;
  m.uniforms.uTime = shared.uTime;
  m.uniforms.uNeon = shared.uNeon;
  return m;
}

// ---------------------------------------------------------------- hologram

const HOLO_VERT = /* glsl */ `
varying vec3 vN; varying vec3 vV; varying vec3 vW;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
  vW = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * mv;
}`;
const HOLO_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uTime; uniform float uNeon;
varying vec3 vN; varying vec3 vV; varying vec3 vW;
void main() {
  float fr = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float scan = 0.55 + 0.45 * step(0.5, fract(vW.y * 6.0 - uTime * 1.5));
  float fl = 0.85 + 0.15 * sin(uTime * 40.0) * sin(uTime * 7.0);
  float a = (0.12 + pow(fr, 2.0) * 0.9) * scan * fl;
  gl_FragColor = vec4(uColor * a * 2.5 * uNeon, 1.0);
}`;

export function holoMaterial(color: string): ShaderMaterial {
  const m = new ShaderMaterial({
    uniforms: { uColor: { value: new Color("#" + color) } },
    vertexShader: HOLO_VERT,
    fragmentShader: HOLO_FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
  m.uniforms.uTime = shared.uTime;
  m.uniforms.uNeon = shared.uNeon;
  return m;
}

// ---------------------------------------------------------------- light spill

let glowTex: CanvasTexture | null = null;
function glowTexture(): CanvasTexture {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, "rgba(255,255,255,1)");
  rg.addColorStop(0.35, "rgba(255,255,255,0.45)");
  rg.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, 128, 128);
  glowTex = new CanvasTexture(c);
  return glowTex;
}

const glowMatCache = new Map<string, MeshBasicMaterial>();
function glowMat(color: string, strength: number): MeshBasicMaterial {
  const key = color + strength;
  let m = glowMatCache.get(key);
  if (!m) {
    m = new MeshBasicMaterial({
      map: glowTexture(), color: new Color("#" + color).multiplyScalar(strength), transparent: true,
      blending: AdditiveBlending, depthWrite: false, fog: true,
    });
    glowMatCache.set(key, m);
  }
  return m;
}

/** additive glow on a wall / ground: fakes the light a sign throws around it */
export function glow(b: Builder, x: number, y: number, z: number, w: number, h: number, color: string, strength = 0.35, ry = 0, rx = 0): void {
  const m = new Mesh(new PlaneGeometry(w, h), glowMat(color, strength));
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, 0, "YXZ");
  m.userData.noAO = true;
  m.userData.noReflect = false;
  m.renderOrder = 2;
  b.extra(m);
}

/** a flat face carrying a sign material (canvas, ticker, screen) */
export function face(b: Builder, mat: import("three").Material, x: number, y: number, z: number, w: number, h: number, ry = 0): Mesh {
  const m = new Mesh(new PlaneGeometry(w, h), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.userData.noAO = true;
  b.extra(m);
  return m;
}

/**
 * Sign box: metal casing with a lit face on the front (and back if twoSided).
 * Centred at (x, y, z) in the current frame, faces +z (rotated by ry).
 */
export function signBox(
  b: Builder, x: number, y: number, z: number, w: number, h: number, d: number, ry: number,
  mat: import("three").Material, twoSided: boolean, casing = "frame",
): void {
  b.pushT(x, y, z, ry);
  b.box(casing, 0, 0, 0, w + 0.06, h + 0.06, d);
  face(b, mat, 0, 0, d / 2 + 0.004, w, h, 0);
  if (twoSided) face(b, mat, 0, 0, -d / 2 - 0.004, w, h, Math.PI);
  b.pop();
}
