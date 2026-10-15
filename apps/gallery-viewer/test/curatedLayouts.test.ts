import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createRecommendedViewerConfig } from '@vie/gallery-contracts'
import { generateLayout } from '../src/lib/layouts'
import { LayoutPlugin } from '../src/plugins/LayoutPlugin'
import { createViewerContext, photo } from './helpers/viewerContext'

test('curated pairs stay centered and large collections retain spatial separation', () => {
  const config = createRecommendedViewerConfig()
  const pair = generateLayout(2, config.layout)
  assert.ok(Math.abs(pair[0].x + pair[1].x) < 1)
  assert.ok(Math.abs(pair[0].x - pair[1].x) >= 160)
  const many = generateLayout(50, config.layout)
  assert.ok(many[49].y - many[0].y >= 1500)
  for (let i = 1; i < many.length; i++) {
    const a = many[i - 1], b = many[i]
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) >= 120)
  }
})

test('portrait wave reflows into two columns without squeezing photographs together', () => {
  const config = createRecommendedViewerConfig()
  config.layout.mode = 'grid'
  const context = createViewerContext(config, Array.from({ length: 12 }, () => photo()))
  ;(context.camera as THREE.PerspectiveCamera).aspect = 390 / 844
  const plugin = new LayoutPlugin()
  plugin.install(context)
  const xs = [...new Set(context.photos.map(p => p.position.x))]
  assert.equal(xs.length, 2)
  assert.ok(Math.abs(xs[0] - xs[1]) >= 180)
  plugin.uninstall()
})
