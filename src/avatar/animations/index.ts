import * as THREE from 'three';
import { HolisticV1Results } from '../../detection/index.js';
import { Logger } from '../../logger.js';
import { getTypedKeys } from '../util.js';
import {
  AnimationGroup,
  AnimationHandler,
  AnimationLabel,
  DetectionPosition,
  GestureMappingKeys,
} from '../webavatar.dto.js';
import { AvatarModel } from '../webavatar.js';
import { AnimationBase } from './animation.base.js';
import { Animator } from './animator/index.js';
import { BlendShapeAnimation } from './blendshapes/index.js';
import { AnimationsLoader } from './loader/index.js';

const logger = new Logger('webavatar.animation');

export class WebavatarAnimation extends AnimationBase {
  private animationEnabled = true;

  private animations: Record<AnimationGroup, Record<string, AnimationHandler>>;

  private currentAnimation: AnimationHandler;

  private mixer: Record<AnimationGroup, THREE.AnimationMixer> = {} as Record<
    AnimationGroup,
    THREE.AnimationMixer
  >;

  private readonly blendShapes: BlendShapeAnimation;
  private readonly animationLoader: AnimationsLoader;

  private animator: Animator;

  private currentAction: THREE.AnimationAction | undefined = undefined;

  private waitAction = false;

  // loopable gestures will be played in a loop. Gesture not in the list will just play once
  private loopableGestures: string[] = ['idle', 'talking', 'listening'];

  private gestureIndexes: Record<GestureMappingKeys, number> = {
    gesture_default: 0,
    gesture_idle: 0,
    gesture_waving: 0,
    gesture_listening: 0,
    gesture_talking: 0,
    gesture_donotknow: 0,
    gesture_walk: 0,
    gesture_show_left: 0,
    gesture_show_right: 0,
  };

  private mirrorModeEnabled = false;
  private lookAtUser = false;

  constructor(avatar: AvatarModel) {
    super(avatar);
    this.animationLoader = new AnimationsLoader(this.avatar.getConfig());
    this.blendShapes = new BlendShapeAnimation(this.avatar);
    this.getAnimator();
  }

  moveEyes(position: DetectionPosition) {
    if (!this.lookAtUser) return;
    this.getAnimator()?.moveEyes(position);
    this.blendShapes.moveEyes(position);
  }

  getBlendShapes() {
    return this.blendShapes;
  }

  animate(delta: number): void {
    getTypedKeys<AnimationGroup>(this.mixer).forEach((group) =>
      this.mixer[group]?.update(delta),
    );
    this.blendShapes.animate(delta);
  }

  async init() {
    // const config = this.avatar.getConfig();
    const model = this.avatar.getModel();

    if (!model) return;

    await this.animationLoader.loadAnimations();

    // wrap context
    this.onAnimationFinished = this.onAnimationFinished.bind(this);
    this.processModel();

    // getTypedKeys<AnimationGroup>(
    //   this.avatar.getConfig().animations?.masks,
    // ).forEach((group) => {
    //   this.mixer[group] = new THREE.AnimationMixer(model);
    //   this.mixer[group].addEventListener('finished', this.onAnimationFinished);
    // });

    this.mixer['gesture'] = new THREE.AnimationMixer(model);
    this.mixer['gesture'].addEventListener(
      'finished',
      this.onAnimationFinished,
    );

    await this.loadAnimations();
    await this.blendShapes.init();
  }

  getAnimator(): Animator | undefined {
    const model = this.getModel();
    if (!model) return undefined;

    if (!this.animator) {
      this.animator = new Animator(
        model,
        this.avatar.getScene(),
        this.avatar.getCamera(),
        this.avatar.getConfig().modelType == 'readyplayerme',
      );
    }

    return this.animator;
  }

  async destroy() {
    getTypedKeys<AnimationGroup>(this.mixer).forEach((group) =>
      this.mixer[group]?.removeEventListener(
        'finished',
        this.onAnimationFinished,
      ),
    );

    await this.blendShapes.destroy();
  }

  setPoses(results: HolisticV1Results) {
    if (!this.animationEnabled || !this.mirrorModeEnabled) return;
    this.stopAnimations('gesture');
    this.getAnimator()?.animate(results);
  }

  getAnimation(
    group: AnimationGroup | string,
    name?: string,
  ): AnimationHandler | null {
    let label: AnimationLabel = {
      group: group as AnimationGroup,
      name: name || '',
    };

    if (!name) {
      label = this.getAnimationLabel(group);
    }

    if (!this.animations[label.group]) return null;
    return this.animations[label.group][label.name];
  }

  getAnimationLabel(name: string): AnimationLabel {
    const parts = name.split('_');
    return {
      group: parts[0] as AnimationGroup,
      name: parts.slice(1).join('_'),
    };
  }

  normalizeAnimationName(name: string): string {
    const config = this.getConfig();
    if (config.animations?.normalizeName) {
      name = config.animations?.normalizeName(name);
    }
    return name;
  }

  async loadAnimations() {
    const model = this.getModel();
    const config = this.getConfig();

    if (!model) return;

    const imported = this.animationLoader.getAnimations();

    this.animations = [...model.animations, ...imported]
      .map((animationClip) => {
        const name = this.normalizeAnimationName(animationClip.name);
        const label = this.getAnimationLabel(name);
        return { ...label, animationName: name, animationClip };
      })
      .reduce(
        (o, { group, name, animationName, animationClip }) => {
          let maskedClip = animationClip;
          if (config.animations?.masks) {
            getTypedKeys<AnimationGroup>(config.animations?.masks).forEach(
              (maskGroup) => {
                if (animationClip.name.indexOf(maskGroup) === -1) return;
                maskedClip = new THREE.AnimationClip(
                  animationClip.name,
                  animationClip.duration,
                  animationClip.tracks,
                );

                if (
                  this.filterMeshRegExp ||
                  (config.animations?.masks &&
                    config.animations?.masks[maskGroup].length)
                ) {
                  maskedClip.tracks = maskedClip.tracks.filter((track) => {
                    // if (track.name.match(/DEF|MCH/))
                    //   return false

                    if (this.filterMeshRegExp) {
                      if (track.name.match(this.filterMeshRegExp)) return false;
                    }

                    if (!config.animations?.masks) return true;

                    const list = config.animations?.masks[maskGroup] || [];
                    return track.name.match(new RegExp(list.join('|')));
                  });

                  // logger.debug(
                  //   `Applied mask ${maskGroup} to ${animationClip.name} (kept ${maskedClip.tracks.length} of ${animationClip.tracks.length})`,
                  // );
                }

                // let unusedTracks = 0
                // for(let idx = maskedClip.tracks.length-1 ; idx>=0 ; idx--) {
                //     const track = maskedClip.tracks[idx];

                //     const numElements = track.values.length / track.times.length;

                //     let delta = 0;
                //     for(let i=0 ; i<numElements ; i++) {
                //         const valList = track.values.filter((value, index) => (index % numElements) === i);
                //         const min = valList.reduce((a,b) => Math.min(a,b), valList[0]);
                //         const max = valList.reduce((a,b) => Math.max(a,b), valList[0]);
                //         // Sum up all absolute changes in this track
                //         delta += Math.abs(max-min);
                //     }

                //     if(delta === 0) {
                //         // This track has no animation on it - remove it
                //         maskedClip.tracks.splice(idx, 1);
                //         unusedTracks++
                //     }
                // }
                // if (unusedTracks > 0)
                //   logger.debug(`Removed ${unusedTracks} unused tracks from ${animationClip.name}`)
              },
            );
          }
          // console.log(animationClip.tracks.map(t => t.name))

          if (!this.mixer[group]) {
            logger.warn(`Mixer ${group} not found`);
            return o;
          }

          const action = this.mixer[group].clipAction(maskedClip);
          this.resetAction(action);

          const handler: AnimationHandler = {
            name,
            group,
            clip: maskedClip,
            action,
            settings: {
              weight: 1,
            },
          };

          o[group] = o[group] || {};
          o[group][name] = handler;
          return o;
        },
        {} as Record<string, Record<string, AnimationHandler>>,
      );
    this.initActions();
  }

  initActions() {
    const actions = this.getAnimations('gesture');
    actions.forEach((a) => {
      if (a.name.indexOf('waving') > -1) {
        a.action.setLoop(THREE.LoopOnce, 1);
        a.action.clampWhenFinished = true;
      } else {
        a.action.setLoop(THREE.LoopPingPong, Infinity);
        a.action.play();
      }
    });
  }

  resetAction(action: THREE.AnimationAction) {
    action.reset().setEffectiveWeight(0).setEffectiveTimeScale(1);
  }

  onAnimationFinished(event: any) {
    const action = event.action as THREE.AnimationAction;
    const actionName = action.getClip().name;
    const animationName = this.normalizeAnimationName(actionName);
    const label = this.getAnimationLabel(animationName);

    logger.debug(`finished animation ${label.group} ${label.name}`);

    if (!this.isLoopable(label.name)) {
      this.waitAction = false;
      this.playGestureIdle();
    }
  }

  getGestureAnimations(gestureKey: GestureMappingKeys) {
    return this.animationLoader.getMapping()[gestureKey] || [];
  }

  getNextGestureAnimationName(gestureKey: GestureMappingKeys): string | null {
    const animations = this.animationLoader.getMapping()[gestureKey] || [];
    if (!animations.length) return null;

    const animationLength = animations.length - 1;
    this.gestureIndexes[gestureKey] = this.gestureIndexes[gestureKey] || 0;
    this.gestureIndexes[gestureKey]++;
    if (this.gestureIndexes[gestureKey] >= animationLength)
      this.gestureIndexes[gestureKey] = 0;

    const [, gestureName] = gestureKey.split('_');
    return `${gestureName}_${this.gestureIndexes[gestureKey]}`;
  }

  getCurrentGestureAnimationName(
    gestureKey: GestureMappingKeys,
  ): string | null {
    const animations = this.animationLoader.getMapping()[gestureKey] || [];
    if (!animations.length) return null;

    if (this.gestureIndexes[gestureKey] === undefined) return null;

    const [, gestureName] = gestureKey.split('_');
    return `${gestureName}_${this.gestureIndexes[gestureKey]}`;
  }

  setAnimation(name: GestureMappingKeys) {
    if (
      this.currentAction &&
      this.currentAction.getClip().name.indexOf(name) > -1
    )
      return;
    if (this.waitAction) {
      // wait action finish
      return;
    }
    const animationName = this.getNextGestureAnimationName(name);
    if (!animationName) return;
    const anim = this.getAnimation('gesture', animationName);
    if (!anim) return;

    if (!this.isLoopable(anim.name)) {
      this.resetAction(anim.action);
      this.waitAction = true;
    }

    this.setWeight(anim.action, 1);

    if (this.currentAction) {
      this.currentAction.crossFadeTo(anim.action, 1, true);
    }
    this.currentAction = anim.action;
  }

  isLoopable(name: string) {
    return this.loopableGestures.some((gesture) => name.indexOf(gesture) > -1);
  }

  setWeight(action, weight) {
    action.enabled = true;
    action.setEffectiveTimeScale(1);
    action.setEffectiveWeight(weight);
  }

  playGestureIdle() {
    this.setAnimation('gesture_idle');
  }

  playGestureTalking() {
    this.setAnimation('gesture_talking');
  }

  playGestureListening() {
    this.setAnimation('gesture_listening');
  }

  playGestureWaving() {
    this.setAnimation('gesture_waving');
    this.currentAction?.play();
  }

  getRunningAnimations(group: AnimationGroup) {
    const animations = this.animations[group];
    return Object.values(animations).filter((a) => a.action.isRunning());
  }

  stopAnimations(group: AnimationGroup) {
    this.getRunningAnimations(group).forEach((a) =>
      a.action.fadeOut(0.5).stop(),
    );
  }

  processModel() {
    const model = this.avatar.getModel();
    model?.traverse((child: any) => {
      if (!child.isMesh || !child.visible) return;

      if (child.animations && child.animations.length) {
        logger.debug(`Found animations in mesh ${child.name}`);
        logger.debug(child.animations);
      }
    });
  }

  getAnimations(group: AnimationGroup): AnimationHandler[] {
    return Object.values(this.animations[group] || {});
  }

  setMirrorModeEnabled(enabled: boolean) {
    this.mirrorModeEnabled = enabled;
  }

  setAnimationEnabled(enabled: boolean) {
    this.animationEnabled = enabled;
  }

  setLookAtUser(enabled: boolean) {
    this.lookAtUser = enabled;
  }
}
