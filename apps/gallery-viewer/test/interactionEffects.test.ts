import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createRecommendedViewerConfig } from '@vie/gallery-contracts'
import { ClickRipplePlugin } from '../src/plugins/ClickRipplePlugin'
import { CursorTrailPlugin } from '../src/plugins/CursorTrailPlugin'
import { createViewerContext, photo } from './helpers/viewerContext'

function fixture(embedded = false) {
  const context = createViewerContext(createRecommendedViewerConfig(), [photo()])
  context.config.interaction.clickRipple = true
  const canvas = Object.assign(new EventTarget(), {
    getBoundingClientRect: () => embedded
      ? { left: 400, top: 100, width: 800, height: 400 }
      : { left: 0, top: 0, width: 1600, height: 900 }
  })
  Object.assign(context.renderer, { domElement: canvas, info: { render: { frame: 600 } } })
  const camera = context.camera as THREE.PerspectiveCamera
  camera.position.z = 300
  camera.aspect = embedded ? 2 : 1600 / 900
  camera.updateProjectionMatrix(); camera.updateMatrixWorld()
  context.photos[0].updateMatrixWorld()
  context.now = () => 120
  return { context, canvas }
}

function pointer(canvas: EventTarget, type: string, values: Record<string, unknown>) {
  const event = new Event(type)
  Object.assign(event, values)
  canvas.dispatchEvent(event)
}

test('click ripples hit the actual canvas in an embedded preview', t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { innerWidth: 1600, innerHeight: 900 } })
  t.after(() => previous ? Object.defineProperty(globalThis, 'window', previous) : Reflect.deleteProperty(globalThis, 'window'))
  const { context, canvas } = fixture(true)
  const effect = new ClickRipplePlugin()
  effect.install(context)
  pointer(canvas, 'click', { clientX: 800, clientY: 300 })
  assert.equal(context.scene.children.length, 1)
  effect.uninstall()
  assert.equal(context.scene.children.length, 0)
})

test('click ripples use active scene time after long periods of throttled rendering', t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { innerWidth: 1600, innerHeight: 900 } })
  t.after(() => previous ? Object.defineProperty(globalThis, 'window', previous) : Reflect.deleteProperty(globalThis, 'window'))
  const { context, canvas } = fixture()
  const effect = new ClickRipplePlugin()
  effect.install(context)
  pointer(canvas, 'click', { clientX: 800, clientY: 450 })
  effect.update(.016, 120.016)
  assert.equal(context.scene.children.length, 1, 'the feedback remains visible for its full lifetime')
  effect.update(.8, 121)
  assert.equal(context.scene.children.length, 0)
  effect.uninstall()
})

test('cursor trails respect reduced motion and leave touch gestures clear', () => {
  const { context, canvas } = fixture()
  const effect = new CursorTrailPlugin()
  let reduced = true
  context.reducedMotion = () => reduced
  effect.install(context)
  const points = context.scene.children[0] as THREE.Points
  const life = points.geometry.getAttribute('aLife')
  pointer(canvas, 'pointermove', { clientX: 800, clientY: 450, pointerType: 'mouse', buttons: 0 })
  assert.ok(Array.from(life.array).every(value => value === 0))
  reduced = false
  pointer(canvas, 'pointermove', { clientX: 800, clientY: 450, pointerType: 'touch', buttons: 1 })
  assert.ok(Array.from(life.array).every(value => value === 0))
  pointer(canvas, 'pointermove', { clientX: 800, clientY: 450, pointerType: 'mouse', buttons: 0 })
  assert.ok(Array.from(life.array).some(value => value > 0))
  reduced = true
  effect.update(.016, 120)
  assert.equal(points.visible, false, 'changing the OS preference hides live animated feedback')
  effect.uninstall()
})
