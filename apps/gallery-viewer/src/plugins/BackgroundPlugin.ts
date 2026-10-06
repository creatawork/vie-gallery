import * as THREE from 'three'
import type { ViewerPlugin, ViewerContext } from '../core/types'
export class BackgroundPlugin implements ViewerPlugin {
  name = 'Background'
  version = '1.0.0'
  private context: ViewerContext | null = null
  private texture: THREE.Texture | null = null
  private request = 0
  private signature = ''
  install(context: ViewerContext): void { this.context = context; this.updateBackground(); context.on('config:update', this.updateBackground) }
  uninstall(): void {
    this.context?.off('config:update', this.updateBackground)
    this.request++
    if (this.context) this.context.scene.background = null
    this.texture?.dispose(); this.texture = null; this.context = null; this.signature = ''
  }
  private updateBackground = (): void => {
    if (!this.context) return
    const config = this.context.config.background
    const signature = JSON.stringify(config)
    if (signature === this.signature) return
    this.signature = signature
    // Every applied state change invalidates any in-flight image load.
    const request = ++this.request
    if (!config || config.mode === 'solid' || config.mode === 'none') {
      this.texture?.dispose(); this.texture = null
      this.context.scene.background = new THREE.Color(config?.color ?? '#0f172a'); return
    }
    if (config.mode === 'image' && config.image?.url) {
      new THREE.TextureLoader().load(config.image.url, texture => {
        if (!this.context || request !== this.request || this.signature !== signature) { texture.dispose(); return }
        this.texture?.dispose(); this.texture = texture
        // Equirectangular backgrounds rotate with the camera; undeclared custom images stay flat.
        texture.mapping = config.image?.projection === 'equirectangular'
          ? THREE.EquirectangularReflectionMapping
          : THREE.UVMapping
        texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true
        this.context.scene.background = texture
      }, undefined, () => {
        if (!this.context || request !== this.request || this.signature !== signature) return
        this.texture?.dispose(); this.texture = null
        this.context.scene.background = new THREE.Color(config.color ?? '#0f172a')
        // Clear the signature so an identical config can retry the failed URL.
        this.signature = ''
      })
      return
    }
    const size = 64, data = new Uint8Array(size * size * 4)
    const first = new THREE.Color(config.color).convertLinearToSRGB()
    const second = new THREE.Color(config.secondaryColor ?? config.color).convertLinearToSRGB()
    const angle = (config.angle ?? 135) * Math.PI / 180
    const dx = Math.sin(angle), dy = Math.cos(angle), range = Math.abs(dx) + Math.abs(dy)
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const t = THREE.MathUtils.clamp(.5 + ((x / (size - 1) - .5) * dx + (y / (size - 1) - .5) * dy) / Math.max(range, .001), 0, 1)
      const color = first.clone().lerp(second, t), offset = (y * size + x) * 4
      data[offset] = Math.round(color.r * 255); data[offset + 1] = Math.round(color.g * 255); data[offset + 2] = Math.round(color.b * 255); data[offset + 3] = 255
    }
    if (this.texture instanceof THREE.DataTexture && this.texture.image.data) this.texture.image.data.set(data)
    else {
      // An image texture left over from the previous state must not be silently overwritten.
      this.texture?.dispose()
      this.texture = new THREE.DataTexture(data, size, size)
    }
    this.texture.colorSpace = THREE.SRGBColorSpace; this.texture.needsUpdate = true
    this.context.scene.background = this.texture
  }
}
