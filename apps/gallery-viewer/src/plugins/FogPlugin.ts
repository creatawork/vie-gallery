import * as THREE from 'three'
import type { ViewerPlugin, ViewerContext } from '../core/types'
import { getEffectPreset } from '../presets/effectPresets'

/**
 * Fog Plugin - 雾效插件
 *
 * v2.0.0 优化:
 * - 支持效果预设 (fresh/warm/deep)
 * - 与光照系统颜色协调
 * - 与背景渐变和粒子系统协调
 * - 自动响应时间段变化
 * 
 * 使用 Three.js 的 FogExp2 实现指数雾效
 */
export class FogPlugin implements ViewerPlugin {
  name = 'Fog'
  version = '2.0.0'
  dependencies = []

  private context: ViewerContext | null = null
  private fog: THREE.FogExp2 | null = null

  async install(context: ViewerContext): Promise<void> {
    this.context = context
    const config = context.config.effects?.fog

    if (!config?.enabled) return

    // 从预设或配置获取雾效参数
    const preset = this.getPresetFromConfig(config)
    const color = config.color || preset.fog.color
    const density = config.density ?? preset.fog.density

    this.fog = new THREE.FogExp2(color, density)
    context.scene.fog = this.fog

    // 监听配置和光照变化
    context.on('config:update', this.handleConfigChange)
  }

  uninstall(): void {
    if (this.context) {
      this.context.scene.fog = null
    }

    this.context?.off('config:update', this.handleConfigChange)
    this.context = null
    this.fog = null
  }

  update(): void {
    // Fog 自动应用，不需要 update
  }

  /**
   * 从配置获取预设
   */
  private getPresetFromConfig(config: any): any {
    const presetName = config.preset || 'warm'
    return getEffectPreset(presetName)
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
      const preset = this.getPresetFromConfig(config)
      const color = config.color || preset.fog.color
      const density = config.density ?? preset.fog.density
      
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
