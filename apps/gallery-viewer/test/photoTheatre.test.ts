import test from 'node:test'
import assert from 'node:assert/strict'
import { createTheatrePoses, theatreCapacity, THEATRE_MODES, showCueAt } from '../src/lib/photoTheatre'
import { PhotoTheatrePlugin } from '../src/plugins/PhotoTheatrePlugin'
import { PhotoFadePlugin } from '../src/plugins/PhotoFadePlugin'
import type { Material } from 'three'
import { LayoutPlugin } from '../src/plugins/LayoutPlugin'
import { createViewerContext, photo } from './helpers/viewerContext'
import { normalizeViewerConfig } from '@vie/gallery-contracts'

const ratios = Array.from({ length: 67 }, (_, i) => i % 3 === 0 ? 2 / 3 : 3 / 2)
test('authored layouts fit mixed ratios, small albums and portrait viewports, with bounded visible batches', () => {
  for (const mode of THEATRE_MODES.map(m => m.id)) for (const count of [0, 1, 2, 3, 67]) for (const width of [350, 1200]) {
    const poses = createTheatrePoses(ratios.slice(0, count), mode, { width, height: 560 }, 0)
    assert.equal(poses.length, count)
    const visible = poses.filter(p => p.visible)
    assert.equal(visible.length, Math.min(count, theatreCapacity(mode, width)))
    for (const p of visible) {
      assert.ok(Object.values(p).every(v => typeof v !== 'number' || Number.isFinite(v)))
      assert.ok(p.scale > 0 && Math.abs(p.ry) < Math.PI / 2, 'photos face the viewer')
      assert.ok(Math.abs(p.x) + 40 * p.scale < width / 2 + 1, 'photo width remains in frame')
      assert.ok(Math.abs(p.y) + 40 / ratios[p.index] * p.scale < 281, 'photo height remains in frame')
    }
  }
})
test('batch navigation reaches every photo without duplicate slots or dropping the last partial batch', () => {
  const seen = new Set<number>()
  for (let offset = 0; offset < 67; offset += 24) {
    const visible = createTheatrePoses(ratios, 'cloud', { width: 1200, height: 560 }, offset).filter(p => p.visible)
    assert.equal(new Set(visible.map(p => p.index)).size, visible.length)
    visible.forEach(p => seen.add(p.index))
  }
  assert.equal(seen.size, 67)
  assert.equal(showCueAt(0).mode, 'cloud')
  assert.equal(showCueAt(9).mode, 'ring')
  assert.equal(showCueAt(16).mode, 'book')
  assert.equal(showCueAt(23).mode, 'tunnel')
  assert.equal(showCueAt(27).mode, 'focus')
  assert.equal(showCueAt(31).mode, 'cloud')
})
test('theatre owns transforms, pauses in flight, resumes, restores saved layout and balances transitions', () => {
  const ctx = createViewerContext(normalizeViewerConfig({ effects: { photoFloat: false, photoEntrance: 'none' } }).config, Array.from({ length: 12 }, photo))
  let transitions = 0
  ctx.on('transition:start', () => transitions++)
  ctx.on('transition:end', () => transitions--)
  const layout = new LayoutPlugin(), theatre = new PhotoTheatrePlugin()
  layout.install(ctx); theatre.install(ctx)
  const original = ctx.photos[0].position.clone()
  ctx.emit('theatre:command', { type: 'play' })
  theatre.update(.5, .5)
  ctx.emit('theatre:command', { type: 'pause' })
  const frozen = ctx.photos[0].position.clone()
  theatre.update(5, 5.5); layout.update(5, 5.5)
  assert.deepEqual(ctx.photos[0].position, frozen)
  assert.equal(transitions, 0)
  ctx.emit('theatre:command', { type: 'play' })
  theatre.update(9, 14.5)
  assert.equal(theatre.snapshot().mode, 'ring')
  ctx.emit('theatre:command', { type: 'exit' })
  assert.deepEqual(ctx.photos[0].position, original)
  assert.ok(ctx.photos.every(p => p.visible && p.scale.x === 1))
  assert.equal(transitions, 0)
  theatre.uninstall(); layout.uninstall()
  assert.equal(ctx.bus.listenerCount('theatre:command'), 0)
})
test('reduced motion, rapid retargeting, photo appends and teardown do not leak animation ownership', () => {
  const ctx = createViewerContext(normalizeViewerConfig({}).config, Array.from({ length: 4 }, photo))
  ctx.reducedMotion = () => true
  let transitions = 0
  ctx.on('transition:start', () => transitions++)
  ctx.on('transition:end', () => transitions--)
  const theatre = new PhotoTheatrePlugin(); theatre.install(ctx)
  ctx.emit('theatre:command', { type: 'mode', mode: 'triptych' })
  assert.equal(ctx.photos.filter(p => p.visible).length, 3)
  ctx.emit('theatre:command', { type: 'play' })
  assert.notEqual(theatre.snapshot().status, 'playing')
  ctx.reducedMotion = () => false
  for (const mode of ['cloud', 'fold', 'ring'] as const) ctx.emit('theatre:command', { type: 'mode', mode })
  ctx.photos.push(photo()); ctx.emit('photos:loaded', ctx.photos)
  ctx.emit('webgl:lost')
  theatre.uninstall()
  assert.equal(transitions, 0)
  assert.ok(ctx.photos.every(p => p.visible))
})

test('changing transition preferences preserves the current work, while geometry changes restore the scene', () => {
  const ctx = createViewerContext(normalizeViewerConfig({}).config, Array.from({ length: 4 }, photo))
  const theatre = new PhotoTheatrePlugin(); theatre.install(ctx)
  ctx.emit('theatre:command', { type: 'mode', mode: 'focus' })
  ctx.emit('theatre:command', { type: 'step', direction: 1 })
  ctx.reducedMotion = () => true
  ctx.config.layout.transition = { ...ctx.config.layout.transition, style: 'none' }
  ctx.emit('config:update', ctx.config)
  assert.equal(theatre.snapshot().active, true)
  assert.equal(theatre.snapshot().offset, 1)
  assert.equal(theatre.snapshot().reducedMotion, true)
  ctx.config.layout.mode = 'grid'
  ctx.emit('config:update', ctx.config)
  assert.equal(theatre.snapshot().active, false)
  theatre.uninstall()
})

test('focus returns to the same group and replay cancels a pending modal focus', () => {
  const ctx = createViewerContext(normalizeViewerConfig({ effects: { photoFloat: false } }).config, Array.from({ length: 20 }, photo))
  const theatre = new PhotoTheatrePlugin(); theatre.install(ctx)
  let focused = 0; ctx.on('theatre:focused', () => focused++)
  ctx.emit('theatre:command', { type: 'mode', mode: 'triptych' })
  ctx.emit('theatre:command', { type: 'step', direction: 1 })
  const group = theatre.snapshot().indices
  ctx.emit('theatre:command', { type: 'focus', index: 5 })
  theatre.update(2, 2)
  assert.equal(focused, 1)
  ctx.emit('photo:blur'); theatre.update(2, 4)
  assert.deepEqual(theatre.snapshot().indices, group)
  ctx.emit('theatre:command', { type: 'focus', index: 7 })
  ctx.emit('theatre:command', { type: 'play' })
  theatre.update(2, 6)
  assert.equal(focused, 1, 'replay must not open a modal requested by the interrupted focus')
  ctx.emit('theatre:command', { type: 'pause' })
  const elapsed = theatre.snapshot().elapsed
  theatre.update(10, 16)
  assert.equal(theatre.snapshot().elapsed, elapsed)
  theatre.uninstall()
})
test('programme completes at its final cloud without opening a modal or retaining a transition', () => {
  const ctx = createViewerContext(normalizeViewerConfig({ effects: { photoFloat: false } }).config, Array.from({ length: 30 }, photo))
  const theatre = new PhotoTheatrePlugin(); theatre.install(ctx)
  let transitions = 0, focused = 0
  ctx.on('transition:start', () => transitions++)
  ctx.on('transition:end', () => transitions--)
  ctx.on('theatre:focused', () => focused++)
  ctx.emit('theatre:command', { type: 'play' })
  for (let i = 0; i < 320; i++) theatre.update(.1, i / 10)
  assert.equal(theatre.snapshot().status, 'finished')
  assert.equal(theatre.snapshot().mode, 'cloud')
  assert.equal(transitions, 0)
  assert.equal(focused, 0)
  assert.equal(ctx.photos.filter(p => p.visible).length, 24)
  theatre.uninstall()
})

test('manual mode changes and replay release the previous focus dimming', () => {
  const ctx = createViewerContext(normalizeViewerConfig({ effects: { photoEntrance: 'none' } }).config, Array.from({ length: 8 }, photo))
  let now = 0; ctx.now = () => now
  const fade = new PhotoFadePlugin(), theatre = new PhotoTheatrePlugin()
  fade.install(ctx); theatre.install(ctx)
  ctx.emit('theatre:command', { type: 'mode', mode: 'cloud' })
  ctx.emit('theatre:command', { type: 'focus', index: 2 })
  now = 1; fade.update(1, now)
  assert.ok((ctx.photos[0].material as Material).opacity < 1)
  ctx.emit('theatre:command', { type: 'mode', mode: 'wall' })
  now = 2; fade.update(1, now)
  assert.ok(ctx.photos.every(p => (p.material as Material).opacity === 1))
  ctx.emit('theatre:command', { type: 'focus', index: 3 })
  now = 3; fade.update(1, now)
  ctx.emit('theatre:command', { type: 'play' })
  now = 4; fade.update(1, now)
  assert.ok(ctx.photos.every(p => (p.material as Material).opacity === 1))
  theatre.uninstall(); fade.uninstall()
})

test('large source textures reduce the visible batch without skipping any photos when paging', () => {
  const ctx = createViewerContext(normalizeViewerConfig({ quality: 'mid' }).config, Array.from({ length: 37 }, photo))
  ctx.photos.forEach(p => Object.assign(p.material, { map: { image: { width: 1024, height: 1024 } } }))
  const theatre = new PhotoTheatrePlugin(); theatre.install(ctx)
  ctx.emit('theatre:command', { type: 'mode', mode: 'cloud' })
  const batch = theatre.snapshot().indices.length
  assert.ok(batch < 24 && batch * 1024 * 1024 * 4 * 4 / 3 <= 64 * 1024 ** 2 * .8)
  const seen = new Set<number>()
  for (let i = 0; i < Math.ceil(37 / batch); i++) {
    theatre.snapshot().indices.forEach(index => seen.add(index))
    ctx.emit('theatre:command', { type: 'step', direction: 1 })
  }
  assert.equal(seen.size, 37)
  theatre.uninstall()
})
