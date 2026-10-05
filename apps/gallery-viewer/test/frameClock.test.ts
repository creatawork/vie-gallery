import test from 'node:test'
import assert from 'node:assert/strict'
import { FrameClock } from '../src/core/FrameClock'
test('hidden time and first resumed frame never catch up; active delta is bounded', () => {
  const clock = new FrameClock()
  clock.resume(1000)
  assert.equal(clock.tick(1050).elapsed, .05)
  clock.suspend()
  assert.equal(clock.tick(8000).delta, 0)
  clock.resume(9000)
  assert.equal(clock.tick(9050).elapsed, .1)
  assert.ok(clock.tick(15000).delta <= .1)
})
