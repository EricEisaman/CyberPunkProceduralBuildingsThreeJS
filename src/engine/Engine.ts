/**
 * The 3D side of the app: renderer, scene, lights, camera + shots, post,
 * reflections, rain, steam, and rebuilding the building when params change.
 * React only talks to it through setParams / setAtmos / shot / capture.
 */
import {
  ACESFilmicToneMapping, AdditiveBlending, AmbientLight, Box3, Box3Helper, BoxGeometry, Color, DirectionalLight, FogExp2, Group,
  HemisphereLight, Mesh, MeshBasicMaterial, Object3D, PCFShadowMap, PerspectiveCamera, PMREMGenerator, PointLight, Raycaster, Scene, SRGBColorSpace,
  Timer, Vector2, Vector3, WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Animator, TextSpec } from "../gen/builder";
import { generate } from "../gen/index";
import { MaterialLib, PALETTES, shared } from "../gen/materials";
import { pbr } from "../gen/textures";
import type { Params } from "../gen/types";
import { Post } from "./post";
import { createRain } from "./rain";
import { PlanarReflection } from "./reflect";
import { createSky, skyUniforms } from "./sky";
import { buildStage, groundUniforms, ROAD, SIDEWALK, setGroundTextures } from "./stage";
import { createSteam } from "./steam";

export interface Atmos {
  rain: boolean;
  rainAmount: number;
  wet: number;
  fog: number;
  bloom: number;
  neon: number;
  lit: number;
  ao: boolean;
  orbit: boolean;
  letterbox: number;
  grain: number;
  /** Improved textures: ambientCG PBR sets instead of the procedural surfaces */
  textures: boolean;
  /** texture variety: 0 = the seed's sets; each shuffle rolls new ones */
  texShuffle: number;
}

export const DEFAULT_ATMOS: Atmos = {
  rain: false, rainAmount: 0.55, wet: 0.85, fog: 0, bloom: 0, neon: 1, lit: 0.55, ao: true, orbit: false, letterbox: 0, grain: 0.035, textures: true, texShuffle: 0,
};

export type ShotName = "hero" | "street" | "worm" | "aerial" | "detail" | "roof";

const MAX_LIGHTS = 16;

export class Engine {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(38, 1, 0.1, 2000);
  readonly controls: OrbitControls;
  private post: Post;
  private refl = new PlanarReflection();
  private mats = new MaterialLib();
  private timer = new Timer();
  private rain: ReturnType<typeof createRain>;
  private building: Group | null = null;
  private stage: Group | null = null;
  private steam: Mesh | null = null;
  private animators: Animator[] = [];
  private texts = new Map<string, TextSpec>();
  private proxies: Object3D[] = [];
  private ray = new Raycaster();
  private hoverBox = new Box3Helper(new Box3(), 0x05d9e8);
  private hoverId: string | null = null;
  private lights: PointLight[] = [];
  private hemi: HemisphereLight;
  private key: DirectionalLight;
  private dims = { halfW: 10, halfD: 8, height: 40 };
  private fly: { from: Vector3; to: Vector3; tFrom: Vector3; tTo: Vector3; t: number; dur: number } | null = null;
  private raf = 0;
  private captureNext: ((url: string) => void) | null = null;
  onStats: ((s: { fps: number; calls: number; tris: number }) => void) | null = null;
  private fpsAcc = { t: 0, n: 0 };

  constructor(private container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene.fog = new FogExp2(0x1a1130, 0.01);
    this.scene.background = new Color(0x05050a);
    this.scene.add(createSky());

    this.hemi = new HemisphereLight(0x6a58b0, 0x1a0c20, 1.3);
    this.scene.add(this.hemi);
    this.scene.add(new AmbientLight(0x221833, 0.6));
    // cool moonlight key through the smog: its shadows carve out the cantilevers, signs and AC units
    this.key = new DirectionalLight(0xa8b8ff, 1.6);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(4096, 4096);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.03;
    this.key.shadow.radius = 3;
    this.scene.add(this.key, this.key.target);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    const rim = new DirectionalLight(0xff4fa0, 0.35);
    rim.position.set(60, 20, -60);
    this.scene.add(rim);
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const l = new PointLight(0xffffff, 0, 10, 2);
      this.lights.push(l);
      this.scene.add(l);
    }

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI * 0.97;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 400;
    this.controls.autoRotateSpeed = 0.35;
    this.controls.addEventListener("start", () => (this.fly = null));

    this.rain = createRain({ camera: this.camera, shared: { uTime: shared.uTime, uWind: shared.uWind, uLightning: { value: 0 } }, maxCount: 60000 });
    this.rain.material.blending = AdditiveBlending;
    this.rain.uniforms.uColor.value.set(0x5a6070);
    this.rain.uniforms.uOpacity.value = 0.9;
    this.rain.uniforms.uVolume.value.set(60, 45, 60);
    this.rain.mesh.userData.noAO = true;
    this.rain.mesh.userData.noReflect = true;
    this.scene.add(this.rain.mesh);

    this.post = new Post(this.renderer, this.scene, this.camera);
    const hm = this.hoverBox.material as unknown as { depthTest: boolean; transparent: boolean };
    hm.depthTest = false;
    hm.transparent = true;
    this.hoverBox.renderOrder = 20;
    this.hoverBox.visible = false;
    this.hoverBox.userData = { noAO: true, noReflect: true };
    this.scene.add(this.hoverBox);
    this.buildEnv();
    this.resize();
    window.addEventListener("resize", this.resize);
    this.loop();
  }

  private buildEnv(): void {
    // a neon-lit box room for reflections on glass and metal
    const env = new Scene();
    env.add(createSky());
    const pal = ["ff2a6d", "05d9e8", "ff9e3d", "7b61ff", "ffffff", "ff6ec7"];
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const r = 60 + (i % 3) * 20;
      const m = new Mesh(new BoxGeometry(6 + (i % 4) * 4, 2 + (i % 5) * 6, 1), new MeshBasicMaterial({ color: new Color("#" + pal[i % pal.length]).multiplyScalar(i % 4 === 0 ? 2.5 : 0.6) }));
      m.position.set(Math.cos(a) * r, 5 + (i % 7) * 8, Math.sin(a) * r);
      m.lookAt(0, m.position.y, 0);
      env.add(m);
    }
    const floor = new Mesh(new BoxGeometry(400, 1, 400), new MeshBasicMaterial({ color: 0x050407 }));
    floor.position.y = -1;
    env.add(floor);
    const pm = new PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(env, 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pm.dispose();
  }

  private resize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    this.post.setSize(w, h);
    this.refl.setSize(w * pr, h * pr);
  };

  setParams(p: Params): void {
    const res = generate(p, this.mats);
    // swap the building
    if (this.building) {
      this.scene.remove(this.building);
      disposeGeo(this.building);
    }
    this.building = res.group;
    this.scene.add(res.group);
    setShadows(res.group);
    this.animators = res.animators;
    this.seed = p.seed;
    this.applyTextureVariety();
    this.fitKey(res.halfW, res.halfD, res.height);
    this.dims = { halfW: res.halfW, halfD: res.halfD, height: res.height };

    // stage + city follow the footprint
    if (this.stage) {
      this.scene.remove(this.stage);
      disposeGeo(this.stage);
    }
    const st = buildStage(res.halfW, res.halfD, p.seed, this.mats, res.attach);
    this.stage = st.group;
    this.scene.add(st.group);
    setShadows(st.group);
    // no background city: past the outer ring of poles the ground is an open plane
    const pal = PALETTES[p.palette];
    this.applyFog();
    skyUniforms.uGlow.value.set("#" + pal[0]);

    // editable texts + their click targets
    this.texts = new Map(res.texts.map(t => [t.id, t]));
    this.proxies = [];
    res.group.traverse(o => {
      if (o.userData.textId) this.proxies.push(o);
    });
    this.setHover(null);

    // lights: strongest first
    const specs = [...res.lights, ...st.builder.lights].sort((a, b) => b.intensity - a.intensity);
    this.lights.forEach((l, i) => {
      const s = specs[i];
      if (!s) {
        l.intensity = 0;
        return;
      }
      l.position.copy(s.pos);
      l.color.copy(s.color);
      l.intensity = s.intensity;
      l.distance = s.distance * 1.6;
    });

    if (this.steam) {
      this.scene.remove(this.steam);
      this.steam.geometry.dispose();
    }
    this.steam = createSteam([...res.steam, ...st.builder.steam]);
    this.scene.add(this.steam);
  }

  private fitKey(w: number, d: number, h: number): void {
    const dir = new Vector3(-0.55, 0.62, 0.56).normalize();
    const c = new Vector3(0, h * 0.45, 0);
    const r = Math.sqrt(w * w + d * d + (h * 0.55) ** 2) + 6;
    this.key.target.position.copy(c);
    this.key.position.copy(c).addScaledVector(dir, r + 40);
    const cam = this.key.shadow.camera;
    cam.left = -r;
    cam.right = r;
    cam.top = r;
    cam.bottom = -r;
    cam.near = 1;
    cam.far = r * 2 + 80;
    cam.updateProjectionMatrix();
    this.key.target.updateMatrixWorld();
  }

  private fogAmount = DEFAULT_ATMOS.fog;
  private texShuffle = 0;
  private seed = 0;
  private applyTextureVariety(): void {
    this.mats.applyTextureVariety(this.seed, this.texShuffle);
    setGroundTextures(this.seed, this.texShuffle);
  }
  private applyFog(): void {
    // taller buildings get thinner fog so the crown still reads
    const k = Math.min(1, Math.max(0.3, 55 / this.dims.height));
    (this.scene.fog as FogExp2).density = this.fogAmount * 0.025 * k; // 0 = no fog at all
  }

  get size() {
    return this.dims;
  }

  setAtmos(a: Atmos): void {

    this.rain.mesh.visible = a.rain;
    this.rain.setDensity(a.rainAmount);
    shared.uWet.value = a.wet;
    groundUniforms.uRain.value = a.rain ? 1 : 0;
    this.fogAmount = a.fog;
    this.applyFog();
    this.post.bloom.strength = a.bloom;
    this.post.bloom.enabled = a.bloom > 0;
    shared.uNeon.value = a.neon;
    shared.uLit.value = a.lit;
    this.post.ao.enabled = a.ao;
    this.controls.autoRotate = a.orbit;
    this.post.letterbox = a.letterbox;
    this.post.gradeU.uGrain.value = a.grain;
    pbr.uPBR.value = a.textures ? 1 : 0;
    if (a.texShuffle !== this.texShuffle) {
      this.texShuffle = a.texShuffle;
      this.applyTextureVariety();
    }
  }

  shot(name: ShotName, instant = false): void {
    const { halfW: w, halfD: d, height: h } = this.dims;
    const big = Math.max(h, w * 2.2);
    let pos: Vector3, tgt: Vector3, fov = 38;
    switch (name) {
      case "street":
        pos = new Vector3(w + SIDEWALK + ROAD * 0.75, 1.65, d + SIDEWALK + ROAD * 0.72); // in the street, clear of the far poles
        tgt = new Vector3(0, h * 0.42, 0);
        fov = 50;
        break;
      case "worm":
        pos = new Vector3(-w * 0.15, 0.6, d + 1.7);
        tgt = new Vector3(w * 0.25, h * 0.75, d - 3);
        fov = 72;
        break;
      case "aerial":
        pos = new Vector3(big * 0.75, big * 1.15, big * 0.95);
        tgt = new Vector3(0, h * 0.25, 0);
        break;
      case "detail":
        pos = new Vector3(w * 0.55, Math.min(h * 0.22, 12), d + 9);
        tgt = new Vector3(w * 0.15, Math.min(h * 0.22, 12) + 1.5, d);
        fov = 42;
        break;
      case "roof":
        pos = new Vector3(w + 10, h * 0.95 + 6, d + 14);
        tgt = new Vector3(0, h * 0.85, 0);
        fov = 45;
        break;
      default: {
        // ¾ view from across the intersection, far enough to fit the whole height
        fov = 46;
        const fit = (h * 0.47) / Math.tan((fov / 2) * (Math.PI / 180)) + Math.max(w, d) * 0.8;
        // a wide lineup reads best from the front, a single building from the ¾ corner
        const dir = (w > 30 ? new Vector3(0.2, 0, 1) : new Vector3(0.6, 0, 0.8)).normalize();
        pos = dir.multiplyScalar(fit).add(new Vector3(0, fit > 55 ? 14 + h * 0.06 : 3.2, 0));
        tgt = new Vector3(0, h * 0.47, 0);
      }
    }
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    if (instant) {
      this.camera.position.copy(pos);
      this.controls.target.copy(tgt);
      this.fly = null;
      this.controls.update();
      return;
    }
    this.fly = { from: this.camera.position.clone(), to: pos, tFrom: this.controls.target.clone(), tTo: tgt, t: 0, dur: 1.8 };
  }

  /**
   * Preload step: build `p`, compile every shader it uses off the main
   * thread where the driver allows it, then draw one full frame so the
   * shadow, reflection and post-processing variants are compiled too.
   */
  async warm(p: Params): Promise<void> {
    this.setParams(p);
    this.shot("hero", true);
    await this.renderer.compileAsync(this.scene, this.camera);
    this.camera.updateMatrixWorld();
    this.refl.update(this.renderer, this.scene, this.camera);
    groundUniforms.tRefl.value = this.refl.rt.texture;
    groundUniforms.uTexMat.value.copy(this.refl.textureMatrix);
    this.post.render(0);
  }

  /**
   * Compile another building's shaders without showing it: generate it off
   * scene, compile against this scene's lights, then throw the geometry away.
   * Materials are shared, so switching to it later doesn't stall.
   */
  async precompile(p: Params): Promise<void> {
    const res = generate(p, this.mats);
    setShadows(res.group);
    await this.renderer.compileAsync(res.group, this.camera, this.scene);
    disposeGeo(res.group);
  }

  /** every editable text in the current building */
  get textSlots(): TextSpec[] {
    return [...this.texts.values()];
  }

  /** the editable text under a screen point (client coordinates), if any */
  pickText(clientX: number, clientY: number): TextSpec | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const hit = this.ray.intersectObjects(this.proxies, false)[0];
    return hit ? this.texts.get(hit.object.userData.textId) ?? null : null;
  }

  /** outline the text slot `id` (null clears it) */
  setHover(id: string | null): void {
    this.hoverId = id;
    const proxy = id ? this.proxies.find(o => o.userData.textId === id) : undefined;
    if (!proxy) {
      this.hoverBox.visible = false;
      return;
    }
    proxy.updateWorldMatrix(true, false);
    this.hoverBox.box.setFromObject(proxy).expandByScalar(0.08);
    this.hoverBox.visible = true;
  }

  /** recordings: pose the camera exactly (no fly-in) */
  setCamera(px: number, py: number, pz: number, tx: number, ty: number, tz: number, fov?: number): void {
    this.fly = null;
    this.camera.position.set(px, py, pz);
    this.controls.target.set(tx, ty, tz);
    if (fov && Math.abs(this.camera.fov - fov) > 1e-6) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.controls.update();
  }

  /** recordings: the scene's state the recorder needs (building size, a text slot's screen position) */
  probe(textId?: string): { halfW: number; halfD: number; height: number; text?: { x: number; y: number } } {
    const out: { halfW: number; halfD: number; height: number; text?: { x: number; y: number } } = { ...this.dims };
    if (textId) {
      const o = this.proxies.find(p => p.userData.textId === textId);
      if (o) {
        const v = o.getWorldPosition(new Vector3()).project(this.camera);
        const r = this.renderer.domElement.getBoundingClientRect();
        out.text = { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
      }
    }
    return out;
  }

  capture(): Promise<string> {
    return new Promise(res => (this.captureNext = res));
  }

  private loop = (ts?: number): void => {
    this.raf = requestAnimationFrame(this.loop);
    this.timer.update(ts);
    const dt = Math.min(this.timer.getDelta(), 0.05);
    shared.uTime.value += dt;
    if (this.fly) {
      const f = this.fly;
      f.t = Math.min(1, f.t + dt / f.dur);
      const e = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2;
      this.camera.position.lerpVectors(f.from, f.to, e);
      this.controls.target.lerpVectors(f.tFrom, f.tTo, e);
      if (f.t >= 1) this.fly = null;
    }
    this.controls.update(dt);
    if (this.camera.position.y < 0.35) this.camera.position.y = 0.35;
    for (const a of this.animators) a(shared.uTime.value, dt);
    if (this.hoverId && this.hoverBox.visible) this.setHover(this.hoverId);
    this.rain.update();
    this.camera.updateMatrixWorld();
    this.refl.update(this.renderer, this.scene, this.camera);
    groundUniforms.tRefl.value = this.refl.rt.texture;
    groundUniforms.uTexMat.value.copy(this.refl.textureMatrix);
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    this.post.render(dt);
    if (this.captureNext) {
      const cb = this.captureNext;
      this.captureNext = null;
      cb(this.renderer.domElement.toDataURL("image/png"));
    }
    this.fpsAcc.t += dt;
    this.fpsAcc.n++;
    if (this.fpsAcc.t > 0.5) {
      this.onStats?.({ fps: this.fpsAcc.n / this.fpsAcc.t, calls: this.renderer.info.render.calls, tris: this.renderer.info.render.triangles });
      this.fpsAcc = { t: 0, n: 0 };
    }
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    this.controls.dispose();
    this.renderer.dispose();
    this.mats.dispose();
    this.renderer.domElement.remove();
  }
}

function setShadows(root: Object3D): void {
  root.traverse(c => {
    const m = c as Mesh;
    if (!m.isMesh) return;
    const glowy = !!m.userData.noAO || !!m.userData.ground;
    m.castShadow = !glowy;
    m.receiveShadow = !m.userData.noAO;
  });
}

function disposeGeo(o: Object3D): void {
  o.traverse(c => {
    const m = c as Mesh;
    if (m.geometry) m.geometry.dispose();
  });
}
