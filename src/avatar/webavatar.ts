import * as THREE from 'three';
import { Clock } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { Logger } from '../logger.js';

import { WebavatarAnimation } from './animations/index.js';
import type {
  AvatarModelConfig,
  CameraConfig,
  DetectionPosition,
} from './webavatar.dto.js';

import { HolisticV1Results } from '../detection/index.js';
import { sendStatus } from '../events.js';
import { SermasToolkit } from '../index.js';
import { TextureLoader2 } from './loader/TextureLoader2.js';
import {
  DefaultAvatarConfig,
  DefaultReadyPlayerMeAvatarConfig,
} from './webavatar.defaults.js';
import { WebAvatarHandler } from './webavatar.handler.js';
import { WebAvatarXR } from './xr/index.js';

// exports
export {
  DefaultAvatarConfig,
  DefaultReadyPlayerMeAvatarConfig,
} from './webavatar.defaults.js';

const logger = new Logger('webavatar.api');

export class AvatarModel {
  private stopped = false;

  private model: THREE.Group;

  private container: HTMLElement;

  private camera: THREE.PerspectiveCamera;
  private scene: THREE.Scene;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;

  private clock = new Clock();
  private stats: Stats;

  private skeleton: THREE.SkeletonHelper;

  private readonly filterMeshRegExp: RegExp | string | undefined = undefined;

  private meshes: Record<string, THREE.Mesh> = {};

  private animation: WebavatarAnimation | undefined;
  private handler: WebAvatarHandler | undefined;
  private readonly xr: WebAvatarXR;

  private toolkit?: SermasToolkit;
  private background: THREE.Texture;

  constructor(private readonly config: AvatarModelConfig) {
    this.animate = this.animate.bind(this);
    this.onWindowResize = this.onWindowResize.bind(this);

    // filter mesh and animations matching by name
    if (
      this.config.animations?.filterMesh !== undefined &&
      this.config.animations?.filterMesh
    ) {
      this.filterMeshRegExp = this.config.animations?.filterMesh;
    }

    this.xr = new WebAvatarXR(this);
  }

  getXR() {
    return this.xr;
  }

  toggleAudio(enabled?: boolean) {
    this.handler?.toggleAudio(enabled);
  }

  getAnimation() {
    return this.animation;
  }

  getBlendShapes() {
    return this.animation?.getBlendShapes();
  }

  isStopped() {
    return this.stopped;
  }

  getConfig() {
    return this.config;
  }

  getScene() {
    return this.scene;
  }

  getRenderer() {
    return this.renderer;
  }

  getModel() {
    return this.model;
  }

  getCamera() {
    return this.camera;
  }

  getBackground() {
    return this.background;
  }

  setMirrorModeEnabled(enabled: boolean) {
    this.animation?.setMirrorModeEnabled(enabled);
  }

  setAnimationEnabled(enabled: boolean) {
    this.animation?.setAnimationEnabled(enabled);
  }

  setLookAtUser(enabled: boolean) {
    this.animation?.setLookAtUser(enabled);
  }

  getCameraConfig(): CameraConfig {
    const { x, y, z } = this.camera.position;
    const { x: rx, y: ry, z: rz } = this.camera.rotation;
    return {
      position: { x, y, z } as any,
      rotation: { x: rx, y: ry, z: rz } as any,
    };
  }

  async init(toolkit?: SermasToolkit): Promise<AvatarModel> {
    logger.debug('initializing avatar model');

    this.toolkit = toolkit;

    this.stopped = false;

    this.createScene();

    const model = await this.loadModel();
    if (!model) {
      logger.warn(`Failed to load avatar model`);
      return this;
    }

    this.initializeCamera(model);

    if (this.filterMeshRegExp) {
      model.children = model.children.filter(
        (c) => !c.name.match(this.filterMeshRegExp as string | RegExp),
      );
    }

    model.traverse((child: any) => {
      if (
        this.filterMeshRegExp &&
        child.name.match(this.filterMeshRegExp as string | RegExp)
      ) {
        child.visible = false;
        return;
      }
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        this.meshes[child.name] = child;
      }
    });

    this.model = model;

    this.scene.add(model);

    this.skeleton = new THREE.SkeletonHelper(model);
    this.skeleton.visible = false;
    this.scene.add(this.skeleton);

    // const axesHelper = new THREE.AxesHelper( 5 );
    // this.scene.add( axesHelper );

    this.animation = new WebavatarAnimation(this);
    await this.animation.init();

    this.handler = new WebAvatarHandler(this);
    await this.handler.init();

    await this.xr.init();

    this.animate();

    // start renderer
    this.renderer.setAnimationLoop(this.animate);

    logger.debug('avatar initialized');

    this.handleEyesMotion.bind(this);
    this.toolkit?.on('detection.characterization', this.handleEyesMotion);

    return this;
  }

  handleEyesMotion(ev: any) {
    if (ev.detections?.length && ev.detections[0].detections?.face?.length) {
      const box = ev.detections[0].detections.face[0].boxRaw;
      this.animation?.moveEyes({
        x: -((box[2] + box[0]) / 2 - 0.5),
        y: -((box[3] + box[1]) / 2 - 0.5),
      } as DetectionPosition);
    }
  }

  async startLookingGlass() {
    const m = await import('./looking-glass');
    const x = new m.LookingGlassAdapter();
    x.init(this.renderer);
  }

  printArmature() {
    this.model?.traverse((child: any) => {
      console.log(child.name, JSON.stringify(child.quaternion));
    });
  }

  createScene() {
    let container: HTMLElement;
    if (!this.config.domId) {
      container = document.createElement('div');
      container.id = `webavatar-${Math.round(Math.random() * 10000)}`;
      document.body.appendChild(container);
    } else {
      container = document.getElementById(this.config.domId) as HTMLElement;
      if (!container) throw new Error(`Element not found ${this.config.domId}`);
    }

    this.container = container;

    const containerSizes = {
      width: this.container.clientWidth,
      height: this.container.clientHeight,
    };

    this.camera = new THREE.PerspectiveCamera(
      45,
      containerSizes.width / containerSizes.height,
      0.1,
      9,
    );

    const backgroundColor = this.config.ui?.backgroundColor || '#BBBBBB';
    const fogColor = this.config.ui?.fogColor || '#64539E';
    const hemiLightColors = this.config.ui?.hemiLightColor || {};
    hemiLightColors.sky = hemiLightColors.sky || '#fff';
    hemiLightColors.ground = hemiLightColors.ground || '#000';

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(backgroundColor);
    this.scene.fog = new THREE.Fog(fogColor, 200, 1000);

    const hemiLight = new THREE.HemisphereLight(
      hemiLightColors.sky,
      hemiLightColors.ground,
      5,
    );
    hemiLight.position.set(0, 200, 0);
    this.scene.add(hemiLight);

    // ground
    // const mesh = new THREE.Mesh(
    //   new THREE.PlaneGeometry(2000, 2000),
    //   new THREE.MeshPhongMaterial({ color: 0x999999, depthWrite: false })
    // );
    // mesh.rotation.x = -Math.PI / 2;
    // mesh.receiveShadow = true;
    // this.scene.add(mesh);

    // const grid = new THREE.GridHelper(10, 20, 0x000000, 0x000000);
    // grid.material.opacity = 0.2;
    // grid.material.transparent = true;
    // this.scene.add(grid);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      logarithmicDepthBuffer: true,
      // powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(containerSizes.width, containerSizes.height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.xr.enabled = true;

    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.screenSpacePanning = true;

    window.addEventListener('resize', this.onWindowResize);

    // stats
    if (this.config.showGui) {
      this.stats = new Stats();
      this.container.appendChild(this.stats.dom);
    }
  }

  async setBackground(assetId: string) {
    // Load the background texture
    const loader = new TextureLoader2();

    let url: string | undefined = assetId;
    if (this.toolkit) {
      url = await this.toolkit?.configureLoader('backgrounds', assetId, loader);
    }

    if (!url) return;

    logger.debug(`Loading background from ${url}`);
    const image = await loader.load(url);
    this.scene.background = image;
    this.background = image;
  }

  initializeCamera(model: THREE.Group) {
    // // set the camera
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3()).length();
    const center = box.getCenter(new THREE.Vector3());

    this.controls.reset();

    model.position.x += model.position.x - center.x;
    model.position.y += model.position.y - center.y;
    model.position.z += model.position.z - center.z;

    this.controls.maxDistance = size * 10;
    this.camera.near = size / 100;
    this.camera.far = size * 100;
    this.camera.updateProjectionMatrix();

    const cameraConfig = this.isPortrait()
      ? this.config.cameraMobile
      : this.config.camera;

    this.setCameraConfig(cameraConfig);

    this.camera.updateMatrixWorld(true);
    this.controls.saveState();
  }

  setCameraConfig(cameraConfig?: CameraConfig) {
    if (!cameraConfig) return;

    if (cameraConfig.rotation)
      this.camera.rotation.set(
        cameraConfig.rotation?.x,
        cameraConfig.rotation?.y,
        cameraConfig.rotation?.z,
      );

    if (cameraConfig.position)
      this.camera.position.set(
        cameraConfig.position?.x,
        cameraConfig.position?.y,
        cameraConfig.position?.z,
      );
  }

  // load 3D model
  async loadModel(): Promise<THREE.Group | undefined> {
    const format = this.config.path.endsWith('.fbx') ? 'fbx' : 'glb';
    const loader = format === 'fbx' ? new FBXLoader() : new GLTFLoader();

    let url: string | undefined = this.config.path;

    if (this.toolkit && this.config.id != 'rpm') {
      url = await this.toolkit.configureLoader(
        'avatars',
        this.config.id,
        loader,
      );
    }

    // path is an URL
    if (url && url.startsWith('http') && url.indexOf('readyplayer') > -1) {
      // ready player me path
      if (url.indexOf('morphTargets') === -1) {
        const suffix = 'morphTargets=ARKit,Oculus%20Visemes%2032';
        url = `${url}${url.indexOf('?') === -1 ? '?' : '&'}${suffix}`;
      }
    }

    if (!url) {
      logger.warn(`Avatar not available, using default`);
      return undefined;
    }

    logger.log(`loading ${format} from ${url}`);
    const model = await loader.loadAsync(
      url,
      (ev: ProgressEvent<EventTarget>) =>
        this.showLoadingProgress(ev.loaded, ev.total),
    );
    // loading completed
    sendStatus('');

    // handle gltf/glb
    const gltf = model as GLTF;

    if (gltf.parser !== undefined && gltf.scene !== undefined) {
      return gltf.scene;
    }

    return model as THREE.Group;
  }

  setPoses(results: HolisticV1Results) {
    this.animation?.setPoses(results);
  }

  showLoadingProgress(loaded: number, total: number) {
    const hasTotal = total !== 0;
    if (!hasTotal) {
      sendStatus(`Loading model...`);
      return;
    }

    // const toMB = (v: number) => Math.round(v / 1024 / 1024 * 100) / 100
    let percentage = Math.round((100 * loaded) / total);
    percentage = percentage > 100 || percentage === Infinity ? 100 : percentage;
    // sendStatus(`Loading model ${toMB(ev.loaded)}MB of ${toMB(ev.total)}MB`)
    sendStatus(`Loading model ${percentage}%`);
  }

  toggleSkeleton(show?: boolean) {
    if (show === undefined) {
      show = !this.skeleton.visible;
    }

    this.skeleton.visible = show;
  }

  isPortrait() {
    return this.container.clientWidth < this.container.clientHeight;
  }

  onWindowResize() {
    this.camera.aspect =
      this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(
      this.container.clientWidth,
      this.container.clientHeight,
    );

    if (this.isPortrait()) {
      if (!this.model) return;
      const cameraMobileConfig = this.config.cameraMobile;
      if (cameraMobileConfig) {
        if (cameraMobileConfig.rotation)
          this.camera.rotation.set(
            cameraMobileConfig.rotation.x,
            cameraMobileConfig.rotation.y,
            cameraMobileConfig.rotation.z,
          );
        if (cameraMobileConfig.position)
          this.camera.position.set(
            cameraMobileConfig.position.x,
            cameraMobileConfig.position.y,
            cameraMobileConfig.position.z,
          );
      }
      return;
    }

    // landscape
    const cameraConfig = this.config.camera;

    if (cameraConfig?.rotation)
      this.camera.rotation.set(
        cameraConfig.rotation?.x,
        cameraConfig.rotation?.y,
        cameraConfig.rotation?.z,
      );

    if (cameraConfig?.position)
      this.camera.position.set(
        cameraConfig.position?.x,
        cameraConfig.position?.y,
        cameraConfig.position?.z,
      );
  }

  async destroy() {
    this.stopped = true;

    window.removeEventListener('resize', this.onWindowResize);

    this.scene?.remove(...this.scene.children);

    this.renderer?.clear();
    this.renderer?.dispose();

    if (this.container) {
      while (this.container.lastChild)
        this.container.removeChild(this.container.lastChild);
    }

    await this.animation?.destroy();
    await this.handler?.destroy();
    await this.xr?.destroy();

    this.toolkit?.off('detection.characterization', this.handleEyesMotion);

    logger.debug('avatar destroyed');
    this.toolkit?.emit('avatar.status', 'removed');
  }

  animate(timestamp?: number, frame?: XRFrame) {
    if (this.stopped) return;
    const delta = this.clock.getDelta();

    if (this.renderer.xr && this.renderer.xr.isPresenting && frame) {
      this.xr?.animate(timestamp, frame);
    }

    if (this.animation) this.animation.animate(delta);
    if (this.renderer) this.renderer.render(this.scene, this.camera);
    if (this.stats) this.stats.update();
  }
}

export const getAvatarDefaultConfig = (
  config?: Partial<AvatarModelConfig>,
): AvatarModelConfig => {
  config = config || ({} as AvatarModelConfig);
  const modelType = config.modelType || 'readyplayerme';

  const rpmConfig =
    modelType === 'readyplayerme' ? DefaultReadyPlayerMeAvatarConfig : {};

  const modelConfig = {
    ...DefaultAvatarConfig,
    ...rpmConfig,
    ...(config || {}),
  } as unknown as AvatarModelConfig;

  return modelConfig;
};

export const createWebAvatar = (
  config: AvatarModelConfig,
  toolkit: SermasToolkit,
): Promise<AvatarModel> => {
  const avatar = new AvatarModel(getAvatarDefaultConfig(config));
  return avatar.init(toolkit);
};
