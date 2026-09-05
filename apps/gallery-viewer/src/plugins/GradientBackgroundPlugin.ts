import * as THREE from 'three'
import type { ViewerPlugin, ViewerContext } from '../core/types'

/**
 * GradientBackground Plugin - 生产级艺术流体渐变背景插件
 * 支持动态流光着色器、多向渐变与自然暗角 (Vignette)
 */
export class GradientBackgroundPlugin implements ViewerPlugin {
  name = 'GradientBackground'
  version = '2.0.0'

  private context: ViewerContext | null = null
  private mesh: THREE.Mesh | null = null
  private material: THREE.ShaderMaterial | null = null

  install(context: ViewerContext): void {
    this.context = context

    const bgConfig = context.config.background
    if (bgConfig.type !== 'gradient' || !bgConfig.gradient) {
      return
    }

    this.createGradientMesh(bgConfig.gradient.colors, bgConfig.gradient.direction)

    context.on('theme:update', (colors) => {
      this.updateColors([colors.background, colors.fog])
    })

    // 只监听 config:update 事件，避免重复触发
    context.on('config:update', (data: any) => {
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
      if (this.material) {
        this.material.dispose()
      }
    }

    this.context = null
    this.mesh = null
    this.material = null
  }

  update(_delta: number, elapsed: number): void {
    if (this.material && this.material.uniforms?.uTime) {
      this.material.uniforms.uTime.value = elapsed
    }
  }

  private createGradientMesh(colors: string[], direction: string = 'vertical'): void {
    if (!this.context) return

    const geometry = new THREE.PlaneGeometry(9000, 9000)

    const uniforms = {
      uColor1: { value: new THREE.Color(colors[0] || '#0f172a') },
      uColor2: { value: new THREE.Color(colors[1] || '#1e293b') },
      uColor3: { value: new THREE.Color(colors[2] || colors[0] || '#0f172a') },
      uDirection: { value: direction === 'horizontal' ? 1.0 : (direction === 'radial' ? 2.0 : 0.0) },
      uTime: { value: 0 }
    }

    this.material = new THREE.ShaderMaterial({
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
        uniform vec3 uColor3;
        uniform float uDirection;
        uniform float uTime;
        varying vec2 vUv;

        void main() {
          vec2 p = vUv - vec2(0.5);
          float dist = length(p);

          // 微妙的流体波浪光晕
          float wave = sin(vUv.x * 3.0 + uTime * 0.25) * cos(vUv.y * 3.0 + uTime * 0.2) * 0.08;

          float t = vUv.y + wave;
          if (uDirection > 1.5) {
            // 径向聚焦渐变
            t = clamp(dist * 1.5 + wave, 0.0, 1.0);
          } else if (uDirection > 0.5) {
            // 水平渐变
            t = vUv.x + wave;
          }

          vec3 baseColor = mix(uColor1, uColor2, clamp(t, 0.0, 1.0));
          // 边缘暗角 Vignette
          float vignette = smoothstep(0.9, 0.2, dist);
          baseColor *= (0.7 + 0.3 * vignette);

          gl_FragColor = vec4(baseColor, 1.0);
        }
      `,
      depthWrite: false,
      depthTest: false
    })

    this.mesh = new THREE.Mesh(geometry, this.material)
    this.mesh.position.z = -2500
    this.mesh.renderOrder = -100
    this.context.addToScene(this.mesh)
  }

  private updateColors(colors: string[], direction?: string): void {
    if (!this.mesh || !this.material) {
      this.createGradientMesh(colors, direction)
      return
    }

    if (this.material.uniforms) {
      if (colors[0]) this.material.uniforms.uColor1.value.set(colors[0])
      if (colors[1]) this.material.uniforms.uColor2.value.set(colors[1])
      if (colors[2]) this.material.uniforms.uColor3.value.set(colors[2])
      if (direction) {
        this.material.uniforms.uDirection.value = direction === 'horizontal' ? 1.0 : (direction === 'radial' ? 2.0 : 0.0)
      }
    }
  }
}
