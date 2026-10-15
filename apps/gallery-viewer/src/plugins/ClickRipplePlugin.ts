import * as THREE from 'three'
import type { ViewerPlugin, ViewerContext } from '../core/types'

interface RippleData {
  mesh: THREE.Mesh
  material: THREE.MeshBasicMaterial
  startTime: number
  duration: number
}

/**
 * 点击涟漪特效插件
 */
export class ClickRipplePlugin implements ViewerPlugin {
  name = 'ClickRipple'
  version = '1.0.0'

  private context: ViewerContext | null = null
  private ripples: RippleData[] = []
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()

  install(context: ViewerContext): void {
    this.context = context

    if (!context.config.interaction.clickRipple) {
      return
    }

    // 监听点击事件
    context.renderer.domElement.addEventListener('click', this.handleClick)
  }

  uninstall(): void {
    if (this.context) {
      this.context.renderer.domElement.removeEventListener('click', this.handleClick)

      // 清理所有涟漪
      this.ripples.forEach(rippleData => {
        this.context?.removeFromScene(rippleData.mesh)
        rippleData.mesh.geometry.dispose()
        rippleData.material.dispose()
      })
      this.ripples = []
      this.context = null
    }
  }

  update(delta: number, elapsed: number): void {
    if (this.context?.reducedMotion()) {
      for (const ripple of this.ripples) {
        this.context.removeFromScene(ripple.mesh)
        ripple.mesh.geometry.dispose(); ripple.material.dispose()
      }
      this.ripples = []
      return
    }
    // 更新所有涟漪动画
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const rippleData = this.ripples[i]
      const progress = Math.max(0, (elapsed - rippleData.startTime) / rippleData.duration)

      if (progress >= 1) {
        // 动画结束，清理
        this.context?.removeFromScene(rippleData.mesh)
        rippleData.mesh.geometry.dispose()
        rippleData.material.dispose()
        this.ripples.splice(i, 1)
      } else {
        // 缓动函数：power2.out
        const eased = 1 - Math.pow(1 - progress, 2)

        // 扩散
        const scale = 1 + eased * 7
        rippleData.mesh.scale.set(scale, scale, scale)

        // 淡出
        rippleData.material.opacity = 0.8 * (1 - eased)
      }
    }
  }

  /**
   * 处理点击事件
   */
  private handleClick = (event: MouseEvent): void => {
    if (!this.context || this.context.reducedMotion()) return

    // 计算归一化设备坐标
    const rect = this.context.renderer.domElement.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

    // 射线检测
    this.raycaster.setFromCamera(this.pointer, this.context.camera)
    const intersects = this.raycaster.intersectObjects(this.context.photos.filter(photo => photo.visible), false)

    if (intersects.length > 0) {
      const point = intersects[0].point
      this.createRipple(point)
    }
  }

  /**
   * 创建涟漪
   */
  private createRipple(position: THREE.Vector3): void {
    if (!this.context) return

    const geometry = new THREE.RingGeometry(5, 10, 32)
    const material = new THREE.MeshBasicMaterial({
      color: '#b6c7bf',
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false
    })

    const ripple = new THREE.Mesh(geometry, material)
    ripple.position.copy(position)
    ripple.position.addScaledVector(this.context.camera.position.clone().sub(position).normalize(), 2)

    // 让涟漪面向相机
    ripple.lookAt(this.context.camera.position)

    this.context.addToScene(ripple)

    // 记录涟漪数据用于动画更新
    this.ripples.push({
      mesh: ripple,
      material: material,
      startTime: this.context.now(),
      duration: 0.8
    })
  }
}
