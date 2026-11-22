import * as THREE from 'three';
import { Logger } from '../../logger.js';
import { getTypedKeys } from '../util.js';
import {
  type AnimationGroup,
  AnimationHandler,
  type AnimationLabel,
  type DetectionPosition,
  type GestureMappingKeys,
} from '../webavatar.dto.js';
import { AvatarModel } from '../webavatar.js';
import { AnimationBase } from './animation.base.js';
import { Animator } from './animator/index.js';
import { BlendShapeAnimation } from './blendshapes/index.js';
import { AnimationsLoader } from './loader/index.js';
import {
  gestureClips,
  gestureKey,
  isLoopableGesture,
  nextGestureClip,
} from './gestures.js';

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

  // per gesture key, the variant played last (gestures cycle through their variants)
  private gesturePositions: Record<string, number> = {};

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

    // a clip the model carries wins over the kiosk's generic one of the same name
    this.animations = [...imported, ...model.animations]
      .map((animationClip) => {
        const name = this.normalizeAnimationName(animationClip.name);
        const label = this.getAnimationLabel(name);
        return { ...label, animationName: name, animationClip };
      })
      .reduce(
        (o, { group, name, animationClip }) => {
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
    // looping gestures run all the time at weight 0 and fade in; any other gesture is a
    // one-shot, started when requested, that hands back to idle when it finishes
    const actions = this.getAnimations('gesture');
    actions.forEach((a) => {
      if (this.isLoopable(a.name)) {
        a.action.setLoop(THREE.LoopPingPong, Infinity);
        a.action.play();
      } else {
        a.action.setLoop(THREE.LoopOnce, 1);
        a.action.clampWhenFinished = true;
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

  getGestureAnimations(key: GestureMappingKeys) {
    return this.animationLoader.getMapping()[key] || [];
  }

  /** Clip labels in the gesture group (`idle_0`, `waving_0`, …): kiosk and model clips. */
  getGestureLabels(): string[] {
    return this.getAnimations('gesture').map((a) => a.name);
  }

  hasGesture(name: string): boolean {
    return gestureClips(this.getGestureLabels(), gestureKey(name)).length > 0;
  }

  getNextGestureAnimationName(
    name: GestureMappingKeys | string,
  ): string | null {
    const key = gestureKey(name);
    const next = nextGestureClip(
      this.getGestureLabels(),
      key,
      this.gesturePositions[key],
    );
    if (!next) return null;
    this.gesturePositions[key] = next.position;
    return next.label;
  }

  getCurrentGestureAnimationName(
    name: GestureMappingKeys | string,
  ): string | null {
    const key = gestureKey(name);
    const clips = gestureClips(this.getGestureLabels(), key);
    const position = this.gesturePositions[key];
    if (!clips.length || position === undefined) return null;
    return clips[position] || null;
  }

  /** Play a gesture by key (`waving`, `gesture_waving`) or clip label (`waving_0`). */
  setAnimation(name: GestureMappingKeys | string) {
    const key = gestureKey(name);
    if (
      this.currentAction &&
      gestureKey(
        this.getAnimationLabel(
          this.normalizeAnimationName(this.currentAction.getClip().name),
        ).name,
      ) === key
    )
      return;
    if (this.waitAction) {
      // a one-shot gesture is playing: let it finish
      return;
    }
    const animationName = /_\d+$/.test(name.replace(/^gesture_/, ''))
      ? name.replace(/^gesture_/, '')
      : this.getNextGestureAnimationName(key);
    if (!animationName) return;
    const anim = this.getAnimation('gesture', animationName);
    if (!anim) return;

    if (!this.isLoopable(anim.name)) {
      this.resetAction(anim.action);
      anim.action.play();
      this.waitAction = true;
    }

    this.setWeight(anim.action, 1);

    if (this.currentAction) {
      this.currentAction.crossFadeTo(anim.action, 1, true);
    }
    this.currentAction = anim.action;
  }

  isLoopable(name: string) {
    return isLoopableGesture(gestureKey(name));
  }

  setWeight(action: THREE.AnimationAction, weight: number) {
    action.enabled = true;
    action.setEffectiveTimeScale(1);
    action.setEffectiveWeight(weight);
  }

  /** Public entry point: a gesture key, `gesture_` key or clip label. */
  playGesture(name: string): boolean {
    if (!this.hasGesture(name)) return false;
    this.setAnimation(name);
    return true;
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
  }

  playGestureDoNotKnow() {
    this.setAnimation('gesture_donotknow');
  }

  playGestureShowLeft() {
    this.setAnimation('gesture_show_left');
  }

  playGestureShowRight() {
    this.setAnimation('gesture_show_right');
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

  setAnimationEnabled(enabled: boolean) {
    this.animationEnabled = enabled;
  }

  setLookAtUser(enabled: boolean) {
    this.lookAtUser = enabled;
  }
}
