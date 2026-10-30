/**
 * Planar reflection of the scene in the ground plane (y = 0), rendered at
 * reduced resolution with mipmaps so the street shader can blur and streak it
 * like wet asphalt. Same mirror-camera + oblique clip plane maths as three's
 * Reflector, done once per frame for every ground surface.
 */
import {
  HalfFloatType, LinearMipmapLinearFilter, Matrix4, Object3D, PerspectiveCamera, Plane, Scene, Vector3, Vector4,
  WebGLRenderer, WebGLRenderTarget,
} from "three";

export class PlanarReflection {
  readonly rt: WebGLRenderTarget;
  readonly textureMatrix = new Matrix4();
  private cam = new PerspectiveCamera();
  private plane = new Plane();
  private clip = new Vector4();
  private n = new Vector3(0, 1, 0);
  private hidden: Object3D[] = [];
  scale = 0.5;

  constructor() {
    this.rt = new WebGLRenderTarget(512, 512, { type: HalfFloatType, samples: 0 });
    this.rt.texture.generateMipmaps = true;
    this.rt.texture.minFilter = LinearMipmapLinearFilter;
  }

  setSize(w: number, h: number): void {
    this.rt.setSize(Math.max(64, Math.round(w * this.scale)), Math.max(64, Math.round(h * this.scale)));
  }

  update(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera): void {
    const camPos = new Vector3().setFromMatrixPosition(camera.matrixWorld);
    if (camPos.y <= 0.01) return;
    // mirror camera
    const view = camPos.clone().setY(-camPos.y);
    const rot = new Matrix4().extractRotation(camera.matrixWorld);
    const look = new Vector3(0, 0, -1).applyMatrix4(rot).add(camPos);
    const target = look.clone().setY(-look.y);
    const up = new Vector3(0, 1, 0).applyMatrix4(rot);
    up.y = -up.y;
    this.cam.position.copy(view);
    this.cam.up.copy(up);
    this.cam.lookAt(target);
    this.cam.far = camera.far;
    this.cam.near = camera.near;
    this.cam.updateMatrixWorld();
    this.cam.projectionMatrix.copy(camera.projectionMatrix);

    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(this.cam.projectionMatrix).multiply(this.cam.matrixWorldInverse);

    // oblique near plane = the ground, so nothing below it leaks in
    this.plane.setFromNormalAndCoplanarPoint(this.n, new Vector3(0, 0.0, 0));
    this.plane.applyMatrix4(this.cam.matrixWorldInverse);
    this.clip.set(this.plane.normal.x, this.plane.normal.y, this.plane.normal.z, this.plane.constant);
    const pm = this.cam.projectionMatrix.elements;
    const q = new Vector4(
      (Math.sign(this.clip.x) + pm[8]) / pm[0],
      (Math.sign(this.clip.y) + pm[9]) / pm[5],
      -1,
      (1 + pm[10]) / pm[14],
    );
    this.clip.multiplyScalar(2 / this.clip.dot(q));
    pm[2] = this.clip.x;
    pm[6] = this.clip.y;
    pm[10] = this.clip.z + 1 - 0.003;
    pm[14] = this.clip.w;
    this.cam.projectionMatrixInverse.copy(this.cam.projectionMatrix).invert();

    scene.traverseVisible(o => {
      if (o.userData.noReflect) this.hidden.push(o);
    });
    for (const o of this.hidden) o.visible = false;
    const prevRT = renderer.getRenderTarget();
    const prevXr = renderer.xr.enabled;
    renderer.xr.enabled = false;
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(scene, this.cam);
    renderer.setRenderTarget(prevRT);
    renderer.xr.enabled = prevXr;
    for (const o of this.hidden) o.visible = true;
    this.hidden.length = 0;
  }
}
