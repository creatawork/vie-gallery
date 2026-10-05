import * as THREE from 'three'
import type { PublicPhoto } from '@vie/gallery-contracts'
import type { PhotoMesh } from './types'
import { TexturePool } from './TexturePool'

/** Owns photo geometry/materials. Identity is the public photo object, including across page append. */
export class PhotoScene {
  private meshes = new Map<PublicPhoto, PhotoMesh>()
  private frustum = new THREE.Frustum()
  private matrix = new THREE.Matrix4()
  private position = new THREE.Vector3()
  private disposed = false
  constructor(private scene: THREE.Scene, private pool: TexturePool, private textureReady: (mesh: PhotoMesh) => void = () => {}) {}
  sync(photos: PublicPhoto[]): { all: PhotoMesh[]; added: PhotoMesh[]; removed: PhotoMesh[] } {
    const added: PhotoMesh[] = [], removed: PhotoMesh[] = []
    const keep = new Set(photos)
    for (const [photo, mesh] of this.meshes) if (!keep.has(photo)) {
      this.pool.release(photo); this.remove(mesh); this.meshes.delete(photo); removed.push(mesh)
    }
    const all = photos.map((photo, index) => {
      let mesh = this.meshes.get(photo)
      if (!mesh) {
        const ratio = photo.width > 0 && photo.height > 0 ? photo.width / photo.height : 4 / 3
        const material = new THREE.MeshStandardMaterial({ color: '#b8bcc4', side: THREE.DoubleSide, metalness: 0, roughness: .7 })
        mesh = Object.assign(new THREE.Mesh(new THREE.PlaneGeometry(80, 80 / ratio), material), {
          userData: { index, url: '', thumbnailUrl: '', textureState: 'placeholder' as const }
        })
        mesh.geometry.computeBoundingSphere()
        mesh.userData = { index, url: '', thumbnailUrl: '', textureState: 'placeholder' }
        this.meshes.set(photo, mesh); this.scene.add(mesh); added.push(mesh)
        this.load(photo, mesh)
      }
      Object.assign(mesh.userData, { index, title: photo.title ?? `Photo ${index + 1}`, thumbnailUrl: photo.thumbnailUrl ?? '',
        mediumUrl: photo.mediumUrl, textureUrl: photo.textureUrl, url: photo.mediumUrl ?? photo.thumbnailUrl ?? '' })
      return mesh
    })
    return { all, added, removed }
  }
  private load(photo: PublicPhoto, mesh: PhotoMesh): void {
    const urls = [photo.textureUrl, photo.thumbnailUrl].filter((value): value is string => !!value)
    if (!urls.length) return
    this.pool.onChange(photo, texture => {
      if (this.disposed || this.meshes.get(photo) !== mesh) return
      const material = mesh.material as THREE.MeshStandardMaterial
      material.map = texture
      // Preserve a readable photographic base under the darkest scene lighting.
      material.emissiveMap = texture; material.emissive.set(texture ? '#ffffff' : '#000000'); material.emissiveIntensity = .25
      material.color.set(texture ? '#ffffff' : '#b8bcc4'); material.needsUpdate = true
      mesh.userData.textureState = texture ? 'ready' : 'placeholder'
      if (texture) this.textureReady(mesh)
    })
    void this.pool.acquire(photo, urls, Infinity).catch(error => {
      if (this.disposed || this.meshes.get(photo) !== mesh || error?.name === 'AbortError') return
      mesh.userData.textureState = 'failed'
    })
  }
  updateVisibility(camera: THREE.PerspectiveCamera): void {
    if (this.disposed) return
    camera.updateMatrixWorld(); this.scene.updateMatrixWorld()
    this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    this.frustum.setFromProjectionMatrix(this.matrix)
    for (const [photo, mesh] of this.meshes) {
      const visible = this.frustum.intersectsObject(mesh)
      mesh.getWorldPosition(this.position)
      this.pool.touch(photo, visible ? this.position.distanceToSquared(camera.position) : Infinity)
    }
  }
  retry(photo: PublicPhoto): void {
    const mesh = this.meshes.get(photo)
    if (!mesh || this.disposed) return
    this.pool.release(photo); mesh.userData.textureState = 'placeholder'; this.load(photo, mesh)
  }
  retryFailed(): void { for (const [photo, mesh] of this.meshes) if (mesh.userData.textureState === 'failed') this.retry(photo) }
  private remove(mesh: PhotoMesh): void {
    this.scene.remove(mesh); mesh.geometry.dispose()
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose()
  }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const [photo, mesh] of this.meshes) { this.pool.release(photo); this.remove(mesh) }
    this.meshes.clear()
  }
}
