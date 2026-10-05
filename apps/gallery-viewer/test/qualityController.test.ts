import test from 'node:test'
import assert from 'node:assert/strict'
import { QualityController, QUALITY_BUDGETS, initialQuality, type QualitySample } from '../src/core/QualityController'
const sample = (nowMs: number, fps: number, patch: Partial<QualitySample> = {}): QualitySample => ({ nowMs, fps, idle: false, hidden: false, loading: false, transitioning: false, contextLost: false, ...patch })
test('device auto start and manual quality ceilings are explicit', () => {
  assert.equal(initialQuality('auto', true), 'low'); assert.equal(initialQuality('auto', false), 'mid')
  assert.equal(initialQuality('high', true), 'high')
  const controller = new QualityController('low', 'low', 0)
  for (let i = 1; i <= 30; i++) assert.equal(controller.sample(sample(i * 1000, 60)).quality, 'low')
  assert.deepEqual(QUALITY_BUDGETS.low, { dpr: 1, maxEdge: 512, bytes: 32 * 1024 ** 2, concurrent: 2, resident: 32, particles: 200, postScale: .5 })
})
test('three consecutive bad windows lower one tier and cooldown discards windows', () => {
  const controller = new QualityController('high', 'high', 0)
  assert.equal(controller.sample(sample(1000, 25)).quality, 'high')
  assert.equal(controller.sample(sample(2000, 25)).quality, 'high')
  assert.equal(controller.sample(sample(3000, 25)).quality, 'mid')
  for (let i = 4; i <= 12; i++) assert.equal(controller.sample(sample(i * 1000, 25)).quality, 'mid')
  assert.equal(controller.sample(sample(13000, 25)).quality, 'mid')
  assert.equal(controller.sample(sample(14000, 25)).quality, 'mid')
  assert.equal(controller.sample(sample(15000, 25)).quality, 'low')
})
test('fractional performance timestamps count complete sampling windows', () => {
  const start = 1000.1, controller = new QualityController('high', 'high', start)
  for (let i = 1; i < 3; i++) assert.equal(controller.sample(sample(start + i * 1000, 25)).quality, 'high')
  assert.equal(controller.sample(sample(start + 3000, 25)).quality, 'mid')
})
test('eight healthy windows recover one tier with a ceiling and cooldown', () => {
  const controller = new QualityController('low', 'mid', 0)
  for (let i = 1; i < 8; i++) assert.equal(controller.sample(sample(i * 1000, 55)).quality, 'low')
  assert.equal(controller.sample(sample(8000, 55)).quality, 'mid')
  for (let i = 9; i <= 40; i++) assert.equal(controller.sample(sample(i * 1000, 60)).quality, 'mid')
})
test('idle, hidden, loading, transitions and context loss reset consecutive evidence', () => {
  for (const flag of ['idle', 'hidden', 'loading', 'transitioning', 'contextLost'] as const) {
    const controller = new QualityController('mid', 'high', 0)
    controller.sample(sample(1000, 20)); controller.sample(sample(2000, 20))
    for (let i = 3; i <= 15; i++) assert.equal(controller.sample(sample(i * 1000, 10, { [flag]: true })).quality, 'mid')
    assert.equal(controller.sample(sample(16000, 20)).quality, 'mid')
    assert.equal(controller.sample(sample(17000, 20)).quality, 'mid')
  }
})
test('low quality falls back after five valid seconds below 20, never hidden time or repeated timestamps', () => {
  const controller = new QualityController('low', 'high', 0)
  for (let i = 1; i < 5; i++) assert.equal(controller.sample(sample(i * 1000, 19)).fallback2D, false)
  assert.equal(controller.sample(sample(5000, 19)).fallback2D, true)
  controller.reset(9000)
  assert.equal(controller.sample(sample(9000, 19)).fallback2D, false)
  assert.equal(controller.sample(sample(19000, 19, { hidden: true })).fallback2D, false)
  for (let i = 1; i <= 20; i++) assert.equal(controller.sample(sample(20000, 19)).fallback2D, false)
})
test('threshold boundaries and interrupted evidence never oscillate', () => {
  const controller = new QualityController('mid', 'high', 0)
  for (let i = 1; i <= 30; i++) assert.equal(controller.sample(sample(i * 1000, i % 3 === 0 ? 30 : 29)).quality, 'mid')
  for (let i = 31; i <= 45; i++) assert.equal(controller.sample(sample(i * 1000, i % 8 === 0 ? 54 : 55)).quality, 'mid')
})
