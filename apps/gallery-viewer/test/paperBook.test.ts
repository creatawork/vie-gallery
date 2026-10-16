import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { PaperBook, paperPoint } from '../src/core/PaperBook'
import { PhotoTheatrePlugin } from '../src/plugins/PhotoTheatrePlugin'
import { createViewerContext, photo } from './helpers/viewerContext'
import { normalizeViewerConfig } from '@vie/gallery-contracts'

test('flexible pages stay hinged, turn through depth, and lie flat on both sides', () => {
  for (const progress of [0, .25, .5, .75, 1]) {
    const angle = progress * Math.PI, curl = Math.sin(angle) * .85
    const spine = paperPoint(0, .5, angle, curl, 400, 500)
    assert.ok(Math.abs(spine[0]) < .001 && Math.abs(spine[2]) < .001)
    const edge = paperPoint(1, .5, angle, curl, 400, 500)
    assert.ok(edge.every(Number.isFinite))
    if (progress === .5) assert.ok(edge[2] > 340, 'the page travels through the room')
    if (progress === 0 || progress === 1) assert.ok(Math.abs(Math.abs(edge[0]) - 400) < .001)
  }
})

test('book reuses textures, exposes both faces for picking, supports tiny albums and restores ownership', () => {
  for (const count of [0, 1, 2, 13]) {
    const ctx = createViewerContext(normalizeViewerConfig({}).config, Array.from({ length: count }, photo))
    ctx.photos.forEach((mesh, index) => { mesh.userData.index = index; Object.assign(mesh.material, { map: new THREE.Texture() }) })
    const book = new PaperBook(ctx.scene)
    for (const cursor of [-1, 0, .5, 1, 13]) {
      book.render(ctx.photos, cursor, 1100, 650)
      const surfaces = ctx.photos.flatMap(mesh => mesh.userData.presentation ?? [])
      assert.ok(surfaces.length <= 6)
      for (const surface of surfaces) {
        const source = ctx.photos[surface.userData.index]
        assert.equal((surface.material as THREE.MeshBasicMaterial).map, (source.material as THREE.MeshStandardMaterial).map)
        assert.ok(surface.geometry.boundingSphere!.radius > 0)
      }
    }
    book.hide()
    assert.ok(ctx.photos.every(mesh => mesh.visible && !mesh.userData.presentation))
    book.dispose()
    assert.equal(ctx.scene.children.length, 0)
  }
})

test('book choreography reaches every page, freezes when paused and cleans up on focus and exit', () => {
  const ctx = createViewerContext(normalizeViewerConfig({}).config, Array.from({ length: 7 }, photo))
  const theatre = new PhotoTheatrePlugin(); theatre.install(ctx)
  let transitions = 0
  ctx.on('transition:start', () => transitions++)
  ctx.on('transition:end', () => transitions--)
  ctx.emit('theatre:command', { type: 'mode', mode: 'book' })
  const visited = new Set<number>()
  for (let i = 0; i < 7; i++) {
    visited.add(theatre.snapshot().offset)
    ctx.emit('theatre:command', { type: 'step', direction: 1 })
    theatre.update(1.5, i * 1.5)
  }
  assert.equal(visited.size, 7)
  assert.equal(transitions, 0)
  ctx.emit('theatre:command', { type: 'play' })
  theatre.update(15, 15)
  theatre.update(2.5, 17.5)
  ctx.emit('theatre:command', { type: 'pause' })
  const pageMesh = ctx.photos.flatMap(mesh => mesh.userData.presentation ?? [])[0]
  const frozen = [...pageMesh.geometry.attributes.position.array]
  theatre.update(5, 22.5)
  assert.deepEqual([...pageMesh.geometry.attributes.position.array], frozen)
  assert.equal(transitions, 0)
  ctx.emit('theatre:command', { type: 'focus', index: 2 })
  assert.ok(ctx.photos.every(mesh => !mesh.userData.presentation))
  ctx.emit('photo:blur')
  assert.equal(theatre.snapshot().mode, 'book')
  ctx.emit('theatre:command', { type: 'exit' })
  assert.ok(ctx.photos.every(mesh => mesh.visible && !mesh.userData.presentation))
  theatre.uninstall()
  assert.equal(ctx.scene.children.length, 0)
})
