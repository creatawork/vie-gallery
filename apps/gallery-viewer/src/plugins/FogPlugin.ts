import * as THREE from 'three'
import type { ViewerPlugin, ViewerContext } from '../core/types'

/**
 * Fog Plugin - 雾效插件
 *
 * 使用 Three.js 的 FogExp2 实现指数雾效
 */
export class FogPlugin implements ViewerPlugin {
  name = 'Fog'
  version = '1.0.0'
  dependencies = []

  private context: ViewerContext | null = null
  private fog: THREE.FogExp2 | null = null

  async install(context: ViewerContext): Promise<void> {
    this.context = context
    const config = context.config.effects?.fog

    if (!config?.enabled) return

    const color = config.color || '#E7E3DA'
    const density = config.density || 0.0008

    this.fog = new THREE.FogExp2(color, density)
    context.scene.fog = this.fog

    context.on('config:change', this.handleConfigChange)
  }

  uninstall(): void {
    if (this.context) {
      this.context.scene.fog = null
    }

    this.context?.off('config:change', this.handleConfigChange)
    this.context = null
    this.fog = null
  }

  update(): void {
    // Fog 自动应用，不需要 update
  }

  private handleConfigChange = (data: any): void => {
    const config = data.effects?.fog

    if (!config?.enabled && this.fog) {
      // 禁用雾效
      if (this.context) {
        this.context.scene.fog = null
      }
      this.fog = null
      return
    }

    if (config?.enabled && !this.fog) {
      // 启用雾效
      const color = config.color || '#E7E3DA'
      const density = config.density || 0.0008
      this.fog = new THREE.FogExp2(color, density)
      if (this.context) {
        this.context.scene.fog = this.fog
      }
      return
    }

    // 更新雾效参数
    if (this.fog && config) {
      if (config.color) {
        this.fog.color.set(config.color)
      }
      if (config.density !== undefined) {
        this.fog.density = config.density
      }
    }
  }
}
