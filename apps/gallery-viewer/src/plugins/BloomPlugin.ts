import * as THREE from 'three'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import type { ViewerPlugin, ViewerContext } from '../core/types'

/**
 * Cinematic Grading Shader (电影暗角与色彩增强着色器)
 */
const CinematicColorGradingShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignetteDarkness: { value: 0.8 },
    uVignetteOffset: { value: 1.1 },
    uContrast: { value: 1.05 },
    uSaturation: { value: 1.08 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uVignetteDarkness;
    uniform float uVignetteOffset;
    uniform float uContrast;
    uniform float uSaturation;
    varying vec2 vUv;

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 color = texel.rgb;

      // 对比度 Contrast
      color = (color - 0.5) * uContrast + 0.5;

      // 饱和度 Saturation
      float gray = dot(color, vec3(0.299, 0.587, 0.114));
      color = mix(vec3(gray), color, uSaturation);

      // 电影暗角 Vignette
      vec2 coord = (vUv - 0.5) * (vec2(uVignetteOffset));
      float rf = sqrt(dot(coord, coord)) * uVignetteDarkness;
      float rf2_1 = rf * rf + 1.0;
      float e = 1.0 / (rf2_1 * rf2_1);
      color *= e;

      gl_FragColor = vec4(color, texel.a);
    }
  `
}

/**
 * Bloom Plugin - 生产级电影后处理与辉光滤镜插件
 *
 * 结合 UnrealBloomPass 与 Cinematic Color Grading Shader，
 * 带来柔和的高光散射与影院级画面暗角。
 */
export class BloomPlugin implements ViewerPlugin {
  name = 'Bloom'
  version = '2.0.0'
  dependencies = []

  private context: ViewerContext | null = null
  private composer: EffectComposer | null = null
  private bloomPass: UnrealBloomPass | null = null
  private gradingPass: ShaderPass | null = null

  async install(context: ViewerContext): Promise<void> {
    this.context = context
    const config = context.config.effects?.bloom

    if (!config?.enabled) return

    // 1. 创建 EffectComposer
    this.composer = new EffectComposer(context.renderer)

    // 2. RenderPass - 基础场景渲染
    const renderPass = new RenderPass(context.scene, context.camera)
    this.composer.addPass(renderPass)

    // 3. BloomPass - 柔和辉光
    const strength = config.strength ?? 0.65
    const radius = config.radius ?? 0.5
    const threshold = config.threshold ?? 0.18

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      strength,
      radius,
      threshold
    )
    this.composer.addPass(this.bloomPass)

    // 4. Cinematic Grading Pass - 电影暗角与胶片色彩增强
    this.gradingPass = new ShaderPass(CinematicColorGradingShader)
    this.composer.addPass(this.gradingPass)

    // 5. OutputPass - 伽马校正与高动态色彩映射输出
    const outputPass = new OutputPass()
    this.composer.addPass(outputPass)

    // 只监听 config:update 事件，避免重复触发
    context.on('config:update', this.handleConfigChange)
    context.on('resize', this.handleResize)
  }

  uninstall(): void {
    if (this.composer) {
      this.composer.dispose?.()
    }

    this.context?.off('config:update', this.handleConfigChange)
    this.context?.off('resize', this.handleResize)

    this.context = null
    this.composer = null
    this.bloomPass = null
    this.gradingPass = null
  }

  update(): void {
    // 后处理在渲染阶段自动调用
  }

  onResize(width: number, height: number): void {
    if (this.composer) {
      this.composer.setSize(width, height)
    }
    if (this.bloomPass) {
      this.bloomPass.resolution.set(width, height)
    }
  }

  private handleConfigChange = (data: any): void => {
    const config = data.effects?.bloom
    if (!config) return

    if (this.bloomPass) {
      if (config.strength !== undefined) {
        this.bloomPass.strength = config.strength
      }
      if (config.radius !== undefined) {
        this.bloomPass.radius = config.radius
      }
      if (config.threshold !== undefined) {
        this.bloomPass.threshold = config.threshold
      }
    }
  }

  private handleResize = (data: any): void => {
    this.onResize(data.width, data.height)
  }

  getComposer(): EffectComposer | null {
    return this.composer
  }
}
