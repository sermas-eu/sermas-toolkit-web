import { AvatarFaceBlendShape } from '../../../avatar/webavatar.dto.js';
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js';
import { Logger } from '../../../logger.js';
import { AnimationBase } from '../animation.base.js';

import blendShapes, { EmotionBlendShape } from './lib/index.js';
import { VisemeType } from './lib/viseme/index.js';

const logger = new Logger('webavatar.animation.blendShapes');

export class BlendShapeAnimation extends AnimationBase {
  private blinkInterval = 4000; // Every 4 seconds
  private eyeClosed = false;

  private blendShapeTarget: THREE.Mesh;
  private foundBlendShapes: THREE.Mesh[] = [];

  private gui: GUI;

  animate(delta: number): void {
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

      if (child.morphTargetInfluences) {
        // logger.debug(`Found blend shapes in mesh ${child.name}`, Object.keys(child.morphTargetDictionary))
        this.foundBlendShapes.push(child);
      }

      if (child.name === config.animations?.blendShapes?.name) {
        if (!child.morphTargetInfluences && !child.morphTargetDictionary) {
          logger.warn(`Mesh ${child.name} does not have blend shapes`);
        } else {
          if (this.blendShapeTarget) {
            logger.warn(`Blend shape target '${child.name}' is already set`);
          } else {
            this.blendShapeTarget = child;
          }
        }
      }
    });
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

    // TODO: HACK since we are not controlling  the teeth mesh (Wolf3D_Teeth)
    // we constrain the jawOpen maximum
    if (label === 'jawOpen') {
      const maxValue = 0.3;
      const normalized = value * maxValue;
      value = normalized;
    }

    this.blendShapeTarget.morphTargetInfluences[key] = value;
  }

  getBlendShape(label: string): number | undefined {
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
          .add(influences, '' + value, 0, 1, 0.01)
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
