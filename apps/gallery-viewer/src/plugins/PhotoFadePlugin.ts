/**
 * 照片淡入淡出动画插件
 * 处理照片 Mesh 的首次加载淡入和切换时的淡入淡出效果
 */

import * as THREE from 'three'
import type { ViewerPlugin, ViewerContext, PhotoMesh } from '../core/types'

export class PhotoFadePlugin implements ViewerPlugin {
  name = 'PhotoFade'
  version = '1.0.0'
  
  private context!: ViewerContext
  
  // 跟踪每个照片的淡入状态
  private fadeStates = new Map<PhotoMesh, {
    startTime: number
    startOpacity: number
    targetOpacity: number
    duration: number
    isAnimating: boolean
  }>()
  
  async install(context: ViewerContext): Promise<void> {
    this.context = context
    
    // 监听照片加载事件
    context.on('photos:loaded', this.handlePhotosLoaded)
    
    // 监听照片切换事件（可选，如需要照片间淡入淡出）
    context.on('photo:focus', this.handlePhotoFocus)
  }
  
  uninstall(): void {
    this.context.off('photos:loaded', this.handlePhotosLoaded)
    this.context.off('photo:focus', this.handlePhotoFocus)
    this.fadeStates.clear()
  }
  
  update(delta: number, elapsed: number): void {
    // 更新所有正在淡入淡出的照片
    for (const [mesh, state] of this.fadeStates.entries()) {
      if (!state.isAnimating) continue
      
      const currentTime = elapsed
      const progress = Math.min(1, (currentTime - state.startTime) / state.duration)
      
      // 使用 ease-out cubic 缓动
      const eased = 1 - Math.pow(1 - progress, 3)
      
      // 计算当前透明度
      const currentOpacity = state.startOpacity + (state.targetOpacity - state.startOpacity) * eased
      
      // 更新材质透明度
      this.setMeshOpacity(mesh, currentOpacity)
      
      // 动画完成
      if (progress >= 1) {
        state.isAnimating = false
        this.fadeStates.delete(mesh)
      }
    }
  }
  
  /**
   * 处理照片首次加载
   */
  private handlePhotosLoaded = (photos: PhotoMesh[]): void => {
    // 为所有照片设置初始透明度为 0
    photos.forEach((mesh, index) => {
      // 初始设为完全透明
      this.setMeshOpacity(mesh, 0)
      
      // 交错淡入动画（每张照片延迟 50ms）
      setTimeout(() => {
        this.fadeIn(mesh, 0.5) // 500ms 淡入
      }, index * 50)
    })
  }
  
  /**
   * 处理照片聚焦事件
   */
  private handlePhotoFocus = (data: { photo: PhotoMesh }): void => {
    // 可选：当照片被聚焦时，其他照片略微变暗
    const focusedPhoto = data.photo
    
    this.context.photos.forEach(mesh => {
      if (mesh === focusedPhoto) {
        this.fadeIn(mesh, 0.3, 1.0) // 聚焦的照片保持 100% 不透明
      } else {
        this.fadeTo(mesh, 0.6, 0.3) // 其他照片淡化到 60%
      }
    })
  }
  
  /**
   * 淡入动画
   */
  public fadeIn(mesh: PhotoMesh, duration: number = 0.5, targetOpacity: number = 1.0): void {
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    const startOpacity = material.opacity || 0
    
    this.fadeStates.set(mesh, {
      startTime: performance.now() / 1000,
      startOpacity,
      targetOpacity,
      duration,
      isAnimating: true
    })
  }
  
  /**
   * 淡出动画
   */
  public fadeOut(mesh: PhotoMesh, duration: number = 0.3): void {
    this.fadeTo(mesh, 0, duration)
  }
  
  /**
   * 淡入淡出到指定透明度
   */
  public fadeTo(mesh: PhotoMesh, targetOpacity: number, duration: number = 0.3): void {
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    const startOpacity = material.opacity || 0
    
    this.fadeStates.set(mesh, {
      startTime: performance.now() / 1000,
      startOpacity,
      targetOpacity: Math.max(0, Math.min(1, targetOpacity)),
      duration,
      isAnimating: true
    })
  }
  
  /**
   * 设置 Mesh 的透明度
   */
  private setMeshOpacity(mesh: PhotoMesh, opacity: number): void {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    
    materials.forEach(material => {
      if (material instanceof THREE.MeshStandardMaterial || 
          material instanceof THREE.MeshBasicMaterial) {
        // 启用透明度
        material.transparent = true
        material.opacity = Math.max(0, Math.min(1, opacity))
        material.needsUpdate = true
      }
    })
  }
  
  /**
   * 立即设置所有照片的透明度（无动画）
   */
  public setAllOpacity(opacity: number): void {
    this.context.photos.forEach(mesh => {
      this.setMeshOpacity(mesh, opacity)
    })
  }
  
  /**
   * 重置所有照片到完全不透明
   */
  public resetAllOpacity(): void {
    this.setAllOpacity(1.0)
    this.fadeStates.clear()
  }
}
