import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { normalizeViewerConfig, mergeViewerConfig } from '@vie/gallery-contracts'
import { BackgroundPlugin } from '../src/plugins/BackgroundPlugin'
import { createViewerContext } from './helpers/viewerContext'
test('background changes scene colors, reuses gradient data and releases texture', () => {
  const context = createViewerContext(normalizeViewerConfig({ background: { mode: 'gradient', color: '#ff0000', secondaryColor: '#0000ff', angle: 90 } }).config)
  const plugin = new BackgroundPlugin(); plugin.install(context)
  const texture = context.scene.background as THREE.DataTexture
  let removed = 0; texture.addEventListener('dispose', () => removed++)
  const before = Array.from(texture.image.data)
  context.config = mergeViewerConfig(context.config, { background: { angle: 180 } })
  context.emit('config:update', context.config)
  assert.equal(context.scene.background, texture)
  assert.notDeepEqual(Array.from(texture.image.data), before)
  context.config = mergeViewerConfig(context.config, { background: { mode: 'solid', color: '#ffffff' } })
  context.emit('config:update', context.config)
  assert.equal((context.scene.background as THREE.Color).getHexString(), 'ffffff')
  assert.equal(removed, 1)
  plugin.uninstall()
  assert.equal(context.scene.background, null)
  assert.equal(context.bus.listenerCount('config:update'), 0)
})
