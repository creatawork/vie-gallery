import * as THREE from 'three'
import type { ViewerPlugin, ViewerContext } from '../core/types'

/**
 * 渐变背景插件
 */
export class GradientBackgroundPlugin implements ViewerPlugin {
  name = 'gradient-background'
  version = '1.0.0'

  private context: ViewerContext | null = null
  private mesh: THREE.Mesh | null = null

  install(context: ViewerContext): void {
    this.context = context

    const bgConfig = context.config.background
    if (bgConfig.type !== 'gradient' || !bgConfig.gradient) {
      return
    }

    this.createGradientMesh(bgConfig.gradient.colors, bgConfig.gradient.direction)

    // 监听主题更新
    context.on('theme:update', (colors) => {
      this.updateColors([colors.background, colors.fog])
    })
  }

  uninstall(): void {
    if (this.mesh && this.context) {
      this.context.removeFromScene(this.mesh)
      this.mesh.geometry.dispose()
      ;(this.mesh.material as THREE.Material).dispose()
      this.mesh = null
    }
  }

  /**
   * 创建渐变网格
   */
  private createGradientMesh(colors: string[], direction: string): void {
    if (!this.context) return

    const geometry = new THREE.PlaneGeometry(5000, 5000)

    // 创建渐变着色器
    const material = new THREE.ShaderMaterial({
      uniforms: {
        color1: { value: new THREE.Color(colors[0]) },
        color2: { value: new THREE.Color(colors[1] || colors[0]) }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: this.getFragmentShader(direction),
      side: THREE.DoubleSide,
      depthWrite: false
    })

    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.position.z = -2000
    this.mesh.renderOrder = -1

    this.context.addToScene(this.mesh)
  }

  /**
   * 获取片段着色器
   */
  private getFragmentShader(direction: string): string {
    const baseShader = `
      uniform vec3 color1;
      uniform vec3 color2;
      varying vec2 vUv;

      void main() {
    `

    let gradientLogic = ''
    switch (direction) {
      case 'horizontal':
        gradientLogic = 'float mixRatio = vUv.x;'
        break
      case 'radial':
        gradientLogic = 'float mixRatio = length(vUv - 0.5) * 2.0;'
        break
      case 'vertical':
      default:
        gradientLogic = 'float mixRatio = vUv.y;'
    }

    return `${baseShader}
        ${gradientLogic}
        vec3 color = mix(color1, color2, mixRatio);
        gl_FragColor = vec4(color, 1.0);
      }
    `
  }

  /**
   * 更新颜色
   */
  private updateColors(colors: string[]): void {
    if (!this.mesh) return

    const material = this.mesh.material as THREE.ShaderMaterial
    material.uniforms.color1.value.set(colors[0])
    material.uniforms.color2.value.set(colors[1] || colors[0])
  }
}
