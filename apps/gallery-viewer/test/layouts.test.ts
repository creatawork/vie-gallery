import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeViewerConfig, mergeViewerConfig } from '@vie/gallery-contracts'
import { generateLayout, sphereLayout } from '../src/lib/layouts'
import { LayoutPlugin } from '../src/plugins/LayoutPlugin'
import { createViewerContext, photo } from './helpers/viewerContext'
test('all six layouts scale spacing at small and large counts, keeping old axis options', () => {
  for (const mode of ['sphere', 'carousel', 'helix', 'grid', 'spiral', 'random'] as const) {
    for (const count of [1, 2, 3, 50]) {
      const layout = normalizeViewerConfig({ layout: { mode, params: { radius: 400 } } }).config.layout
      const a = generateLayout(count, layout)
      const b = generateLayout(count, { ...layout, params: { ...layout.params, spacing: 2 } })
      assert.equal(a.length, count)
      a.forEach((p, i) => { for (const axis of ['x', 'y', 'z'] as const) assert.ok(Math.abs(b[i][axis] - p[axis] * 2) < 1e-6) })
    }
  }
  assert.deepEqual(generateLayout(50, { mode: 'sphere', params: { rx: 350, ry: 230, rz: 420 } }), sphereLayout(50, { rx: 350, ry: 230, rz: 420 }))
  const helix = generateLayout(50, { mode: 'helix', params: { height: 800, turns: 2 } })
  assert.equal(helix[49].y - helix[0].y, 800)
  assert.notEqual(helix[10].x, generateLayout(50, { mode: 'helix', params: { turns: 3 } })[10].x)
  const grid = generateLayout(50, { mode: 'grid', params: { columns: 2 } })
  assert.equal(grid[0].y, grid[1].y)
  assert.notEqual(grid[1].y, grid[2].y)
})
test('layout hot parameters and scale apply without leaked listeners or transitions', () => {
  const context = createViewerContext(normalizeViewerConfig({ effects: { photoFloat: false }, layout: { transition: { style: 'none' } } }).config, [photo(), photo(), photo()])
  let starts = 0, ends = 0, applied = 0
  context.on('transition:start', () => starts++)
  context.on('transition:end', () => ends++)
  context.on('layout:applied', () => applied++)
  const plugin = new LayoutPlugin()
  for (let i = 0; i < 3; i++) { plugin.install(context); plugin.uninstall() }
  assert.equal(context.bus.listenerCount('config:update'), 0)
  plugin.install(context)
  const old = context.photos[0].position.x
  context.config = mergeViewerConfig(context.config, { layout: { params: { spacing: 2, scale: 1.5 } } })
  const before = applied
  context.emit('config:update', context.config)
  assert.equal(applied, before + 1)
  assert.equal(context.photos[0].position.x, old * 2)
  assert.equal(context.photos[0].scale.x, 1.5)
  assert.equal(context.photos[0].scale.y, 1.5)
  context.config = mergeViewerConfig(context.config, { layout: { mode: 'helix', transition: { style: 'burst' } } })
  context.emit('config:update', context.config)
  context.config = mergeViewerConfig(context.config, { layout: { mode: 'carousel' } })
  context.emit('config:update', context.config)
  plugin.uninstall()
  assert.equal(starts, ends)
})
