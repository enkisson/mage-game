// Draws the world into its own anti-aliased picture, then hands a plain copy on to the
// effects that follow. Done this way, only the world itself is anti-aliased; before, every
// full-screen effect after it was paying for anti-aliasing it had no use for.
import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';

export class ScenePass extends Pass {
  private target: THREE.WebGLRenderTarget;
  private quad: FullScreenQuad;
  private copy: THREE.ShaderMaterial;
  private width = 1;
  private height = 1;

  constructor(private scene: THREE.Scene, private camera: THREE.Camera, samples: number) {
    super();
    this.needsSwap = false;
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples });
    this.copy = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms),
      vertexShader: CopyShader.vertexShader,
      fragmentShader: CopyShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.copy);
  }

  /** How many samples each pixel's edges are smoothed with. */
  setSamples(samples: number) {
    if (this.target.samples === samples) return;
    this.target.dispose();
    this.target = new THREE.WebGLRenderTarget(this.width, this.height, { type: THREE.HalfFloatType, samples });
  }

  override setSize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.target.setSize(width, height);
  }

  override render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) {
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    this.copy.uniforms.tDiffuse.value = this.target.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : read);
    this.quad.render(renderer);
  }
}
