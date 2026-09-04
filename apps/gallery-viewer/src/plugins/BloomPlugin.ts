import * as THREE from 'three'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import type { ViewerPlugin, ViewerContext } from '../core/types'

/**
 * Bloom Plugin - 辉光后处理插件
 *
 * 使用 UnrealBloomPass 实现辉光效果
 */
export class BloomPlugin implements ViewerPlugin {
  name = 'Bloom'
  version = '1.0.0'
  dependencies = []

  private context: ViewerContext | null = null
  private composer: EffectComposer | null = null
  private bloomPass: UnrealBloomPass | null = null

  async install(context: ViewerContext): Promise<void> {
    this.context = context
    const config = context.config.effects?.bloom

    if (!config?.enabled) return

    // 创建 EffectComposer
    this.composer = new EffectComposer(context.renderer)

    // RenderPass - 基础渲染
    const renderPass = new RenderPass(context.scene, context.camera)
    this.composer.addPass(renderPass)

    // BloomPass - 辉光效果
    const strength = config.strength || 0.6
    const radius = config.radius || 0.5
    const threshold = config.threshold || 0.2

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      strength,
      radius,
      threshold
    )
    this.composer.addPass(this.bloomPass)

    // OutputPass - 输出到屏幕
    const outputPass = new OutputPass()
    this.composer.addPass(outputPass)

    // 告诉引擎使用 composer 渲染
    if (context.renderer) {
      // @ts-ignore - 访问内部方法
      context.renderer.setComposer = (c: EffectComposer) => {
        // 引擎会调用这个
      }
    }

    context.on('config:change', this.handleConfigChange)
    context.on('resize', this.handleResize)
  }

  uninstall(): void {
    if (this.composer) {
      this.composer.dispose?.()
    }

    this.context?.off('config:change', this.handleConfigChange)
    this.context?.off('resize', this.handleResize)

    this.context = null
    this.composer = null
    this.bloomPass = null
  }

  update(): void {
    // Bloom 在渲染时自动应用，不需要 update
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

  /**
   * 获取 composer 供引擎使用
   */
  getComposer(): EffectComposer | null {
    return this.composer
  }
}
