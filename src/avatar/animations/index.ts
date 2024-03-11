import * as THREE from 'three';
import { HolisticV1Results } from '../../detection';
import { Logger } from '../../logger';
import { getTypedKeys } from '../util';
import { AvatarModel } from '../webavatar';
import {
  AnimationGroup,
  AnimationHandler,
  AnimationLabel,
  GestureMappingKeys,
} from '../webavatar.dto';
import { AnimationBase } from './animation.base';
import { Animator } from './animator';
import { BlendShapeAnimation } from './blendshapes';
import { AnimationsLoader } from './loader';

const logger = new Logger('webavatar.animation');

export class WebavatarAnimation extends AnimationBase {
  private animationEnabled = true;

  private animations: Record<AnimationGroup, Record<string, AnimationHandler>>;

  private mixer: Record<AnimationGroup, THREE.AnimationMixer> = {} as Record<
    AnimationGroup,
    THREE.AnimationMixer
  >;

  private readonly blendShapes: BlendShapeAnimation;
  private readonly animationLoader: AnimationsLoader;

  private animator: Animator;

  private currentGesture: GestureMappingKeys = 'gesture_idle';

  // loopable gestures will be played in a loop. Gesture not in the list will just play once
  private loopableGestures: GestureMappingKeys[] = [
    'gesture_idle',
    'gesture_talking',
    'gesture_walk',
  ];

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

  constructor(avatar: AvatarModel) {
    super(avatar);
    this.animationLoader = new AnimationsLoader(this.avatar.getConfig());
    this.blendShapes = new BlendShapeAnimation(this.avatar);
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
  }

  resetAction(action: THREE.AnimationAction) {
    action
      .reset()
      .setLoop(THREE.LoopOnce, 1)
      .setEffectiveWeight(1)
      .setEffectiveTimeScale(1);
    action.clampWhenFinished = true;
  }

  onAnimationFinished(event: any) {
    const action = event.action as THREE.AnimationAction;
    const actionName = action.getClip().name;
    const animationName = this.normalizeAnimationName(actionName);
    const label = this.getAnimationLabel(animationName);

    // logger.debug(`finished animation ${label.group} ${label.name}`);

    if (label.group === 'gesture') {
      if (this.loopableGestures.indexOf(this.currentGesture) === -1) {
        // logger.debug(`reset ${this.currentGesture} to gesture_idle`);
        this.currentGesture = 'gesture_idle';
      } else {
        // logger.debug(`restarting gesture ${this.currentGesture}`);
      }
      this.playGesture(this.currentGesture);
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

  playGesture(gestureKey: GestureMappingKeys) {
    const animationName = this.getNextGestureAnimationName(gestureKey);
    if (!animationName) {
      logger.warn(`Animation not found ${gestureKey}`);
      return;
    }
    this.play('gesture', animationName);
    this.currentGesture = gestureKey;
  }

  playGestureIdle() {
    this.playGesture('gesture_idle');
  }

  playGestureTalking() {
    this.playGesture('gesture_talking');
  }

  playGestureListening() {
    this.playGesture('gesture_listening');
  }

  play(group: AnimationGroup, name: string, durationSec = 1) {
    if (!this.animationEnabled) {
      // logger.debug('Animation disabled');
      return;
    }

    const anim = this.getAnimation(group, name);
    if (!anim) {
      // logger.debug(`animation for ${group} ${name} not found`);
      return;
    }

    if (anim.action.isRunning()) {
      // logger.debug(`animation already running ${group} ${name}`);
      return;
    }

    logger.log(`Play ${group} ${anim.name}`);

    const animationRunning: AnimationHandler[] = [];
    const animations = this.getAnimations(group);

    // idle_1 => idle
    const baseName = name.replace(/_[0-9]/, '');

    animations.forEach((a) => {
      if (a.name === name) return;

      if (a.action.isRunning() || a.name.startsWith(baseName)) {
        // logger.debug(`Current animation ${a.name}`);
        animationRunning.push(a);
        return;
      }

      // logger.debug(`Reset animation ${a.name}`);
      this.resetAction(a.action);
      a.action.stop();
    });

    this.resetAction(anim.action);
    anim.action.play();

    if (animationRunning.length) {
      animationRunning.forEach((a) => {
        // logger.debug(`crossFade ${a.name} to ${anim.name}`);
        a.action.crossFadeTo(anim.action, durationSec, false);
      });
    }

    // logger.debug(`play ${anim.name}`);
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
}
