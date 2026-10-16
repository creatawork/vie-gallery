import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import type { Pass } from 'three/examples/jsm/postprocessing/Pass.js'
import { PostProcessing } from '../src/core/PostProcessing'
import { normalizeViewerConfig } from '@vie/gallery-contracts'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

test('paper presentation limits bloom temporarily and restores authored values without rebuilding passes', () => {
  let bloom: UnrealBloomPass | undefined, created = 0
  const pipeline = new PostProcessing({} as THREE.WebGLRenderer, new THREE.Scene(), new THREE.PerspectiveCamera(), () => {
    created++
    return { addPass: pass => { if (pass instanceof UnrealBloomPass) bloom = pass }, setPixelRatio: () => {}, setSize: () => {}, render: () => {}, dispose: () => {} }
  })
  pipeline.apply({ bloom: { enabled: true, strength: 1.2, threshold: .2 } })
  pipeline.render(.016, true)
  assert.ok(bloom!.strength > 0 && bloom!.strength < .12)
  assert.ok(bloom!.threshold > .85 && bloom!.threshold < 1)
  pipeline.render(.016)
  assert.equal(bloom!.strength, 1.2)
  assert.equal(bloom!.threshold, .2)
  assert.equal(created, 1)
  pipeline.dispose()
})
test('large photographs retain highlight detail without changing authored bloom or rebuilding passes', () => {
  let bloom: UnrealBloomPass | undefined, created = 0
  const pipeline = new PostProcessing({} as THREE.WebGLRenderer, new THREE.Scene(), new THREE.PerspectiveCamera(), () => {
    created++
    return { addPass: pass => { if (pass instanceof UnrealBloomPass) bloom = pass }, setPixelRatio: () => {}, setSize: () => {}, render: () => {}, dispose: () => {} }
  })
  const effects = { bloom: { enabled: true, strength: 1.1, threshold: .15 } }
  pipeline.apply(effects)
  pipeline.render(.016, false, true)
  assert.ok(bloom!.strength > 0 && bloom!.strength < .18)
  assert.ok(bloom!.threshold > .85 && bloom!.threshold < 1)
  assert.deepEqual(effects.bloom, { enabled: true, strength: 1.1, threshold: .15 })
  pipeline.render(.016)
  assert.equal(bloom!.strength, 1.1)
  assert.equal(bloom!.threshold, .15)
  pipeline.apply({ bloom: { enabled: true, strength: .06, threshold: .95 } })
  pipeline.render(.016, false, true)
  assert.ok(bloom!.strength > 0 && bloom!.strength < .06)
  assert.ok(bloom!.threshold > .95 && bloom!.threshold < 1)
  assert.equal(created, 1)
  pipeline.dispose()
})
test('protected photo and paper bloom controls respond monotonically over the complete slider ranges', () => {
  let bloom: UnrealBloomPass | undefined
  const pipeline = new PostProcessing({} as THREE.WebGLRenderer, new THREE.Scene(), new THREE.PerspectiveCamera(), () => ({
    addPass: pass => { if (pass instanceof UnrealBloomPass) bloom = pass }, setPixelRatio: () => {}, setSize: () => {}, render: () => {}, dispose: () => {},
  }))
  for (const paper of [false, true]) {
    let previousStrength = -1, previousThreshold = -1
    for (const [strength, threshold] of [[0, 0], [.01, .1], [.18, .25], [.5, .5], [1, .85], [2, 1]]) {
      pipeline.apply({ bloom: { enabled: true, strength, threshold } })
      pipeline.render(.016, paper, true)
      assert.ok(bloom!.strength > previousStrength, `strength ${strength} must still respond in ${paper ? 'paper' : 'photo'} mode`)
      assert.ok(bloom!.threshold > previousThreshold, `threshold ${threshold} must still respond in ${paper ? 'paper' : 'photo'} mode`)
      assert.ok(bloom!.strength >= 0 && bloom!.strength < (paper ? .12 : .18))
      assert.ok(bloom!.threshold >= .85 && bloom!.threshold <= 1)
      previousStrength = bloom!.strength; previousThreshold = bloom!.threshold
      pipeline.render(.016)
      assert.equal(bloom!.strength, strength)
      assert.equal(bloom!.threshold, threshold)
    }
  }
  pipeline.dispose()
})
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
