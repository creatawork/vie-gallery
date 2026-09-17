/**
 * 动态光照插件
 * 管理场景中的光源，支持：
 * 1. 时间段氛围预设（日出/正午/黄昏/夜晚）
 * 2. 照片主色调自动适应
 * 3. 平滑过渡动画
 */

import * as THREE from 'three'
import type { ViewerPlugin, ViewerContext } from '../core/types'
import { getLightingPreset, getAutoLightingPreset, interpolateLightingPresets, type LightingPreset } from '../presets/lightingPresets'
import { extractDominantColor, ColorAnalyzerCache, type DominantColorResult } from '../utils/colorAnalyzer'

export interface LightingPluginConfig {
  /** 时间段模式：auto | sunrise | noon | sunset | night */
  timeOfDay: 'auto' | 'sunrise' | 'noon' | 'sunset' | 'night'
  /** 是否根据照片主色调自动调整环境光 */
  autoColorAdapt: boolean
  /** 颜色适应过渡时间（秒） */
  transitionDuration: number
}

export class LightingPlugin implements ViewerPlugin {
  name = 'Lighting'
  version = '1.0.0'
  
  private context!: ViewerContext
  
  // 光源对象
  private ambientLight: THREE.AmbientLight | null = null
  private directionalLight: THREE.DirectionalLight | null = null
  private fillLight: THREE.PointLight | null = null
  
  // 当前应用的预设和目标预设
  private currentPreset: LightingPreset | null = null
  private targetPreset: LightingPreset | null = null
  
  // 过渡动画状态
  private isTransitioning = false
  private transitionStartTime = 0
  private transitionDuration = 2.0 // 默认 2 秒
  private fromPreset: LightingPreset | null = null
  
  // 颜色分析缓存
  private colorCache = new ColorAnalyzerCache(50)
  
  // 配置
  private config: LightingPluginConfig = {
    timeOfDay: 'auto',
    autoColorAdapt: true,
    transitionDuration: 2.0
  }
  
  async install(context: ViewerContext): Promise<void> {
    this.context = context
    
    // 从 ViewerConfig 读取配置（如果有）
    const viewerConfig = context.config as any
    if (viewerConfig.lighting) {
      this.config = { ...this.config, ...viewerConfig.lighting }
    }
    
    this.transitionDuration = this.config.transitionDuration
    
    // 低端设备禁用自动颜色适应
    const quality = context.getQuality()
    if (quality === 'low') {
      this.config.autoColorAdapt = false
      console.info('[LightingPlugin] Auto color adaptation disabled on low-end device')
    }
    
    // 创建光源
    this.createLights()
    
    // 应用初始预设
    const initialPreset = this.config.timeOfDay === 'auto'
      ? getAutoLightingPreset()
      : getLightingPreset(this.config.timeOfDay)
    
    this.applyPreset(initialPreset, false) // 无过渡
    
    // 监听照片切换事件
    if (this.config.autoColorAdapt) {
      context.on('photo:click', this.handlePhotoChange)
      context.on('photo:focus', this.handlePhotoChange)
    }
    
    // 监听配置变化
    context.on('config:change', this.handleConfigChange)
  }
  
  uninstall(): void {
    // 移除光源
    if (this.ambientLight) {
      this.context.removeFromScene(this.ambientLight)
      this.ambientLight = null
    }
    
    if (this.directionalLight) {
      this.context.removeFromScene(this.directionalLight)
      this.directionalLight = null
    }
    
    if (this.fillLight) {
      this.context.removeFromScene(this.fillLight)
      this.fillLight = null
    }
    
    // 移除事件监听
    this.context.off('photo:click', this.handlePhotoChange)
    this.context.off('photo:focus', this.handlePhotoChange)
    this.context.off('config:change', this.handleConfigChange)
    
    // 清空缓存
    this.colorCache.clear()
  }
  
  update(delta: number, elapsed: number): void {
    // 如果正在过渡，更新插值
    if (this.isTransitioning && this.fromPreset && this.targetPreset) {
      const progress = Math.min(1.0, (elapsed - this.transitionStartTime) / this.transitionDuration)
      
      // 使用缓动函数（ease-out）
      const t = this.easeOutCubic(progress)
      
      // 插值预设
      const interpolated = interpolateLightingPresets(this.fromPreset, this.targetPreset, t)
      this.updateLights(interpolated)
      
      // 完成过渡
      if (progress >= 1.0) {
        this.isTransitioning = false
        this.currentPreset = this.targetPreset
        this.fromPreset = null
        this.context.emit('transition:end')
      }
    }
  }
  
  /**
   * 创建场景光源
   */
  private createLights(): void {
    // 环境光（全局柔和照明）
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
    this.context.addToScene(this.ambientLight)
    
    // 主方向光（模拟太阳/月亮）
    this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    this.directionalLight.position.set(100, 100, 100)
    this.context.addToScene(this.directionalLight)
    
    // 辅助点光源（补光）
    this.fillLight = new THREE.PointLight(0xffffff, 0.3, 2000)
    this.fillLight.position.set(-50, 50, -50)
    this.context.addToScene(this.fillLight)
  }
  
  /**
   * 应用光照预设
   */
  private applyPreset(preset: LightingPreset, animate = true): void {
    if (animate && this.currentPreset) {
      // 启动过渡动画
      this.fromPreset = this.currentPreset
      this.targetPreset = preset
      this.isTransitioning = true
      this.transitionStartTime = performance.now() / 1000 // 转换为秒
      this.context.emit('transition:start')
    } else {
      // 立即应用
      this.currentPreset = preset
      this.updateLights(preset)
    }
  }
  
  /**
   * 更新光源参数
   */
  private updateLights(preset: LightingPreset): void {
    if (this.ambientLight) {
      const ambientColor = typeof preset.ambientLight.color === 'number'
        ? preset.ambientLight.color
        : parseInt(preset.ambientLight.color.replace('#', ''), 16)
      
      this.ambientLight.color.setHex(ambientColor)
      this.ambientLight.intensity = preset.ambientLight.intensity
    }
    
    if (this.directionalLight) {
      const dirColor = typeof preset.directionalLight.color === 'number'
        ? preset.directionalLight.color
        : parseInt(preset.directionalLight.color.replace('#', ''), 16)
      
      this.directionalLight.color.setHex(dirColor)
      this.directionalLight.intensity = preset.directionalLight.intensity
      this.directionalLight.position.set(
        preset.directionalLight.position.x,
        preset.directionalLight.position.y,
        preset.directionalLight.position.z
      )
    }
    
    if (this.fillLight && preset.fillLight) {
      const fillColor = typeof preset.fillLight.color === 'number'
        ? preset.fillLight.color
        : parseInt(preset.fillLight.color.replace('#', ''), 16)
      
      this.fillLight.color.setHex(fillColor)
      this.fillLight.intensity = preset.fillLight.intensity
      this.fillLight.position.set(
        preset.fillLight.position.x,
        preset.fillLight.position.y,
        preset.fillLight.position.z
      )
    }
  }
  
  /**
   * 处理照片切换事件
   */
  private handlePhotoChange = async (data: any): Promise<void> => {
    if (!this.config.autoColorAdapt) return
    
    try {
      const photo = data?.photo
      if (!photo || !photo.userData) return
      
      // 优先使用中等尺寸图片进行分析（更快）
      const imageUrl = photo.userData.mediumUrl || photo.userData.url
      if (!imageUrl) return
      
      // 检查缓存
      let colorResult: DominantColorResult
      if (this.colorCache.has(imageUrl)) {
        colorResult = this.colorCache.get(imageUrl)!
      } else {
        // 分析照片颜色
        colorResult = await extractDominantColor(imageUrl, {
          sampleSize: 80, // 较小的采样尺寸以提升速度
          clusters: 5,
          maxIterations: 8
        })
        
        // 缓存结果
        this.colorCache.set(imageUrl, colorResult)
      }
      
      // 创建基于照片颜色的自定义预设
      const customPreset = this.createColorAdaptedPreset(colorResult)
      
      // 平滑过渡到新预设
      this.applyPreset(customPreset, true)
      
    } catch (error) {
      console.warn('Failed to analyze photo color:', error)
    }
  }
  
  /**
   * 基于照片颜色创建自定义光照预设
   */
  private createColorAdaptedPreset(colorResult: DominantColorResult): LightingPreset {
    const { ambientColor, temperature } = colorResult
    
    // 将 RGB 转换为 hex
    const ambientHex = (ambientColor.r << 16) | (ambientColor.g << 8) | ambientColor.b
    
    // 根据色温调整其他光源
    let dirLightColor = ambientHex
    let fillLightColor = ambientHex
    
    if (temperature === 'warm') {
      // 暖色调：方向光更偏金色，补光偏橙
      dirLightColor = this.adjustColorTemperature(ambientHex, 1.1, 0.9)
      fillLightColor = this.adjustColorTemperature(ambientHex, 1.05, 0.95)
    } else if (temperature === 'cool') {
      // 冷色调：方向光更偏蓝，补光也偏蓝
      dirLightColor = this.adjustColorTemperature(ambientHex, 0.9, 1.1)
      fillLightColor = this.adjustColorTemperature(ambientHex, 0.95, 1.05)
    }
    
    return {
      name: 'photo-adapted',
      description: 'Adapted to photo colors',
      
      ambientLight: {
        color: ambientHex,
        intensity: 0.5
      },
      
      directionalLight: {
        color: dirLightColor,
        intensity: 0.7,
        position: { x: 100, y: 100, z: 100 }
      },
      
      fillLight: {
        color: fillLightColor,
        intensity: 0.25,
        position: { x: -50, y: 50, z: -50 }
      }
    }
  }
  
  /**
   * 调整颜色色温
   */
  private adjustColorTemperature(hex: number, rScale: number, bScale: number): number {
    const r = Math.min(255, Math.round(((hex >> 16) & 0xff) * rScale))
    const g = (hex >> 8) & 0xff
    const b = Math.min(255, Math.round((hex & 0xff) * bScale))
    
    return (r << 16) | (g << 8) | b
  }
  
  /**
   * 处理配置变化
   */
  private handleConfigChange = (newConfig: any): void => {
    if (newConfig.lighting) {
      const oldConfig = this.config
      this.config = { ...this.config, ...newConfig.lighting }
      
      // 如果时间段模式改变，应用新预设
      if (this.config.timeOfDay !== oldConfig.timeOfDay) {
        const preset = this.config.timeOfDay === 'auto'
          ? getAutoLightingPreset()
          : getLightingPreset(this.config.timeOfDay)
        
        this.applyPreset(preset, true)
      }
      
      // 如果禁用了自动颜色适应，恢复时间段预设
      if (this.config.autoColorAdapt !== oldConfig.autoColorAdapt) {
        if (!this.config.autoColorAdapt) {
          const preset = this.config.timeOfDay === 'auto'
            ? getAutoLightingPreset()
            : getLightingPreset(this.config.timeOfDay)
          
          this.applyPreset(preset, true)
        }
      }
    }
  }
  
  /**
   * 缓动函数：ease-out cubic
   */
  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3)
  }
}
