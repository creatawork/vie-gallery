import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { ViewerEngine } from '../src/core/ViewerEngine'

test('intro flight replacing a framing flight balances both transition lifetimes', () => {
  const engine = Object.create(ViewerEngine.prototype) as ViewerEngine
  let activeTransitions = 1
  Object.assign(engine, {
    disposed: false,
    motionQuery: { matches: false },
    camera: new THREE.PerspectiveCamera(),
    controls: { target: new THREE.Vector3() },
    clock: { elapsed: 0 },
    pluginContext: { config: { camera: { introDuration: 2 } } },
    introFlight: { start: 0, duration: 1, from: new THREE.Vector3(), to: new THREE.Vector3() },
    notifyTransitionStart: () => { activeTransitions++ },
    notifyTransitionEnd: () => { activeTransitions-- }
  })
  Reflect.get(engine, 'playIntroFlight').call(engine)
  assert.equal(activeTransitions, 1, 'replacing a flight must release the previous transition')
  Reflect.get(engine, 'updateIntroFlight').call(engine, 2)
  assert.equal(activeTransitions, 0, 'completed flight allows idle throttling and quality sampling')
})
