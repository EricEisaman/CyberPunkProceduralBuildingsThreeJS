/**
 * Geometry accumulator. Generators add thousands of small parts (boxes,
 * cylinders, tubes) under a material key; build() merges every key into one
 * mesh, so a building with ~10k parts draws in a few dozen calls.
 *
 * A transform stack lets facade code work in a local frame:
 * x along the facade, y up, z out of the wall.
 */
import {
  BoxGeometry, BufferGeometry, CatmullRomCurve3, Color, CylinderGeometry, Euler, Group, Matrix4, Mesh, MeshBasicMaterial,
  Object3D, Quaternion, SphereGeometry, TubeGeometry, Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export interface LightSpec {
  pos: Vector3;
  color: Color;
  intensity: number;
  distance: number;
}

export type Animator = (t: number, dt: number) => void;

/** an editable text in the building: neon tubes (A-Z 0-9) or a drawn sign (any text) */
export interface TextSpec {
  id: string;
  text: string;
  def: string;
  kind: "neon" | "sign";
  vertical: boolean;
  label: string;
  maxLen: number;
}

const proxyMat = new MeshBasicMaterial({ visible: false });

const KEEP_SURFACE = ["position", "normal"];
const KEEP_UV = ["position", "normal", "uv"];
const KEEP_WIN = ["position", "normal", "uv", "aWin"];

function prep(geo: BufferGeometry, keep: string[]): BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const name of Object.keys(g.attributes)) if (!keep.includes(name)) g.deleteAttribute(name);
  g.clearGroups();
  return g;
}

const unitBox = prep(new BoxGeometry(1, 1, 1), KEEP_SURFACE);
const cylCache = new Map<number, BufferGeometry>();
function unitCyl(seg: number): BufferGeometry {
  let g = cylCache.get(seg);
  if (!g) {
    g = prep(new CylinderGeometry(1, 1, 1, seg, 1, false), KEEP_SURFACE);
    cylCache.set(seg, g);
  }
  return g;
}
const sphCache = new Map<number, BufferGeometry>();
function unitSphere(seg: number): BufferGeometry {
  let g = sphCache.get(seg);
  if (!g) {
    g = prep(new SphereGeometry(1, seg, Math.max(3, Math.round(seg * 0.6))), KEEP_SURFACE);
    sphCache.set(seg, g);
  }
  return g;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3();
const UP = new Vector3(0, 1, 0);

export interface MaterialSource {
  get(key: string): import("three").Material;
}

export class Builder {
  readonly parts = new Map<string, BufferGeometry[]>();
  readonly extras: Object3D[] = [];
  readonly lights: LightSpec[] = [];
  readonly steam: Vector3[] = [];
  readonly animators: Animator[] = [];
  readonly texts: TextSpec[] = [];
  /** user text per slot id (ids are prefixed with the building type) */
  overrides: Record<string, string> = {};
  prefix = "";
  /** characters a neon slot can bend into tubes */
  neonChars = "";
  private stack: Matrix4[] = [new Matrix4()];

  /**
   * The text for slot `id`: the user's override, else the generated default.
   * Neon slots are upper-cased and limited to the tube font's characters.
   */
  text(id: string, def: string, kind: "neon" | "sign", label: string, opts: { vertical?: boolean; maxLen?: number } = {}): string {
    const full = this.prefix + id;
    const maxLen = opts.maxLen ?? 12;
    const clean = (t: string) => {
      let r = kind === "neon" ? [...t.toUpperCase()].filter(c => this.neonChars.includes(c) || c === " ").join("") : t;
      r = [...r].slice(0, maxLen).join("");
      return r.trim() ? r : def;
    };
    const text = clean(this.overrides[full] ?? def);
    this.texts.push({ id: full, text, def, kind, vertical: !!opts.vertical, label, maxLen });
    return text;
  }

  /** invisible click target for text slot `id`: a box centred at (x, y, z) in the current frame */
  textProxy(id: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0): void {
    const m = this.makeProxy(id, sx, sy, sz);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    this.extra(m);
  }

  /** a click target not placed anywhere yet (parent it to a moving object yourself) */
  makeProxy(id: string, sx: number, sy: number, sz: number): Mesh {
    const m = new Mesh(new BoxGeometry(Math.max(sx, 0.2), Math.max(sy, 0.2), Math.max(sz, 0.2)), proxyMat);
    m.userData = { textId: this.prefix + id, noAO: true, noReflect: true };
    return m;
  }

  get top(): Matrix4 {
    return this.stack[this.stack.length - 1];
  }

  push(m: Matrix4): this {
    this.stack.push(this.top.clone().multiply(m));
    return this;
  }

  /** push a translation + rotation about Y */
  pushT(x: number, y: number, z: number, ry = 0): this {
    _q.setFromAxisAngle(UP, ry);
    return this.push(new Matrix4().compose(_p.set(x, y, z), _q, _s.set(1, 1, 1)));
  }

  pop(): this {
    if (this.stack.length > 1) this.stack.pop();
    return this;
  }

  /** a local point in world space */
  world(x: number, y: number, z: number): Vector3 {
    return new Vector3(x, y, z).applyMatrix4(this.top);
  }

  /** a local direction in world space */
  worldDir(x: number, y: number, z: number): Vector3 {
    return new Vector3(x, y, z).transformDirection(this.top);
  }

  /** world rotation about Y of the current frame */
  worldRotY(): number {
    const d = this.worldDir(0, 0, 1);
    return Math.atan2(d.x, d.z);
  }

  /** add a prepared geometry (already in local space of the current frame) */
  addRaw(key: string, geo: BufferGeometry, local?: Matrix4): void {
    const keep = key.startsWith("win") ? KEEP_WIN : key.startsWith("uv:") ? KEEP_UV : KEEP_SURFACE;
    const g = prep(geo, keep);
    const m = local ? this.top.clone().multiply(local) : this.top;
    g.applyMatrix4(m);
    let list = this.parts.get(key);
    if (!list) this.parts.set(key, (list = []));
    list.push(g);
  }

  private addUnit(key: string, unit: BufferGeometry, m: Matrix4): void {
    const g = unit.clone();
    g.applyMatrix4(_m.multiplyMatrices(this.top, m));
    let list = this.parts.get(key);
    if (!list) this.parts.set(key, (list = []));
    list.push(g);
  }

  /** box centred at (x,y,z) with size (sx,sy,sz), rotated about Y */
  box(key: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0): void {
    if (sx <= 0 || sy <= 0 || sz <= 0) return;
    _q.setFromAxisAngle(UP, ry);
    this.addUnit(key, unitBox, new Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)));
  }

  /** box from min corner to max corner (axis aligned in the local frame) */
  boxMM(key: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    this.box(key, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
  }

  /** box with full Euler rotation */
  boxR(key: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx: number, ry: number, rz: number): void {
    _q.setFromEuler(_e.set(rx, ry, rz));
    this.addUnit(key, unitBox, new Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)));
  }

  /** vertical cylinder centred at (x,y,z) */
  cyl(key: string, x: number, y: number, z: number, r: number, h: number, seg = 10): void {
    this.addUnit(key, unitCyl(seg), new Matrix4().compose(_p.set(x, y, z), _q.identity(), _s.set(r, h, r)));
  }

  /** cylinder (bar, pipe, strut) between two local points */
  bar(key: string, a: Vector3, b: Vector3, r: number, seg = 6): void {
    const d = _p.subVectors(b, a);
    const len = d.length();
    if (len < 1e-4) return;
    _q.setFromUnitVectors(UP, d.clone().divideScalar(len));
    const mid = a.clone().add(b).multiplyScalar(0.5);
    this.addUnit(key, unitCyl(seg), new Matrix4().compose(mid, _q, _s.set(r, len, r)));
  }

  barXYZ(key: string, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, seg = 6): void {
    this.bar(key, new Vector3(ax, ay, az), new Vector3(bx, by, bz), r, seg);
  }

  sphere(key: string, x: number, y: number, z: number, r: number, seg = 8): void {
    this.addUnit(key, unitSphere(seg), new Matrix4().compose(_p.set(x, y, z), _q.identity(), _s.set(r, r, r)));
  }

  /** ellipsoid / squashed sphere */
  blob(key: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, seg = 8): void {
    this.addUnit(key, unitSphere(seg), new Matrix4().compose(_p.set(x, y, z), _q.identity(), _s.set(sx, sy, sz)));
  }

  /** smooth tube through local points */
  tube(key: string, pts: Vector3[], r: number, radial = 5, closed = false, tension = 0.5): void {
    if (pts.length < 2) return;
    const curve = new CatmullRomCurve3(pts, closed, "catmullrom", tension);
    const segs = Math.max(4, Math.round(curve.getLength() * 3));
    this.addRaw(key, new TubeGeometry(curve, Math.min(segs, 64), r, radial, closed));
  }

  /** hanging cable between two local points */
  cable(key: string, a: Vector3, b: Vector3, sag: number, r = 0.012): void {
    const pts: Vector3[] = [];
    const n = 10;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = a.clone().lerp(b, t);
      p.y -= sag * 4 * t * (1 - t);
      pts.push(p);
    }
    this.tube(key, pts, r, 3);
  }

  /** a separate object (own material / animation), placed in the current frame */
  extra(obj: Object3D): Object3D {
    obj.applyMatrix4(this.top);
    this.extras.push(obj);
    return obj;
  }

  light(x: number, y: number, z: number, color: Color | string | number, intensity: number, distance: number): void {
    this.lights.push({ pos: this.world(x, y, z), color: new Color(color), intensity, distance });
  }

  steamAt(x: number, y: number, z: number): void {
    this.steam.push(this.world(x, y, z));
  }

  build(mats: MaterialSource): Group {
    const group = new Group();
    for (const [key, list] of this.parts) {
      if (!list.length) continue;
      const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new Mesh(merged, mats.get(key));
      mesh.name = key;
      mesh.userData.key = key;
      group.add(mesh);
      for (const g of list) if (g !== merged) g.dispose();
    }
    for (const e of this.extras) group.add(e);
    return group;
  }
}
