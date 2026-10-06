import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { normalizeViewerConfig, mergeViewerConfig } from '@vie/gallery-contracts'
import { BackgroundPlugin } from '../src/plugins/BackgroundPlugin'
import { createViewerContext } from './helpers/viewerContext'

function controlTextureLoader() {
  const original = THREE.TextureLoader.prototype.load
  let onLoad: ((texture: THREE.Texture) => void) | null = null
  let onError: ((error: unknown) => void) | null = null
  let lastUrl = ''
  THREE.TextureLoader.prototype.load = function (url: string, success: (texture: THREE.Texture) => void, _progress: undefined, failure: (error: unknown) => void) {
    lastUrl = url; onLoad = success; onError = failure
    return new THREE.Texture()
  }
  return {
    get lastUrl() { return lastUrl },
    succeed() {
      const texture = new THREE.Texture()
      texture.image = { width: 2048, height: 1024 }
      onLoad!(texture)
    },
    fail() { onError!(new Error('network')) },
    restore() { THREE.TextureLoader.prototype.load = original; onLoad = null; onError = null }
  }
}

test('builtin background textures use equirectangular mapping', () => {
  const context = createViewerContext(normalizeViewerConfig({ background: { mode: 'image', color: '#0f172a', image: { url: '/g/backgrounds/minimal.webp' } } }).config)
  const loader = controlTextureLoader()
  const plugin = new BackgroundPlugin(); plugin.install(context)
  assert.equal(loader.lastUrl, '/g/backgrounds/minimal.webp')
  loader.succeed()
  const texture = context.scene.background as THREE.Texture
  assert.equal(texture.mapping, THREE.EquirectangularReflectionMapping)
  assert.equal(texture.colorSpace, THREE.SRGBColorSpace)
  plugin.uninstall(); loader.restore()
})
test('custom image backgrounds keep flat mapping', () => {
  const context = createViewerContext(normalizeViewerConfig({ background: { mode: 'image', color: '#0f172a', image: { url: 'https://cdn.example.com/room.webp' } } }).config)
  const loader = controlTextureLoader()
  const plugin = new BackgroundPlugin(); plugin.install(context)
  loader.succeed()
  assert.equal((context.scene.background as THREE.Texture).mapping, THREE.UVMapping)
  plugin.uninstall(); loader.restore()
})
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
