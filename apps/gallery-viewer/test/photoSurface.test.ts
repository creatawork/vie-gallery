import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createRecommendedViewerConfig, PHOTO_ARRANGEMENTS } from '@vie/gallery-contracts'
import { PhotoSurfacePlugin } from '../src/plugins/PhotoSurfacePlugin'
import { stageArrangement } from '../src/lib/stageArrangements'
import { createViewerContext } from './helpers/viewerContext'
import type { PhotoMesh } from '../src/core/types'

test('surface hooks survive texture replacement, handle page append, and restore on removal', () => {
  const photo = () => Object.assign(new THREE.Mesh(new THREE.PlaneGeometry(80, 60), new THREE.MeshStandardMaterial()), { userData: { index: 0, url: '', thumbnailUrl: '' } }) as PhotoMesh
  const mesh = photo(), added = photo()
  const context = createViewerContext(createRecommendedViewerConfig(), [mesh])
  context.renderer.domElement = new EventTarget() as HTMLCanvasElement
  const material = mesh.material as THREE.MeshStandardMaterial
  const original = material.onBeforeCompile, originalKey = material.customProgramCacheKey
  const surface = new PhotoSurfacePlugin()
  surface.install(context)
  const hook = material.onBeforeCompile
  assert.notEqual(hook, original)
  material.map = new THREE.Texture(); material.needsUpdate = true
  context.emit('photo:texture-ready', mesh)
  assert.equal(material.onBeforeCompile, hook)
  context.photos.push(added); context.emit('photos:loaded', context.photos)
  assert.notEqual(added.material.onBeforeCompile, original)
  context.photos = [added]; context.emit('photos:loaded', context.photos)
  assert.equal(material.onBeforeCompile, original)
  assert.equal(material.customProgramCacheKey, originalKey)
  surface.uninstall(); surface.uninstall()
  assert.equal(added.material.onBeforeCompile, original)
})

test('all eight arrangements have distinct poses and finite coordinates across phone and desktop sizes', () => {
  for (const mobile of [false, true]) {
    const signatures = new Set(PHOTO_ARRANGEMENTS.map(item => JSON.stringify(stageArrangement(1, item.id, mobile))))
    assert.equal(signatures.size, 8)
    for (const item of PHOTO_ARRANGEMENTS) for (const d of [-50, -2, -.2, 0, 1, 50]) {
      const pose = stageArrangement(d, item.id, mobile)
      assert.ok(Object.values(pose).every(Number.isFinite))
      if (d === 0) assert.ok(Math.abs(pose.x) < .001 && Math.abs(pose.y) < .001)
    }
  }
})
