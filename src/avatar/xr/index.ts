import * as THREE from 'three';
import { AvatarModel } from '../webavatar.js';
import { createPlaneMarker } from './planeMarker.js';
import { HitTestHandler } from './hitTest.js';
import { logger } from '../../logger.js';
import { emitter } from '../../events.js';
import { CameraConfig } from '../webavatar.dto.js';

export class WebAvatarXR {
  private enabled = false;

  private planeMarker:
    | THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>
    | undefined;
  private controller: THREE.XRTargetRaySpace | undefined;
  private hitTestHandler: HitTestHandler;

  private session?: XRSession;
  private overlayElement: HTMLElement;

  private modelPosition: THREE.Vector3;
  private modelScale: THREE.Vector3;
  private cameraConfig: CameraConfig;

  constructor(private readonly avatar: AvatarModel) {
    this.onSelect = this.onSelect.bind(this);
    this.onSessionEnded = this.onSessionEnded.bind(this);
  }

  isEnabled() {
    return this.enabled;
  }

  async isSupported() {
    const hasXR = 'xr' in navigator;
    if (!hasXR) return false;

    if (!navigator.xr) return false;

    try {
      return await navigator.xr.isSessionSupported('immersive-ar');
    } catch (e: any) {
      logger.warn(`Failed to check AR support: ${e.message}`);
    }

    return false;
  }

  deleteOverlay(id = 'sermas-ar-overlay', recreateOverlay = true) {
    const exists = document.getElementById(id);
    if (!exists) return;
    exists.remove();
    if (recreateOverlay) {
      this.createOverlay();
    }
  }

  createOverlay(id = 'sermas-ar-overlay') {
    const exists = document.getElementById(id);
    if (exists) return exists;

    // create overlay dom element
    const overlay = document.createElement('div');
    overlay.id = id;
    overlay.classList.add('sermas-toolkit', 'ar-overlay');
    overlay.style.display = 'none';

    // create close button
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '38');
    svg.setAttribute('height', '38');
    svg.style.position = 'absolute';
    svg.style.right = '20px';
    svg.style.top = '20px';
    svg.addEventListener('click', () => this.stop());

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M 12,12 L 28,28 M 28,12 12,28');
    path.setAttribute('stroke', '#fff');
    path.setAttribute('stroke-width', '2');
    svg.appendChild(path);

    overlay.appendChild(svg);

    document.body.appendChild(overlay);

    return overlay;
  }

  async init() {
    const supported = await this.isSupported();
    if (!supported) return;

    this.overlayElement = this.createOverlay();
    this.hitTestHandler = new HitTestHandler(this.avatar.getRenderer());
  }

  async start(): Promise<boolean> {
    const started = await this.startXRSession();
    if (!started) return false;
    this.setupArScene();

    return true;
  }

  async startXRSession() {
    if (this.enabled) return true;

    const supported = await this.isSupported();
    if (!supported) return false;

    const xrSessionInit: XRSessionInit = {
      requiredFeatures: ['local', 'hit-test'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: {
        root: this.overlayElement,
      },
    };

    if (!navigator.xr) return false;

    if (this.session) {
      this.session.end();
      this.session = undefined;
    }

    try {
      this.session = await navigator.xr.requestSession(
        'immersive-ar',
        xrSessionInit,
      );
      this.session.addEventListener('end', this.onSessionEnded);

      const renderer = this.avatar.getRenderer();

      renderer.xr.setReferenceSpaceType('local');
      await renderer.xr.setSession(this.session);

      if (this.overlayElement) {
        this.overlayElement.style.display = '';
      }

      this.enabled = true;
      emitter.emit('xr.session', 'start');

      return true;
    } catch (e: any) {
      logger.error(`Failed to init AR session: ${e.message}`);
      emitter.emit('xr.session', 'error');
    }

    return false;
  }

  async stop() {
    emitter.emit('xr.session', 'stop');

    this.enabled = false;
    this.resetOriginalScene();

    this.session?.removeEventListener('end', this.onSessionEnded);
    await this.session?.end();
    this.session = undefined;

    // if (this.overlayElement) {
    //     this.overlayElement.style.display = 'none';
    // }
    this.deleteOverlay();
    window.location.reload();
  }

  animate(timestamp?: number, frame?: XRFrame) {
    this.handleHitTest(frame);
  }

  onSessionEnded() {
    this.stop();
  }

  async destroy() {
    this.stop();
  }

  setupArScene() {
    const model = this.avatar.getModel();
    const scene = this.avatar.getScene();
    const renderer = this.avatar.getRenderer();

    // this.ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    // scene.add(this.ambientLight);

    //Create plane Marker
    this.planeMarker = createPlaneMarker();
    scene.add(this.planeMarker);

    // Create controller
    this.controller = renderer.xr.getController(0);
    scene.add(this.controller);

    //remove background
    if (this.avatar.getBackground()) {
      scene.background = null;
    }

    this.controller.addEventListener('select', this.onSelect);
    if (model) {
      this.modelPosition = model.position;
      this.modelScale = model.scale;
      this.cameraConfig = this.avatar.getCameraConfig();
      scene.remove(model);
    }
  }

  onSelect() {
    const model = this.avatar.getModel();
    const scene = this.avatar.getScene();

    if (!model) return;
    if (!this.planeMarker) return;
    if (!this.planeMarker.visible) return;

    model.position.setFromMatrixPosition(this.planeMarker.matrix);
    model.visible = true;
    model.scale.set(1.5, 1.5, 1.5);

    scene.add(model);
  }

  async handleHitTest(frame?: XRFrame) {
    const hitPoseTransformed = await this.hitTestHandler?.onFrame(frame);

    if (!this.planeMarker) return;

    if (!hitPoseTransformed) {
      this.planeMarker.visible = false;
      return;
    }

    this.planeMarker.visible = true;
    this.planeMarker.matrix.fromArray(hitPoseTransformed);
  }

  async resetOriginalScene() {
    const model = this.avatar.getModel();
    const scene = this.avatar.getScene();
    const camera = this.avatar.getCamera();
    scene.remove(model);

    //delete planeMarker
    if (this.planeMarker) {
      scene.remove(this.planeMarker);
      this.planeMarker = undefined;
    }

    //Delete controller
    if (this.controller) scene.remove(this.controller);
    this.controller = undefined;

    //restore background if any
    const background = this.avatar.getBackground();
    if (background) {
      scene.background = background;
    }
    if (model) {
      model.scale.set(this.modelScale.x, this.modelScale.y, this.modelScale.z);
      model.position.set(
        this.modelPosition.x,
        this.modelPosition.y,
        this.modelPosition.z,
      );
      // restore camera config
      this.avatar.setCameraConfig(this.cameraConfig);
      camera.fov = 45;
      camera.updateProjectionMatrix();
    }
    scene.add(model);
  }
}
