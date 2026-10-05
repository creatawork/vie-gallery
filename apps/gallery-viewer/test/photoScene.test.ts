import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { PhotoScene } from '../src/core/PhotoScene'
import { TexturePool } from '../src/core/TexturePool'
test('append preserves identity and resources; metadata changes do not rebuild; replacement disposes once', () => {
  const pool = new TexturePool({ maxEdge: 512, bytes: 32 * 1024 ** 2, concurrent: 2, resident: 32 }, async () => ({ texture: new THREE.Texture(), bytes: 4 }))
  const photos = [{ title: 'one', thumbnailUrl: null, width: 800, height: 600, sortOrder: 0 }]
  const scene = new PhotoScene(new THREE.Scene(), pool)
  const first = scene.sync(photos).all[0]
  let geometryDisposed = 0, materialDisposed = 0
  first.geometry.addEventListener('dispose', () => geometryDisposed++)
  ;(first.material as THREE.Material).addEventListener('dispose', () => materialDisposed++)
  const next = scene.sync([...photos, { ...photos[0], title: 'two', sortOrder: 1 }])
  assert.equal(next.all[0], first); assert.equal(next.added.length, 1)
  photos[0].title = 'renamed'
  assert.equal(scene.sync(photos).all[0].userData.title, 'renamed')
  assert.equal(geometryDisposed, 0)
  scene.sync([{ ...photos[0] }])
  assert.equal(geometryDisposed, 1); assert.equal(materialDisposed, 1)
  scene.dispose(); assert.equal(geometryDisposed, 1); assert.equal(materialDisposed, 1)
  pool.dispose()
})
test('texture readiness follows loading; eviction clears maps before disposal; retry loads again', async () => {
  let failed = true, loads = 0, ready = 0
  const pool = new TexturePool({ maxEdge: 1, bytes: 100, concurrent: 1, resident: 1 }, async () => { loads++; if (failed) throw Error('injected failure'); return { texture: new THREE.Texture(), bytes: 4 } })
  const scene = new PhotoScene(new THREE.Scene(), pool, () => ready++)
  const data = { title: 'one', thumbnailUrl: 'photo', width: 800, height: 600, sortOrder: 0 }
  const mesh = scene.sync([data]).all[0]
  pool.touch(data, 0)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(mesh.userData.textureState, 'failed')
  failed = false; scene.retry(data); pool.touch(data, 0)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(mesh.userData.textureState, 'ready'); assert.equal(ready, 1)
  assert.ok((mesh.material as THREE.MeshStandardMaterial).map)
  pool.setBudget({ maxEdge: 1, bytes: 0, concurrent: 1, resident: 0 })
  assert.equal((mesh.material as THREE.MeshStandardMaterial).map, null)
  assert.equal(mesh.userData.textureState, 'placeholder')
  assert.equal(loads, 2)
  scene.dispose(); pool.dispose()
})
