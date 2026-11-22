import type * as THREE from 'three';
import {
  type AvatarFaceBlendShape,
  type DetectionPosition,
} from '../../../avatar/webavatar.dto.js';
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js';
import { Logger } from '../../../logger.js';
import { AnimationBase } from '../animation.base.js';

import blendShapes, { type EmotionBlendShape } from './lib/index.js';
import { type VisemeType } from './lib/viseme/index.js';
import { pickFaceMesh } from './face-mesh.js';

const logger = new Logger('webavatar.animation.blendShapes');

export class BlendShapeAnimation extends AnimationBase {
  private blinkInterval = 4000; // Every 4 seconds
  private eyeClosed = false;

  private blendShapeTarget: THREE.Mesh | undefined;
  private foundBlendShapes: THREE.Mesh[] = [];
  // teeth in their own mesh do not follow jawOpen: the jaw opens less then
  private separateTeeth = false;

  private gui: GUI;

  animate(_delta: number): void {
    //
  }

  async init() {
    this.processModel();
    this.loadBlendShapes();

    this.blinkEyes();
  }

  async destroy() {
    if (this.gui) {
      this.gui.hide();
      this.gui.destroy();
    }
  }

  getEmotion(name: EmotionBlendShape): Array<AvatarFaceBlendShape> {
    // logger.debug(`Getting blendshapes for face ${name}`);
    return blendShapes.emotion[name] || blendShapes.emotion.neutral;
  }

  moveEyes(position: DetectionPosition) {
    const down = position.y;
    const left = position.x;

    const downLeft: AvatarFaceBlendShape = {
      index: 23,
      score: down,
      categoryName: 'eyeLookDownLeft',
      displayName: '',
    };
    const downRight: AvatarFaceBlendShape = {
      index: 24,
      score: down,
      categoryName: 'eyeLookDownRight',
      displayName: '',
    };
    // const upLeft: AvatarFaceBlendShape = {
    //   index: 25,
    //   score: down * 0.5,
    //   categoryName: 'eyeLookUpLeft',
    //   displayName: '',
    // };
    // const upRight: AvatarFaceBlendShape = {
    //   index: 26,
    //   score: down * 0.5,
    //   categoryName: 'eyeLookUpRight',
    //   displayName: '',
    // };
    const inLeft: AvatarFaceBlendShape = {
      index: 27,
      score: -left,
      categoryName: 'eyeLookInLeft',
      displayName: '',
    };
    const inRight: AvatarFaceBlendShape = {
      index: 28,
      score: left,
      categoryName: 'eyeLookInRight',
      displayName: '',
    };
    const outLeft: AvatarFaceBlendShape = {
      index: 29,
      score: -left,
      categoryName: 'eyeLookOutLeft',
      displayName: '',
    };
    const outRight: AvatarFaceBlendShape = {
      index: 30,
      score: left,
      categoryName: 'eyeLookOutRight',
      displayName: '',
    };
    this.setFaceBlendShapes([
      downLeft,
      downRight,
      // upLeft,
      // upRight,
      inLeft,
      inRight,
      outLeft,
      outRight,
    ]);
  }

  blinkEyes() {
    if (this.isStopped()) return;
    let startBlinkTime = performance.now();
    setInterval(() => {
      const time = performance.now();
      if (this.eyeClosed) {
        // open // 300ms after
        this.setFaceBlendShapes(blendShapes.eyes.open);
        this.eyeClosed = !this.eyeClosed;
        startBlinkTime = performance.now();
      } else {
        // close
        if (time - startBlinkTime > this.blinkInterval) {
          this.setFaceBlendShapes(blendShapes.eyes.closed);
          this.eyeClosed = !this.eyeClosed;
        }
      }
    }, 150);
  }

  getViseme(name: VisemeType): Array<AvatarFaceBlendShape> {
    // logger.debug(`Getting blendshapes for viseme ${name}`);
    return blendShapes.viseme[name] || blendShapes.viseme.neutral;
  }

  setViseme(viseme: VisemeType) {
    const blendshapeViseme = this.getViseme(viseme);
    if (!blendshapeViseme)
      logger.log(`blendshapes for viseme ${viseme} not found`);
    this.setFaceBlendShapes(blendshapeViseme);
  }

  setEmotion(emotion: EmotionBlendShape) {
    if (!blendShapes.emotion[emotion]) {
      logger.warn(`Emotion ${emotion} has no blendShapes`);
      return;
    }
    this.setFaceBlendShapes(blendShapes.emotion[emotion]);
  }

  async processModel() {
    const model = this.getModel();
    const config = this.getConfig();

    if (!model) return;

    model.traverse((child: any) => {
      if (!child.isMesh || !child.visible) return;

      if (child.morphTargetInfluences && child.morphTargetDictionary) {
        this.foundBlendShapes.push(child);
      }
      if (/teeth/i.test(child.name)) this.separateTeeth = true;
    });

    const configured = config.animations?.blendShapes?.name;
    this.blendShapeTarget = pickFaceMesh(this.foundBlendShapes, configured);
    if (!this.blendShapeTarget) {
      logger.warn(`No mesh with face blend shapes: no lip sync or expressions`);
    } else if (![configured].flat().includes(this.blendShapeTarget.name)) {
      logger.debug(`Face blend shapes on mesh ${this.blendShapeTarget.name}`);
    }
  }

  setFaceBlendShapes(blendShapes: AvatarFaceBlendShape[]) {
    if (!blendShapes) return;
    blendShapes.forEach((blendShape) => {
      this.setBlendShape(blendShape.categoryName, blendShape.score);
    });
  }

  setBlendShape(label: string, value: number) {
    if (!this.blendShapeTarget) return;

    const mappings = this.getConfig().animations?.blendShapes?.mappings || {};
    label = mappings[label] || label;

    const morphTargetDictionary =
      this.blendShapeTarget.morphTargetDictionary || {};
    const key = morphTargetDictionary[label];

    if (!this.blendShapeTarget.morphTargetInfluences) return undefined;

    // the teeth mesh (Wolf3D_Teeth) is not driven: keep the jaw nearly closed
    if (label === 'jawOpen' && this.separateTeeth) {
      const maxValue = 0.3;
      const normalized = value * maxValue;
      value = normalized;
    }

    this.blendShapeTarget.morphTargetInfluences[key] = value;
  }

  getBlendShape(label: string): number | undefined {
    if (!this.blendShapeTarget) return undefined;
    const mappings = this.getConfig().animations?.blendShapes?.mappings || {};
    const morphTargetDictionary =
      this.blendShapeTarget.morphTargetDictionary || {};
    label = mappings[label] || label;
    const key = morphTargetDictionary[label];
    if (this.blendShapeTarget.morphTargetInfluences === undefined)
      return undefined;
    return this.blendShapeTarget.morphTargetInfluences[key];
  }

  showBlendShapeGui() {
    if (!this.blendShapeTarget) return;
    if (this.gui) {
      return;
    }

    const morphTargetDictionary =
      this.blendShapeTarget.morphTargetDictionary || {};

    // add gui
    this.gui = new GUI({
      container: document.getElementById('blendshape-controls') || undefined,
    });

    if (this.gui) {
      this.gui.hide();
      this.gui.reset();
    }

    const influences = this.blendShapeTarget.morphTargetInfluences || [];
    const blendShapeslist: string[] = [];
    for (const [key, value] of Object.entries(morphTargetDictionary)) {
      blendShapeslist.push(key);

      if (this.gui) {
        this.gui
          .add(
            influences as unknown as Record<string, number>,
            '' + value,
            0,
            1,
            0.01,
          )
          .name(key)
          .listen(true);
      }
    }

    if (this.gui) {
      this.gui.show();
      this.gui.close();
    }
  }

  hideBlendShapeGui() {
    if (!this.gui) return;
    this.gui.destroy();
  }

  loadBlendShapes() {
    if (!this.blendShapeTarget) return;

    const blendShapes = {};
    const morphTargetDictionary =
      this.blendShapeTarget.morphTargetDictionary || {};

    Object.keys(morphTargetDictionary).forEach((label) => {
      Object.defineProperty(blendShapes, label, {
        get: () => this.getBlendShape(label),
        set: (val) => this.setBlendShape(label, val),
      });
    });

    // logger.debug(`Added ${blendShapeslist.length} blend shapes`, blendShapeslist.sort())
  }
}
