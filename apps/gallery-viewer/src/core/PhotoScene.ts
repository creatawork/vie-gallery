import * as THREE from 'three'
import type { PublicPhoto } from '@vie/gallery-contracts'
import type { PhotoMesh } from './types'
import { TexturePool } from './TexturePool'

/** Owns photo geometry/materials. Identity is the public photo object, including across page append. */
export class PhotoScene {
  private meshes = new Map<PublicPhoto, PhotoMesh>()
  private highTextureOwners = new Map<PublicPhoto, object>()
  private highTextureReady = new Set<PublicPhoto>()
  private highTextureFailed = new Set<PublicPhoto>()
  private frustum = new THREE.Frustum()
  private matrix = new THREE.Matrix4()
  private position = new THREE.Vector3()
  private disposed = false
  constructor(private scene: THREE.Scene, private pool: TexturePool, private textureReady: (mesh: PhotoMesh) => void = () => {}) {}
  sync(photos: PublicPhoto[]): { all: PhotoMesh[]; added: PhotoMesh[]; removed: PhotoMesh[] } {
    const added: PhotoMesh[] = [], removed: PhotoMesh[] = []
    const keep = new Set(photos)
    for (const [photo, mesh] of this.meshes) if (!keep.has(photo)) {
      this.pool.release(photo)
      const highOwner = this.highTextureOwners.get(photo)
      this.highTextureReady.delete(photo)
      if (highOwner) this.pool.release(highOwner)
      this.highTextureOwners.delete(photo); this.highTextureFailed.delete(photo)
      this.remove(mesh); this.meshes.delete(photo); removed.push(mesh)
    }
    const all = photos.map((photo, index) => {
      let mesh = this.meshes.get(photo)
      if (!mesh) {
        const ratio = photo.width > 0 && photo.height > 0 ? photo.width / photo.height : 4 / 3
        const width = Math.min(80, 120 * ratio), height = width / ratio
        const material = new THREE.MeshStandardMaterial({ color: '#b8bcc4', side: THREE.FrontSide, metalness: 0, roughness: .7 })
        mesh = Object.assign(new THREE.Mesh(new THREE.PlaneGeometry(width, height, 24, 24), material), {
          userData: { index, url: '', thumbnailUrl: '', textureState: 'placeholder' as const }
        })
        mesh.geometry.computeBoundingSphere()
        // Surface shaders may bend a photograph a few units beyond the flat plane.
        mesh.geometry.boundingSphere!.radius += 5
        // Two printed faces share one paper-thin surface, without a dark mount.
        const back = new THREE.Mesh(mesh.geometry, material)
        back.name = 'photo-back'
        back.position.z = -.015
        back.rotation.y = Math.PI
        mesh.add(back)
        mesh.userData = { index, url: '', thumbnailUrl: '', textureState: 'placeholder' }
        this.meshes.set(photo, mesh); this.scene.add(mesh); added.push(mesh)
        this.load(photo, mesh)
      }
      Object.assign(mesh.userData, { index, title: photo.title ?? `Photo ${index + 1}`, thumbnailUrl: photo.thumbnailUrl ?? '',
        mediumUrl: photo.mediumUrl, textureUrl: photo.textureUrl, url: photo.mediumUrl ?? photo.thumbnailUrl ?? '' })
      mesh.getObjectByName('photo-back')!.userData = mesh.userData
      return mesh
    })
    return { all, added, removed }
  }
  private load(photo: PublicPhoto, mesh: PhotoMesh): void {
    const urls = [...new Set([photo.thumbnailUrl, photo.textureUrl].filter((url): url is string => !!url))]
    if (!urls.length) return
    this.pool.onChange(photo, texture => {
      if (this.disposed || this.meshes.get(photo) !== mesh) return
      if (!texture) {
        if (!this.highTextureReady.has(photo) || !this.highTextureOwners.has(photo)) {
          this.clearTexture(mesh)
          mesh.userData.textureState = 'placeholder'
        }
        return
      }
      this.applyTexture(mesh, texture)
      if (photo.textureUrl && (texture.userData.sourceUrl === photo.textureUrl || photo.textureUrl === photo.thumbnailUrl)) {
        this.highTextureReady.add(photo)
      }
      mesh.userData.textureState = 'ready'
      this.textureReady(mesh)
    })
    void this.pool.acquire(photo, urls, Infinity).catch(error => {
      if (this.disposed || this.meshes.get(photo) !== mesh || error?.name === 'AbortError') return
      mesh.userData.textureState = 'failed'
    })
  }
  private loadHighTexture(photo: PublicPhoto, mesh: PhotoMesh, priority: number): void {
    const url = photo.textureUrl
    if (!url || url === photo.thumbnailUrl || this.highTextureFailed.has(photo) || this.highTextureReady.has(photo)) return
    let owner = this.highTextureOwners.get(photo)
    if (!owner) { owner = {}; this.highTextureOwners.set(photo, owner) }
    this.pool.onChange(owner, texture => {
      if (this.disposed || this.meshes.get(photo) !== mesh) return
      if (!texture) {
        if (this.highTextureReady.delete(photo)) {
          this.clearTexture(mesh)
          mesh.userData.textureState = 'placeholder'
          this.load(photo, mesh)
        }
        return
      }
      this.highTextureReady.add(photo)
      this.applyTexture(mesh, texture)
      mesh.userData.textureState = 'ready'
      this.pool.release(photo)
      this.textureReady(mesh)
    })
    void this.pool.acquire(owner, [url], Number.isFinite(priority) ? priority + 1 : priority).catch(error => {
      if (error?.name !== 'AbortError' && this.meshes.get(photo) === mesh) this.highTextureFailed.add(photo)
    })
  }
  private applyTexture(mesh: PhotoMesh, texture: THREE.Texture): void {
    const material = mesh.material as THREE.MeshStandardMaterial
    material.map = texture
    // Preserve a readable photographic base under the darkest scene lighting.
    material.emissiveMap = texture; material.emissive.set('#ffffff'); material.emissiveIntensity = .25
    material.color.set('#ffffff'); material.needsUpdate = true
  }
  private clearTexture(mesh: PhotoMesh): void {
    const material = mesh.material as THREE.MeshStandardMaterial
    material.map = null; material.emissiveMap = null; material.emissive.set('#000000')
    material.color.set('#b8bcc4'); material.needsUpdate = true
  }
  updateVisibility(camera: THREE.PerspectiveCamera): void {
    if (this.disposed) return
    camera.updateMatrixWorld(); this.scene.updateMatrixWorld()
    this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    this.frustum.setFromProjectionMatrix(this.matrix)
    for (const [photo, mesh] of this.meshes) {
      const surfaces = mesh.userData.presentation ?? [mesh]
      const visible = surfaces.some(surface => surface.visible && this.frustum.intersectsObject(surface))
      mesh.userData.inView = visible
      const nearestSurface = surfaces[0] ?? mesh
      nearestSurface.getWorldPosition(this.position)
      // Reserve [0, 1) for thumbnails and [1, 2) for full textures. A nearby
      // upgrade must not occupy the download slots needed by other visible photos.
      const distance = this.position.distanceToSquared(camera.position)
      const priority = visible ? distance / (1 + distance) : Infinity
      const highOwner = this.highTextureOwners.get(photo)
      this.pool.touch(photo, highOwner && this.highTextureReady.has(photo) ? Infinity : priority)
      if (highOwner) this.pool.touch(highOwner, priority + 1)
      else if (visible && mesh.userData.textureState === 'ready' && !this.highTextureReady.has(photo)) this.loadHighTexture(photo, mesh, priority)
    }
  }
  retry(photo: PublicPhoto): void {
    const mesh = this.meshes.get(photo)
    if (!mesh || this.disposed) return
    this.pool.release(photo)
    const highOwner = this.highTextureOwners.get(photo)
    this.highTextureReady.delete(photo)
    if (highOwner) this.pool.release(highOwner)
    this.highTextureOwners.delete(photo); this.highTextureFailed.delete(photo)
    this.clearTexture(mesh)
    mesh.userData.textureState = 'placeholder'; this.load(photo, mesh)
  }
  retryFailed(): void { for (const [photo, mesh] of this.meshes) if (mesh.userData.textureState === 'failed') this.retry(photo) }
  private remove(mesh: PhotoMesh): void {
    const geometries = new Set<THREE.BufferGeometry>([mesh.geometry])
    const materials = new Set<THREE.Material>(Array.isArray(mesh.material) ? mesh.material : [mesh.material])
    for (const child of mesh.children) {
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        geometries.add(child.geometry)
        for (const material of Array.isArray(child.material) ? child.material : [child.material]) materials.add(material)
      }
    }
    this.scene.remove(mesh)
    for (const geometry of geometries) geometry.dispose()
    for (const material of materials) material.dispose()
  }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const [photo, mesh] of this.meshes) {
      this.pool.release(photo)
      const highOwner = this.highTextureOwners.get(photo)
      if (highOwner) this.pool.release(highOwner)
      this.remove(mesh)
    }
    this.meshes.clear()
    this.highTextureOwners.clear(); this.highTextureReady.clear(); this.highTextureFailed.clear()
  }
}
