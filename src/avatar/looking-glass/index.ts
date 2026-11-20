import type * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';

export class LookingGlassAdapter {
  constructor() {}

  async init(renderer: THREE.WebGLRenderer) {
    const lookingglass = await import('@lookingglass/webxr');

    const { LookingGlassWebXRPolyfill } = lookingglass;
    // the polyfill installs itself on construction
    new LookingGlassWebXRPolyfill({
      tileHeight: 512,
      numViews: 45,
      targetY: 0,
      targetZ: 0,
      targetDiam: 3,
      fovy: (14 * Math.PI) / 180,
    });

    document.body.appendChild(VRButton.createButton(renderer));
  }

  async destroy() {}
}
