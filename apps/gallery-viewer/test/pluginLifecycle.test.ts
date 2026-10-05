import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { normalizeViewerConfig, mergeViewerConfig } from '@vie/gallery-contracts'
import { PluginManager } from '../src/core/PluginManager'
import { PhotoFadePlugin } from '../src/plugins/PhotoFadePlugin'
import { LightingPlugin } from '../src/plugins/LightingPlugin'
import { LayoutPlugin } from '../src/plugins/LayoutPlugin'
import { createViewerContext, photo } from './helpers/viewerContext'
test('late plugin installation and loading after dispose release resources', async () => {
  for (const lazy of [false, true]) {
    const manager = new PluginManager()
    manager.setContext(createViewerContext(normalizeViewerConfig({}).config))
    let finish!: () => void, removed = 0
    const plugin = { name: 'Slow', version: '1', install: lazy ? () => {} : () => new Promise<void>(resolve => { finish = resolve }), uninstall: () => removed++ }
    if (lazy) manager.setRegistry({ Slow: () => new Promise(resolve => { finish = () => resolve(plugin) }) })
    else manager.register(plugin)
    const pending = manager.install('Slow')
    manager.dispose(); finish(); await pending
    assert.equal(removed, 1)
    assert.equal(manager.getInstalled().length, 0)
  }
})
test('failed install releases its partial resources and ordered updates run fade before layout', async () => {
  const manager = new PluginManager()
  manager.setContext(createViewerContext(normalizeViewerConfig({}).config))
  let removed = 0
  manager.register({ name: 'Bad', version: '1', install: () => { throw Error('expected failure') }, uninstall: () => removed++ })
  await assert.rejects(manager.install('Bad'))
  assert.equal(removed, 1)
  const order: string[] = []
  for (const name of ['Layout', 'PhotoFade', 'Other']) { manager.register({ name, version: '1', install: () => {}, uninstall: () => {}, update: () => order.push(name) }); await manager.install(name) }
  manager.update(.1, .1)
  assert.deepEqual(order, ['PhotoFade', 'Layout', 'Other'])
})
test('fade completes on active seconds; rise combines with layout; blur restores focus; reduced motion is immediate', () => {
  for (const entrance of ['fade', 'rise', 'none'] as const) {
    const photos = [photo(), photo()]
    const context = createViewerContext(normalizeViewerConfig({ layout: { transition: { style: 'none' } }, effects: { photoEntrance: entrance, photoFloat: false } }).config, photos)
    let now = 0
    context.now = () => now
    context.reducedMotion = () => false
    const fade = new PhotoFadePlugin(), layout = new LayoutPlugin()
    layout.install(context); fade.install(context)
    context.emit('photos:loaded', photos)
    const y = photos[0].position.y
    fade.update(0, 0); layout.update(0, 0)
    if (entrance === 'rise') assert.ok(photos[0].position.y < y)
    now = 2; fade.update(.1, now); layout.update(.1, now)
    assert.equal((photos[0].material as THREE.Material).opacity, 1)
    assert.equal(photos[0].userData.entranceOffsetY ?? 0, 0)
    context.emit('photo:focus', { photo: photos[0] })
    now += .3; fade.update(.1, now)
    assert.ok(Math.abs((photos[1].material as THREE.Material).opacity - .6) < .00001)
    context.emit('photo:blur'); now += .4; fade.update(.1, now)
    assert.equal((photos[1].material as THREE.Material).opacity, 1)
    fade.uninstall(); layout.uninstall()
    assert.equal(context.bus.listenerCount('photos:loaded'), 0)
  }
  const context = createViewerContext(normalizeViewerConfig({}).config, [photo()])
  context.reducedMotion = () => true
  const fade = new PhotoFadePlugin(); fade.install(context)
  assert.equal((context.photos[0].material as THREE.Material).opacity, 1)
  fade.uninstall()
})
test('repeated light changes and uninstall balance every transition', async () => {
  const context = createViewerContext(normalizeViewerConfig({ lighting: { autoColorAdapt: false } }).config)
  let now = 0, count = 0
  context.now = () => now
  context.reducedMotion = () => false
  context.on('transition:start', () => count++)
  context.on('transition:end', () => count--)
  const lighting = new LightingPlugin(); await lighting.install(context)
  for (const timeOfDay of ['sunset', 'night', 'noon'] as const) {
    context.config = mergeViewerConfig(context.config, { lighting: { timeOfDay } })
    context.emit('config:update', context.config)
  }
  now = 3; lighting.update(.1, now)
  assert.equal(count, 0)
  context.config = mergeViewerConfig(context.config, { lighting: { timeOfDay: 'night' } }); context.emit('config:update', context.config)
  lighting.uninstall()
  assert.equal(count, 0)
    assert.equal(context.scene.children.length, 0)
})

test('context loss cancels animation schedules and balances transitions', async () => {
  const context = createViewerContext(normalizeViewerConfig({ lighting: { autoColorAdapt: false } }).config, [photo(), photo()])
  let count = 0
  context.on('transition:start', () => count++)
  context.on('transition:end', () => count--)
  const fade = new PhotoFadePlugin(), layout = new LayoutPlugin(), lighting = new LightingPlugin()
  fade.install(context); layout.install(context); await lighting.install(context)
  context.config = mergeViewerConfig(context.config, { layout: { mode: 'helix' }, lighting: { timeOfDay: 'night' } })
  context.emit('config:update', context.config)
  assert.ok(count > 0)
  context.emit('webgl:lost')
  assert.equal(count, 0)
  fade.uninstall(); layout.uninstall(); lighting.uninstall()
  assert.equal(count, 0)
})
