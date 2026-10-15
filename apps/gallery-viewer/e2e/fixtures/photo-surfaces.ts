import * as THREE from 'three'
import { PhotoScene } from '../../src/core/PhotoScene'
import { TexturePool } from '../../src/core/TexturePool'

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true })
renderer.setSize(320, 240)
renderer.setPixelRatio(1)
document.body.append(renderer.domElement)
const scene = new THREE.Scene()
scene.background = new THREE.Color('#101010')
scene.add(new THREE.AmbientLight('#ffffff', 2))
const camera = new THREE.PerspectiveCamera(45, 4 / 3, .1, 1000)
const texture = new THREE.DataTexture(new Uint8Array([
  0, 0, 255, 255, 255, 255, 0, 255,
  255, 0, 0, 255, 0, 255, 0, 255
]), 2, 2, THREE.RGBAFormat)
texture.magFilter = THREE.NearestFilter
texture.colorSpace = THREE.SRGBColorSpace
texture.needsUpdate = true
const pool = new TexturePool({ maxEdge: 2, bytes: 1000, concurrent: 1, resident: 1 }, async () => ({ texture, bytes: 16 }))
const photos = new PhotoScene(scene, pool)
const photo = { width: 800, height: 600, sortOrder: 0, thumbnailUrl: 'fixture' }
photos.sync([photo])
pool.touch(photo, 0)
await pool.acquire(photo, ['fixture'], 0)

function render(side: number) {
  camera.position.set(0, 0, side * 120)
  camera.lookAt(0, 0, -1.05)
  renderer.render(scene, camera)
  const gl = renderer.getContext(), pixels: number[][] = []
  for (const [x, y] of [[90, 170], [230, 170], [90, 70], [230, 70]]) {
    const pixel = new Uint8Array(4)
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
    pixels.push([...pixel])
  }
  return pixels
}
Object.assign(window, { photoSurfaces: { render } })
render(1)
window.addEventListener('pagehide', () => { photos.dispose(); pool.dispose(); renderer.dispose() }, { once: true })
