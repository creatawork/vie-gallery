import * as THREE from 'three'
import { PHOTO_EFFECTS, resolvePhotoEffect } from '@vie/gallery-contracts'
import type { PhotoMesh, ViewerContext, ViewerPlugin } from '../core/types'
import { photoSurfaceUniforms, photoSurfaceVertex, photoSurfaceFragment } from '../lib/photoSurfaceShader'

interface Surface {
  material: THREE.MeshStandardMaterial
  compile: THREE.MeshStandardMaterial['onBeforeCompile']
  cacheKey: THREE.MeshStandardMaterial['customProgramCacheKey']
  uniforms: Record<string, THREE.IUniform>
}

/** A shared shader program treats both sides of the photograph, including the emissive image. */
export class PhotoSurfacePlugin implements ViewerPlugin {
  name = 'PhotoSurface'
  version = '1.0.0'
  private context: ViewerContext | null = null
  private surfaces = new Map<PhotoMesh, Surface>()
  private time = 0
  private pointer = new THREE.Vector2(2, 2)
  private raycaster = new THREE.Raycaster()
  private pointerDirty = false
  private hovered: PhotoMesh | null = null
  private suspended = false

  install(context: ViewerContext): void {
    this.context = context
    this.time = 0; this.suspended = false
    context.on('photos:loaded', this.sync)
    context.on('config:update', this.sync)
    context.on('stage:suspend', this.suspend)
    context.renderer.domElement.addEventListener('pointermove', this.move, { passive: true })
    context.renderer.domElement.addEventListener('pointerleave', this.leave)
    this.sync()
  }
  private suspend = (value: boolean) => { this.suspended = value; if (value) this.leave() }
  private move = (event: PointerEvent) => {
    if (!this.context || this.suspended || this.context.reducedMotion()) return
    const rect = this.context.renderer.domElement.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1)
    this.pointerDirty = true
  }
  private leave = () => { this.pointer.set(2, 2); this.hovered = null; this.pointerDirty = false }
  private restore(surface: Surface) {
    surface.material.onBeforeCompile = surface.compile
    surface.material.customProgramCacheKey = surface.cacheKey
    surface.material.needsUpdate = true
  }
  private sync = () => {
    if (!this.context) return
    const keep = new Set(this.context.photos)
    for (const [mesh, surface] of this.surfaces) if (!keep.has(mesh)) { this.restore(surface); this.surfaces.delete(mesh) }
    for (const mesh of this.context.photos) {
      if (this.surfaces.has(mesh) || !(mesh.material instanceof THREE.MeshStandardMaterial)) continue
      const material = mesh.material
      const geometry = mesh.geometry as THREE.PlaneGeometry
      const surface: Surface = { material, compile: material.onBeforeCompile, cacheKey: material.customProgramCacheKey, uniforms: {
        uVieStyle: { value: 0 }, uVieAmount: { value: 0 }, uVieTime: { value: 0 }, uVieMotion: { value: 1 },
        uVieSeed: { value: mesh.userData.index * 1.37 }, uVieAspect: { value: (geometry.parameters?.width ?? 80) / (geometry.parameters?.height ?? 60) },
        uVieHover: { value: 0 }, uViePointer: { value: new THREE.Vector2(.5, .5) }
      } }
      material.onBeforeCompile = (shader, renderer) => {
        surface.compile.call(material, shader, renderer)
        Object.assign(shader.uniforms, surface.uniforms)
        shader.vertexShader = photoSurfaceUniforms + shader.vertexShader
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + photoSurfaceVertex)
        shader.fragmentShader = photoSurfaceUniforms + photoSurfaceFragment + shader.fragmentShader
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
          #ifdef USE_MAP
            diffuseColor *= viePhoto(map, vMapUv);
          #endif`)
        shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
          #ifdef USE_EMISSIVEMAP
            totalEmissiveRadiance *= viePhoto(emissiveMap, vEmissiveMapUv).rgb;
          #endif`)
      }
      // Uniform changes never compile another variant or allocate another texture.
      material.customProgramCacheKey = () => 'vie-photo-surface-v1:' + surface.cacheKey.call(material)
      material.needsUpdate = true
      this.surfaces.set(mesh, surface)
    }
    this.update(0, 0)
  }
  update(delta: number, _elapsed: number): void {
    if (!this.context) return
    const reduced = this.context.reducedMotion()
    const effect = resolvePhotoEffect(this.context.config)
    if (!reduced && !this.suspended) this.time += Math.min(.1, delta) * effect.speed
    if (this.pointerDirty) {
      this.pointerDirty = false
      this.raycaster.setFromCamera(this.pointer, this.context.camera)
      const faces = this.context.photos.filter(mesh => mesh.visible).flatMap(mesh => [mesh, ...mesh.children.filter(child => child.name === 'photo-back')])
      const hit = this.raycaster.intersectObjects(faces, false)[0]
      this.hovered = hit ? this.context.photos[hit.object.userData.index] : null
      if (hit?.uv && this.hovered) (this.surfaces.get(this.hovered)?.uniforms.uViePointer.value as THREE.Vector2)?.copy(hit.uv)
    }
    const style = PHOTO_EFFECTS.findIndex(item => item.id === effect.style)
    const blend = 1 - Math.exp(-Math.min(.1, delta) * 8)
    for (const [mesh, surface] of this.surfaces) {
      const u = surface.uniforms
      u.uVieStyle.value = style
      u.uVieAmount.value = effect.intensity
      u.uVieTime.value = reduced ? 0 : this.time
      u.uVieMotion.value = reduced || effect.speed === 0 ? 0 : 1
      u.uVieHover.value = THREE.MathUtils.lerp(u.uVieHover.value, !reduced && this.hovered === mesh ? 1 : 0, blend)
    }
  }
  uninstall(): void {
    if (!this.context) return
    this.context.off('photos:loaded', this.sync); this.context.off('config:update', this.sync); this.context.off('stage:suspend', this.suspend)
    this.context.renderer.domElement.removeEventListener('pointermove', this.move)
    this.context.renderer.domElement.removeEventListener('pointerleave', this.leave)
    for (const surface of this.surfaces.values()) this.restore(surface)
    this.surfaces.clear(); this.leave(); this.context = null
  }
}
