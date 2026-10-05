import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import type { Pass } from 'three/examples/jsm/postprocessing/Pass.js'
import type { ViewerConfig } from './types'

type Composer = Pick<EffectComposer, 'addPass' | 'setPixelRatio' | 'setSize' | 'render' | 'dispose'>
export interface PostProcessingState {
  bloom: boolean; grading: boolean; vignette: boolean; width: number; height: number
  uniforms: { brightness: number; contrast: number; saturation: number; vignette: number }
}
const gradingShader = {
  uniforms: { tDiffuse: { value: null }, uBrightness: { value: 1 }, uContrast: { value: 1 }, uSaturation: { value: 1 },
    uVignetteStrength: { value: 0 }, uLegacy: { value: 0 }, uOffset: { value: 1 } },
  vertexShader: `varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse;
    uniform float uBrightness, uContrast, uSaturation, uVignetteStrength, uLegacy, uOffset;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 color = texel.rgb * uBrightness;
      color = (color - 0.5) * uContrast + 0.5;
      float gray = dot(color, mix(vec3(0.2126, 0.7152, 0.0722), vec3(0.299, 0.587, 0.114), uLegacy));
      color = mix(vec3(gray), color, uSaturation);
      float edge = smoothstep(0.2, 0.75, length(vUv - 0.5));
      float rf = length((vUv - 0.5) * uOffset) * uVignetteStrength;
      float legacyVignette = 1.0 / pow(rf * rf + 1.0, 2.0);
      color *= mix(1.0 - edge * uVignetteStrength, legacyVignette, uLegacy);
      gl_FragColor = vec4(max(color, vec3(0.0)), texel.a);
    }`
}

/** Owns the sole output chain; parameter changes keep GPU passes alive. */
export class PostProcessing {
  private composer: Composer | null = null
  private passes: Pass[] = []
  private bloom: UnrealBloomPass | null = null
  private grade: ShaderPass | null = null
  private signature = ''
  private size = { width: 1, height: 1, dpr: 1, scale: 1 }
  private state: PostProcessingState = { bloom: false, grading: false, vignette: false, width: 1, height: 1,
    uniforms: { brightness: 1, contrast: 1, saturation: 1, vignette: 0 } }
  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene, private camera: THREE.Camera,
    private createComposer: (renderer: THREE.WebGLRenderer) => Composer = renderer => new EffectComposer(renderer)) {}

  apply(config: ViewerConfig['effects']): void {
    const bloom = !!config.bloom?.enabled, grading = !!config.postGrade?.enabled, vignette = !!config.vignette?.enabled
    const signature = `${bloom}:${grading || vignette}`
    if (signature !== this.signature) {
      this.release()
      try {
        if (bloom || grading || vignette) {
          this.composer = this.createComposer(this.renderer)
          this.add(new RenderPass(this.scene, this.camera))
          if (bloom) { this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0, .5, .25); this.add(this.bloom) }
          if (grading || vignette) { this.grade = new ShaderPass(gradingShader); this.add(this.grade) }
          this.add(new OutputPass())
          this.resize(this.size.width, this.size.height, this.size.dpr, this.size.scale)
        }
        this.signature = signature
      } catch (error) { this.release(); throw error }
    }
    const uniforms = { brightness: grading ? config.postGrade?.brightness ?? 1 : 1,
      contrast: grading ? config.postGrade?.contrast ?? 1 : 1, saturation: grading ? config.postGrade?.saturation ?? 1 : 1,
      vignette: vignette ? config.vignette?.strength ?? .25 : 0 }
    if (this.bloom) {
      this.bloom.strength = config.bloom?.strength ?? .7
      this.bloom.radius = config.bloom?.radius ?? .5
      this.bloom.threshold = config.bloom?.threshold ?? .2
    }
    if (this.grade) {
      const u = this.grade.uniforms
      u.uBrightness.value = uniforms.brightness; u.uContrast.value = uniforms.contrast; u.uSaturation.value = uniforms.saturation
      u.uVignetteStrength.value = uniforms.vignette; u.uLegacy.value = config.vignette?.legacyCurve ? 1 : 0
      u.uOffset.value = config.vignette?.offset ?? 1
    }
    Object.assign(this.state, { bloom, grading, vignette, uniforms })
  }
  private add(pass: Pass): void { this.passes.push(pass); this.composer!.addPass(pass) }
  resize(width: number, height: number, dpr: number, resolutionScale: number): void {
    this.size = { width, height, dpr, scale: resolutionScale }
    this.composer?.setPixelRatio(dpr * resolutionScale)
    this.composer?.setSize(width, height)
    this.state.width = Math.floor(width * dpr * resolutionScale)
    this.state.height = Math.floor(height * dpr * resolutionScale)
  }
  render(delta: number): void { if (this.composer) this.composer.render(delta); else this.renderer.render(this.scene, this.camera) }
  getState(): PostProcessingState { return structuredClone(this.state) }
  private release(): void {
    for (const pass of this.passes) pass.dispose()
    this.composer?.dispose()
    this.passes = []; this.composer = null; this.bloom = null; this.grade = null; this.signature = ''
    Object.assign(this.state, { bloom: false, grading: false, vignette: false })
  }
  dispose(): void { this.release() }
}
