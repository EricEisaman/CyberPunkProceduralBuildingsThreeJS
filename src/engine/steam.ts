/** Rising steam puffs from vents and manholes: soft billboards, one draw call. */
import {
  AdditiveBlending, BufferAttribute, Color, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, ShaderMaterial,
  Vector3,
} from "three";
import { shared } from "../gen/materials";

const PER = 14;

export function createSteam(sources: Vector3[]): Mesh {
  const geo = new InstancedBufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const n = Math.max(1, sources.length * PER);
  const origin = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  sources.forEach((s, i) => {
    for (let k = 0; k < PER; k++) {
      origin.set([s.x, s.y, s.z], (i * PER + k) * 3);
      seed[i * PER + k] = Math.random();
    }
  });
  geo.setAttribute("aOrigin", new InstancedBufferAttribute(origin, 3));
  geo.setAttribute("aSeed", new InstancedBufferAttribute(seed, 1));
  geo.instanceCount = sources.length * PER;
  const mat = new ShaderMaterial({
    uniforms: { uTime: shared.uTime, uWind: shared.uWind, uColor: { value: new Color(0x8a90a8) }, uAmount: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uTime; uniform vec3 uWind;
      attribute vec3 aOrigin; attribute float aSeed;
      varying vec2 vUv; varying float vA; varying float vSeed;
      void main() {
        float life = fract(uTime * 0.12 + aSeed);
        vec3 p = aOrigin + vec3(0.0, life * 4.5, 0.0) + uWind * life * 0.9 + vec3(sin(aSeed * 40.0 + uTime), 0.0, cos(aSeed * 31.0 + uTime)) * life * 0.6;
        float size = 0.6 + life * 3.2;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        mv.xy += position.xy * size;
        vUv = position.xy + 0.5;
        vA = smoothstep(0.0, 0.15, life) * (1.0 - smoothstep(0.4, 1.0, life));
        vSeed = aSeed;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uAmount;
      varying vec2 vUv; varying float vA; varying float vSeed;
      void main() {
        vec2 d = vUv - 0.5;
        float r = length(d);
        float n = 0.75 + 0.25 * sin(d.x * 12.0 + vSeed * 30.0) * sin(d.y * 10.0 - vSeed * 20.0);
        float a = smoothstep(0.5, 0.0, r) * vA * n * 0.07 * uAmount;
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
  });
  const mesh = new Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.userData.noAO = true;
  mesh.userData.noReflect = true;
  mesh.renderOrder = 5;
  return mesh;
}
