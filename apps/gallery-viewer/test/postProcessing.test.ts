import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import type { Pass } from 'three/examples/jsm/postprocessing/Pass.js'
import { PostProcessing } from '../src/core/PostProcessing'
import { normalizeViewerConfig } from '@vie/gallery-contracts'
test('independent grading, neutral uniforms, real dimensions and explicit disposal', () => {
  let created = 0, disposed = 0, targets = 0
  let passes: Pass[] = []
  const pipeline = new PostProcessing({} as THREE.WebGLRenderer, new THREE.Scene(), new THREE.PerspectiveCamera(), () => {
    created++; passes = []
    return { addPass: pass => {
      passes.push(pass)
      const original = pass.dispose.bind(pass)
      pass.dispose = () => { disposed++; original() }
    }, setPixelRatio: () => {}, setSize: () => {}, render: () => {}, dispose: () => targets++ }
  })
  const neutral = normalizeViewerConfig({ effects: { bloom: { enabled: false } } }).config.effects
  pipeline.apply(neutral)
  assert.equal(created, 0)
  assert.deepEqual(pipeline.getState().uniforms, { brightness: 1, contrast: 1, saturation: 1, vignette: 0 })
  pipeline.apply({ ...neutral, postGrade: { enabled: true, saturation: 0 } })
  assert.equal(passes.length, 3)
  assert.equal(pipeline.getState().bloom, false)
  assert.equal(pipeline.getState().grading, true)
  pipeline.resize(640, 360, 1.5, .75)
  assert.equal(pipeline.getState().width, 720)
  assert.equal(pipeline.getState().height, 405)
  pipeline.apply({ ...neutral, vignette: { enabled: true, strength: .3 } })
  assert.equal(pipeline.getState().uniforms.saturation, 1)
  assert.equal(pipeline.getState().uniforms.vignette, .3)
  pipeline.dispose()
  assert.equal(disposed, created * 3)
  assert.equal(targets, created)
})
test('bloom parameter changes preserve passes; construction failure leaves no active chain and can retry', () => {
  let failed = true, created = 0
  const pipeline = new PostProcessing({} as THREE.WebGLRenderer, new THREE.Scene(), new THREE.PerspectiveCamera(), () => {
    if (failed) throw Error('injected composer failure')
    created++
    return { addPass: () => {}, setPixelRatio: () => {}, setSize: () => {}, render: () => {}, dispose: () => {} }
  })
  const effects = normalizeViewerConfig({}).config.effects
  assert.throws(() => pipeline.apply(effects))
  assert.equal(pipeline.getState().bloom, false)
  failed = false; pipeline.apply(effects)
  pipeline.apply({ ...effects, bloom: { enabled: true, strength: .2 } })
  assert.equal(created, 1)
  pipeline.dispose()
})
