import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { normalizeViewerConfig, mergeViewerConfig, SCENE_BACKGROUND_VERSION } from '@vie/gallery-contracts'
import { BackgroundPlugin } from '../src/plugins/BackgroundPlugin'
import { createViewerContext } from './helpers/viewerContext'

type LoaderCall = { url: string; succeed: (texture: THREE.Texture) => void; fail: (error: unknown) => void }
type LoadResult = { texture: THREE.Texture; disposals: () => number }
function controlTextureLoader() {
  const original = THREE.TextureLoader.prototype.load
  const calls: LoaderCall[] = []
  THREE.TextureLoader.prototype.load = function (url: string, success: (texture: THREE.Texture) => void, _progress: undefined, failure: (error: unknown) => void) {
    calls.push({ url, succeed: success, fail: failure })
    return new THREE.Texture()
  }
  return {
    calls,
    succeed(index: number): LoadResult {
      const texture = new THREE.Texture()
      texture.image = { width: 2048, height: 1024 }
      const state = { count: 0 }
      texture.addEventListener('dispose', () => state.count++)
      calls[index].succeed(texture)
      return { texture, disposals: () => state.count }
    },
    fail(index: number) { calls[index].fail(new Error('network')) },
    restore() { THREE.TextureLoader.prototype.load = original }
  }
}
function trackDisposals(texture: THREE.Texture) {
  const state = { count: 0 }
  texture.addEventListener('dispose', () => state.count++)
  return () => state.count
}

test('low quality devices load the lower resolution panorama variant', () => {
  const context = createViewerContext(normalizeViewerConfig({ quality: 'low', background: { mode: 'image', color: '#0f172a', image: { url: `/g/backgrounds/minimal.webp?v=${SCENE_BACKGROUND_VERSION}` } } }).config)
  const loader = controlTextureLoader()
  const plugin = new BackgroundPlugin(); plugin.install(context)
  assert.equal(loader.calls[0].url, `/g/backgrounds/minimal-low.webp?v=${SCENE_BACKGROUND_VERSION}`)
  loader.succeed(0)
  assert.equal((context.scene.background as THREE.Texture).mapping, THREE.EquirectangularReflectionMapping)
  const info = plugin.getInfo()
  assert.equal(info.projection, 'equirectangular')
  assert.equal(info.width, 2048)
  plugin.uninstall(); loader.restore()
})
test('builtin background textures use equirectangular mapping', () => {
  const context = createViewerContext(normalizeViewerConfig({ background: { mode: 'image', color: '#0f172a', image: { url: '/g/backgrounds/minimal.webp' } } }).config)
  const loader = controlTextureLoader()
  const plugin = new BackgroundPlugin(); plugin.install(context)
  assert.equal(loader.calls[0].url, '/g/backgrounds/minimal.webp')
  loader.succeed(0)
  const texture = context.scene.background as THREE.Texture
  assert.equal(texture.mapping, THREE.EquirectangularReflectionMapping)
  assert.equal(texture.colorSpace, THREE.SRGBColorSpace)
  plugin.uninstall(); loader.restore()
})
test('custom image backgrounds keep flat mapping', () => {
  const context = createViewerContext(normalizeViewerConfig({ background: { mode: 'image', color: '#0f172a', image: { url: 'https://cdn.example.com/room.webp' } } }).config)
  const loader = controlTextureLoader()
  const plugin = new BackgroundPlugin(); plugin.install(context)
  loader.succeed(0)
  assert.equal((context.scene.background as THREE.Texture).mapping, THREE.UVMapping)
  plugin.uninstall(); loader.restore()
})
test('stale image success and failure callbacks never override newer states', () => {
  const context = createViewerContext(normalizeViewerConfig({ background: { mode: 'gradient', color: '#ff0000', secondaryColor: '#0000ff', angle: 90 } }).config)
  const loader = controlTextureLoader()
  const plugin = new BackgroundPlugin(); plugin.install(context)
  context.config = mergeViewerConfig(context.config, { background: { mode: 'image', color: '#000000', image: { url: 'https://cdn.example.com/a.webp' } } })
  context.emit('config:update', context.config)
  context.config = mergeViewerConfig(context.config, { background: { mode: 'gradient', color: '#ff0000', secondaryColor: '#0000ff', angle: 45 } })
  context.emit('config:update', context.config)
  const gradient = context.scene.background as THREE.DataTexture
  const stale = loader.succeed(0)
  assert.equal(context.scene.background, gradient, 'A arriving after gradient must not take over')
  assert.equal(stale.disposals(), 1, 'stale texture disposes exactly once')
  context.config = mergeViewerConfig(context.config, { background: { mode: 'image', color: '#000000', image: { url: 'https://cdn.example.com/b.webp' } } })
  context.emit('config:update', context.config)
  context.config = mergeViewerConfig(context.config, { background: { mode: 'solid', color: '#ffffff' } })
  context.emit('config:update', context.config)
  loader.succeed(1)
  loader.fail(1)
  assert.equal((context.scene.background as THREE.Color).getHexString(), 'ffffff', 'B success and failure after solid must not take over')
  plugin.uninstall(); loader.restore()
})
test('image failure falls back to color and releases the replaced gradient once', () => {
  const context = createViewerContext(normalizeViewerConfig({ background: { mode: 'gradient', color: '#ff0000', secondaryColor: '#0000ff', angle: 90 } }).config)
  const loader = controlTextureLoader()
  const plugin = new BackgroundPlugin(); plugin.install(context)
  const gradient = context.scene.background as THREE.DataTexture
  const gradientDisposals = trackDisposals(gradient)
  context.config = mergeViewerConfig(context.config, { background: { mode: 'image', color: '#101010', image: { url: 'https://cdn.example.com/missing.webp' } } })
  context.emit('config:update', context.config)
  loader.fail(0)
  assert.equal((context.scene.background as THREE.Color).getHexString(), '101010')
  assert.equal(gradientDisposals(), 1, 'failure fallback releases the old texture exactly once')
  plugin.uninstall(); loader.restore()
})
test('image A to gradient releases the old image texture exactly once', () => {
  const context = createViewerContext(normalizeViewerConfig({ background: { mode: 'image', color: '#000000', image: { url: 'https://cdn.example.com/a.webp' } } }).config)
  const loader = controlTextureLoader()
  const plugin = new BackgroundPlugin(); plugin.install(context)
  const first = loader.succeed(0)
  assert.equal(context.scene.background, first.texture)
  context.config = mergeViewerConfig(context.config, { background: { mode: 'gradient', color: '#ff0000', secondaryColor: '#0000ff', angle: 90 } })
  context.emit('config:update', context.config)
  assert.notEqual(context.scene.background, first.texture)
  assert.equal(first.disposals(), 1, 'replaced image texture disposes exactly once')
  plugin.uninstall(); loader.restore()
})
test('new image success releases the previous texture exactly once', () => {
  const context = createViewerContext(normalizeViewerConfig({ background: { mode: 'image', color: '#000000', image: { url: 'https://cdn.example.com/a.webp' } } }).config)
  const loader = controlTextureLoader()
  const plugin = new BackgroundPlugin(); plugin.install(context)
  const first = loader.succeed(0)
  context.config = mergeViewerConfig(context.config, { background: { mode: 'image', color: '#000000', image: { url: 'https://cdn.example.com/b.webp' } } })
  context.emit('config:update', context.config)
  loader.succeed(1)
  assert.equal(first.disposals(), 1)
  assert.notEqual(context.scene.background, first.texture)
  plugin.uninstall(); loader.restore()
})
test('failed image loads fall back to color and allow retrying the same config', () => {
  const context = createViewerContext(normalizeViewerConfig({ background: { mode: 'image', color: '#101010', image: { url: 'https://cdn.example.com/missing.webp' } } }).config)
  const loader = controlTextureLoader()
  const plugin = new BackgroundPlugin(); plugin.install(context)
  loader.fail(0)
  assert.equal((context.scene.background as THREE.Color).getHexString(), '101010')
  context.config = mergeViewerConfig(context.config, { background: { angle: 135 } })
  context.emit('config:update', context.config)
  assert.equal(loader.calls.length, 2, 'identical background config retries after failure')
  loader.succeed(1)
  assert.equal(context.scene.background instanceof THREE.Texture, true, 'retry can recover')
  plugin.uninstall(); loader.restore()
})
test('uninstall invalidates in-flight image loads', () => {
  const context = createViewerContext(normalizeViewerConfig({ background: { mode: 'image', color: '#000000', image: { url: 'https://cdn.example.com/a.webp' } } }).config)
  const loader = controlTextureLoader()
  const plugin = new BackgroundPlugin(); plugin.install(context)
  plugin.uninstall()
  const late = loader.succeed(0)
  assert.equal(late.disposals(), 1, 'late success disposes its texture')
  assert.equal(context.scene.background, null)
  loader.restore()
})
test('background changes scene colors, reuses gradient data and releases texture', () => {
  const context = createViewerContext(normalizeViewerConfig({ background: { mode: 'gradient', color: '#ff0000', secondaryColor: '#0000ff', angle: 90 } }).config)
  const plugin = new BackgroundPlugin(); plugin.install(context)
  const texture = context.scene.background as THREE.DataTexture
  const removed = trackDisposals(texture)
  const before = Array.from(texture.image.data)
  context.config = mergeViewerConfig(context.config, { background: { angle: 180 } })
  context.emit('config:update', context.config)
  assert.equal(context.scene.background, texture)
  assert.notDeepEqual(Array.from(texture.image.data), before)
  context.config = mergeViewerConfig(context.config, { background: { mode: 'solid', color: '#ffffff' } })
  context.emit('config:update', context.config)
  assert.equal((context.scene.background as THREE.Color).getHexString(), 'ffffff')
  assert.equal(removed(), 1)
  plugin.uninstall()
  assert.equal(context.scene.background, null)
  assert.equal(context.bus.listenerCount('config:update'), 0)
})
