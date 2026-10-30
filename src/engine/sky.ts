/**
 * Night sky (smog lit from below by the city) and a background city of
 * towers with lit window grids and the odd neon band, all fogged out.
 */
import {
  BackSide, BoxGeometry, Color, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh,
  MeshStandardMaterial, Object3D, Quaternion, ShaderMaterial, SphereGeometry, Vector3,
} from "three";
import type { WebGLProgramParametersWithUniforms } from "three";
import { GLSL_NOISE, shared } from "../gen/materials";
import { Rng } from "../gen/rng";

export const skyUniforms = {
  uZenith: { value: new Color(0x020309) },
  uHorizon: { value: new Color(0x3a1440) },
  uGlow: { value: new Color(0xff4f7a) },
  uTime: shared.uTime,
};

export function createSky(): Mesh {
  const m = new ShaderMaterial({
    uniforms: skyUniforms,
    side: BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGlow; uniform float uTime;
      varying vec3 vDir;
      ${GLSL_NOISE}
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uZenith, pow(h, 0.45));
        col += uGlow * exp(-h * 14.0) * 0.18;
        // smog clouds lit from below
        vec2 uv = d.xz / max(d.y, 0.06) * 0.35;
        float c = cpFbm(vec3(uv * 1.3 + vec2(uTime * 0.004, 0.0), 1.0));
        c = smoothstep(0.35, 0.85, c);
        col = mix(col, uHorizon * 1.4 + uGlow * 0.08, c * (1.0 - h) * 0.75);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new Mesh(new SphereGeometry(900, 48, 24), m);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.userData.noAO = true;
  return mesh;
}

/** towers around the block, beyond the roads */
export function createCity(innerX: number, innerZ: number, seed: number, palette: readonly string[], height = 50): InstancedMesh {
  const rng = new Rng(seed * 13 + 3);
  const geo = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const mat = new MeshStandardMaterial({ color: 0x07080b, roughness: 0.6, metalness: 0.4, envMapIntensity: 0.5 });
  const items: { m: Matrix4; seed: number; neon: Color }[] = [];
  const add = (x: number, z: number, w: number, d: number, h: number) => {
    const m = new Matrix4().compose(new Vector3(x, 0, z), new Quaternion(), new Vector3(w, h, d));
    items.push({ m, seed: rng.next() * 1000, neon: new Color("#" + rng.pick(palette)) });
  };
  // rings of blocks
  const openRings = Math.max(4, Math.ceil((height * 1.15) / 26));
  for (let ring = 0; ring < openRings + 4; ring++) {
    const gap = 12;
    const ex = innerX + ring * 26 + gap, ez = innerZ + ring * 26 + gap;
    const n = 10 + ring * 6;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const per = 2 * (ex + ez);
      let s = t * per * 2;
      let x: number, z: number;
      // walk the rectangle perimeter
      if (s < 2 * ex) { x = -ex + s; z = ez; }
      else if ((s -= 2 * ex) < 2 * ez) { x = ex; z = ez - s; }
      else if ((s -= 2 * ez) < 2 * ex) { x = ex - s; z = -ez; }
      else { s -= 2 * ex; x = -ex; z = -ez + s; }
      const w = rng.range(10, 22), d = rng.range(10, 22);
      const off = rng.range(4, 14);
      const nx = Math.sign(x) * (Math.abs(x) >= ex - 1 ? off : 0);
      const nz = Math.sign(z) * (Math.abs(z) >= ez - 1 ? off : 0);
      let h = ring < 1 ? rng.range(14, 40) : rng.range(25, 60 + ring * 22);
      const px = x + nx, pz = z + nz;
      // keep the camera side (front-right quadrant) open: a low-rise plaza
      // a wide lineup is seen from the front, so clear the whole street side
      const front = pz > -innerZ * 0.3 && (px > -innerX * 0.3 || innerX > 50);
      if (front && ring < 1) continue;
      if (front && ring < openRings) h = rng.range(5, 11);
      add(px, pz, w, d, h);
      if (!(front && ring < openRings) && ring < 5 && rng.chance(0.3)) add(px, pz, w * 0.6, d * 0.6, h + rng.range(10, 40));
    }
  }
  const mesh = new InstancedMesh(geo, mat, items.length);
  const seeds = new Float32Array(items.length);
  const neon = new Float32Array(items.length * 3);
  items.forEach((it, i) => {
    mesh.setMatrixAt(i, it.m);
    seeds[i] = it.seed;
    neon.set([it.neon.r, it.neon.g, it.neon.b], i * 3);
  });
  geo.setAttribute("aSeed", new InstancedBufferAttribute(seeds, 1));
  geo.setAttribute("aNeon", new InstancedBufferAttribute(neon, 3));
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mat.onBeforeCompile = (s: WebGLProgramParametersWithUniforms) => {
    s.uniforms.uTime = shared.uTime;
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\n attribute float aSeed; attribute vec3 aNeon; varying float vSeed; varying vec3 vNeon; varying vec3 vBW; varying vec3 vBN; varying vec3 vBS;")
      .replace("#include <project_vertex>", `#include <project_vertex>
        vSeed = aSeed; vNeon = aNeon;
        vBW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        vBN = normalize(mat3(instanceMatrix) * objectNormal);
        vBS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));`);
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\n uniform float uTime; varying float vSeed; varying vec3 vNeon; varying vec3 vBW; varying vec3 vBN; varying vec3 vBS;\n" + GLSL_NOISE)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        if (abs(vBN.y) < 0.5) {
          vec3 T = normalize(cross(vec3(0.0, 1.0, 0.0), vBN));
          vec2 f = vec2(dot(vBW, T), vBW.y);
          vec2 cell = vec2(1.5, 3.2);
          vec2 id = floor(f / cell);
          vec2 g = fract(f / cell);
          float win = step(0.25, g.x) * step(g.x, 0.75) * step(0.3, g.y) * step(g.y, 0.75);
          float h = cpHash(vec3(id, vSeed));
          float floorLit = step(0.45, cpHash(vec3(0.0, id.y, vSeed + 3.0)));
          float lit = step(h, 0.1 + 0.2 * floorLit);
          vec3 wc = mix(vec3(1.0, 0.65, 0.35), vec3(0.6, 0.85, 1.0), step(0.5, cpHash(vec3(id, vSeed + 9.0))));
          float fadeD = exp(-max(0.0, length(vBW.xz) - 60.0) * 0.006);
          totalEmissiveRadiance += wc * win * lit * 0.5 * fadeD * (0.6 + 0.4 * cpHash(vec3(id, 2.0)));
          // neon bands at street level and a vertical sign strip
          float band = step(abs(vBW.y - 4.5 - fract(vSeed) * 3.0), 0.35) * step(0.4, fract(vSeed * 3.1));
          float strip = step(abs(fract(f.x / 9.0 + vSeed) - 0.5), 0.015) * step(vBW.y, 8.0 + fract(vSeed * 7.0) * 30.0) * step(0.55, fract(vSeed * 5.3));
          totalEmissiveRadiance += vNeon * strip * 1.4 * step(40.0, length(vBW.xz));
        }`);
  };
  mesh.userData.noAO = true;
  void Object3D;
  return mesh;
}
