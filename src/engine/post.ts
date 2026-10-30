/**
 * Post stack: scene (HDR, MSAA) -> GTAO -> bloom -> tone map (ACES) -> film grade.
 * Grade = split toning, contrast, saturation, chromatic aberration, vignette,
 * grain and optional letterbox.
 */
import { Color, HalfFloatType, Object3D, PerspectiveCamera, Scene, Vector2, WebGLRenderer, WebGLRenderTarget } from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.45 },
    uGrain: { value: 0.035 },
    uChroma: { value: 0.0025 },
    uContrast: { value: 1.08 },
    uSaturation: { value: 1.12 },
    uShadowTint: { value: new Color(0x10223a) },
    uHighlightTint: { value: new Color(0xffd6e8) },
    uSplit: { value: 0.3 },
    uBars: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain, uChroma, uContrast, uSaturation, uSplit, uBars;
    uniform vec3 uShadowTint, uHighlightTint;
    varying vec2 vUv;
    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 dir = vUv - 0.5;
      float ca = uChroma * dot(dir, dir) * 4.0;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv - dir * ca).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv + dir * ca).b;
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      vec3 toned = mix(uShadowTint, uHighlightTint, smoothstep(0.02, 0.7, luma));
      vec3 tonedCol = col * toned / max(dot(toned, vec3(0.2126, 0.7152, 0.0722)), 1e-3);
      col = mix(col, tonedCol, uSplit);
      col = (col - 0.5) * uContrast + 0.5;
      luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, uSaturation);
      float vig = smoothstep(0.3, 0.95, length(dir * vec2(1.0, 0.85)) * 1.3);
      col *= 1.0 - vig * uVignette;
      float g = rand(vUv * 1.7 + fract(uTime * 7.13)) - 0.5;
      col += g * uGrain * (0.5 + 0.5 * (1.0 - abs(luma - 0.4) * 2.0));
      float bar = step(vUv.y, uBars) + step(1.0 - uBars, vUv.y);
      col = mix(col, vec3(0.0), bar);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

class SelectiveGTAOPass extends GTAOPass {
  private hidden: Object3D[] = [];
  override render(...args: Parameters<GTAOPass["render"]>): void {
    this.scene.traverse(o => {
      if (o.userData.noAO && o.visible) {
        o.visible = false;
        this.hidden.push(o);
      }
    });
    super.render(...args);
    for (const o of this.hidden) o.visible = true;
    this.hidden.length = 0;
  }
}

export class Post {
  readonly composer: EffectComposer;
  readonly ao: SelectiveGTAOPass;
  readonly bloom: UnrealBloomPass;
  readonly grade: ShaderPass;
  letterbox = 0;
  private bars = 0;

  constructor(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera) {
    const size = renderer.getDrawingBufferSize(new Vector2());
    if (!size.x || !size.y) size.set(1280, 720);
    const rt = new WebGLRenderTarget(size.x, size.y, { type: HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.ao = new SelectiveGTAOPass(scene, camera, size.x, size.y);
    this.ao.blendIntensity = 0.9;
    this.ao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.5, thickness: 1.2, scale: 1.0, samples: 12 });
    this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 12 });
    this.composer.addPass(this.ao);
    this.bloom = new UnrealBloomPass(new Vector2(size.x, size.y), 0, 0.35, 1.1);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
  }

  get gradeU(): Record<string, { value: number }> {
    return this.grade.uniforms as unknown as Record<string, { value: number }>;
  }

  setSize(w: number, h: number): void {
    this.composer.setSize(w, h);
  }

  render(dt: number): void {
    const g = this.gradeU;
    g.uTime.value += dt;
    const s = this.composer.renderer.getDrawingBufferSize(new Vector2());
    const aspect = s.y > 0 ? s.x / s.y : 1;
    const target = this.letterbox > 0 ? Math.max(0, (1 - aspect / this.letterbox) / 2) : 0;
    this.bars += (target - this.bars) * Math.min(1, dt * 4);
    g.uBars.value = this.bars;
    this.composer.render(dt);
  }
}
