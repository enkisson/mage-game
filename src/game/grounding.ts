// Ambient occlusion: the soft darkening where one surface meets another. It is what makes a
// rock look as if it sits in the sand and not on it.
import * as THREE from 'three';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

/**
 * three.js's occlusion pass, kept from shading things that are light and not matter (glows,
 * sigils, wards, mist), and run at half resolution, which costs a quarter as much and shows
 * no difference on something this soft.
 */
export class GroundingPass extends GTAOPass {
  private hidden: THREE.Object3D[] = [];

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    super(scene, camera, 2, 2);
    // reach of the shading in metres, and how it is smoothed
    this.updateGtaoMaterial({ radius: 0.7, distanceExponent: 1.4, thickness: 1.4, scale: 1.25, samples: 8, distanceFallOff: 1 });
    this.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 8 });
    this.blendIntensity = 0.95;
  }

  override setSize(width: number, height: number) {
    super.setSize(Math.max(2, Math.round(width / 2)), Math.max(2, Math.round(height / 2)));
  }

  override overrideVisibility() {
    this.hidden.length = 0;
    this.scene.traverse((o) => {
      if (!o.visible) return;
      const mesh = o as THREE.Mesh;
      const mat = mesh.material as THREE.Material | undefined;
      const light = (o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite
        || o.userData.noShade === true
        || (mesh.isMesh && mat && !Array.isArray(mat) && (mat.blending === THREE.AdditiveBlending || mat.depthWrite === false || (mat as THREE.ShaderMaterial).isShaderMaterial));
      if (light) {
        o.visible = false;
        this.hidden.push(o);
      }
    });
  }

  override restoreVisibility() {
    for (const o of this.hidden) o.visible = true;
    this.hidden.length = 0;
  }
}
