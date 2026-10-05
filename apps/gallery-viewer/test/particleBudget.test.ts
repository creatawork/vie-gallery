import test from 'node:test'
import assert from 'node:assert/strict'
import { allocateParticleCounts } from '../src/lib/particleBudget'
const base = { stars: 1200, snow: 800, hearts: 130, sakura: 200, fireflies: 240, meteors: 22 }
test('density and combined budget determine integer counts including zero', () => {
  assert.equal(Object.values(allocateParticleCounts(base, ['stars', 'snow'], 0, 200)).reduce((a, b) => a + b), 0)
  assert.equal(allocateParticleCounts(base, ['stars'], .5, 1600).stars, 600)
  for (const budget of [0, 200, 700, 1600]) {
    const counts = allocateParticleCounts(base, Object.keys(base) as never, 2, budget)
    assert.equal(Object.values(counts).reduce((a, b) => a + b), budget)
    assert.ok(Object.values(counts).every(Number.isInteger))
  }
})
