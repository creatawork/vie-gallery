import * as THREE from 'three'
import type { ViewerPlugin, ViewerContext } from '../core/types'

/**
 * 渐变背景插件
 */
export class GradientBackgroundPlugin implements ViewerPlugin {
  name = 'GradientBackground'
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

    context.on('config:change', (data: any) => {
      if (data.background?.type === 'gradient' && data.background.gradient) {
        this.updateColors(data.background.gradient.colors, data.background.gradient.direction)
      }
    })
  }

  uninstall(): void {
    if (this.context && this.mesh) {
      this.context.removeFromScene(this.mesh)
    }

    if (this.mesh) {
      this.mesh.geometry.dispose()
      if (Array.isArray(this.mesh.material)) {
        this.mesh.material.forEach(m => m.dispose())
      } else {
        this.mesh.material.dispose()
      }
    }

    this.context = null
    this.mesh = null
  }

  private createGradientMesh(colors: string[], direction: string = 'vertical'): void {
    if (!this.context) return

    const geometry = new THREE.PlaneGeometry(8000, 8000)

    const uniforms = {
      uColor1: { value: new THREE.Color(colors[0] || '#F7F5F1') },
      uColor2: { value: new THREE.Color(colors[1] || '#E7E3DA') },
      uDirection: { value: direction === 'horizontal' ? 1.0 : (direction === 'radial' ? 2.0 : 0.0) }
    }

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        uniform float uDirection;
        varying vec2 vUv;

        void main() {
          float t = vUv.y;
          if (uDirection > 1.5) {
            // radial
            float dist = distance(vUv, vec2(0.5));
            t = clamp(dist * 1.4, 0.0, 1.0);
          } else if (uDirection > 0.5) {
            // horizontal
            t = vUv.x;
          }
          vec3 color = mix(uColor1, uColor2, t);
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      depthWrite: false,
      depthTest: false
    })

    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.position.z = -2000
    this.mesh.renderOrder = -100
    this.context.addToScene(this.mesh)
  }

  private updateColors(colors: string[], direction?: string): void {
    if (!this.mesh) {
      this.createGradientMesh(colors, direction)
      return
    }

    const material = this.mesh.material as THREE.ShaderMaterial
    if (material && material.uniforms) {
      if (colors[0]) material.uniforms.uColor1.value.set(colors[0])
      if (colors[1]) material.uniforms.uColor2.value.set(colors[1])
      if (direction) {
        material.uniforms.uDirection.value = direction === 'horizontal' ? 1.0 : (direction === 'radial' ? 2.0 : 0.0)
      }
    }
  }
}
