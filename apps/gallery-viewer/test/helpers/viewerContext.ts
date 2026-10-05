import * as THREE from 'three'
import { EventBus } from '../../src/core/EventBus'
import type { ViewerConfig, ViewerContext, PhotoMesh } from '../../src/core/types'
export function createViewerContext(config: ViewerConfig, photos: PhotoMesh[] = []): ViewerContext & { bus: EventBus } {
  const bus = new EventBus()
  const scene = new THREE.Scene()
  return { bus, scene, camera: new THREE.PerspectiveCamera(), renderer: { domElement: {} } as THREE.WebGLRenderer,
    composer: null, config, photos, on: bus.on.bind(bus), off: bus.off.bind(bus), emit: bus.emit.bind(bus),
    addToScene: object => scene.add(object), removeFromScene: object => scene.remove(object),
    loadTexture: async () => new THREE.Texture(), isMobile: () => false,
    getQuality() { return this.config.quality === 'auto' ? 'mid' : this.config.quality } }
}
export function photo(): PhotoMesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(100, 60), new THREE.MeshBasicMaterial()) as PhotoMesh
  mesh.userData = { index: 0, url: '', thumbnailUrl: '' }
  return mesh
}
