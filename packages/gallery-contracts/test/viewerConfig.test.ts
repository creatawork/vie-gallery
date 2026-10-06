import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { normalizeViewerConfig, parseViewerConfig, serializeViewerConfig, mergeViewerConfig } from '../src/viewerConfig'

const cases = JSON.parse(readFileSync('packages/gallery-contracts/fixtures/viewer-config-cases.json', 'utf8'))
for (const fixture of cases) for (const mode of ['strict', 'legacy'] as const) {
  test(`${fixture.name} (${mode})`, () => {
    const result = parseViewerConfig(fixture.json, fixture.schemaVersion, mode)
    assert.equal(result.issues.length === 0, fixture[`${mode}Valid`])
    if (mode === 'strict' && !fixture.strictValid) assert.deepEqual(result.issues.map(i => i.path), fixture.issuePaths)
  })
}
test('legacy layout and unknown nested fields survive round trip', () => {
  const first = parseViewerConfig('{"layout":"helix","extension":{"label":"x"},"camera":{"thirdParty":3}}', 1, 'legacy')
  assert.equal(first.config.layout.mode, 'helix')
  assert.deepEqual(first.config.extension, { label: 'x' })
  assert.equal(first.config.camera.thirdParty, 3)
  const next = parseViewerConfig(serializeViewerConfig(first.config))
  assert.deepEqual(next.config, first.config)
  assert.deepEqual(next.issues, [])
})
test('partial merge keeps enabled and rejects invalid candidate', () => {
  const config = parseViewerConfig('{"particles":{"enabled":true,"density":1}}').config
  assert.equal(mergeViewerConfig(config, { particles: { density: 0 } }).particles.enabled, true)
  assert.equal(mergeViewerConfig(config, { particles: { density: 0 } }).particles.density, 0)
  assert.throws(() => mergeViewerConfig(config, { particles: { density: 3 } }))
  assert.equal(config.particles.density, 1)
})
test('dangerous keys are stripped recursively without prototype mutation', () => {
  const config = parseViewerConfig('{"__proto__":{"polluted":true},"extension":{"constructor":{},"value":1}}').config
  assert.deepEqual(config.extension, { value: 1 })
  assert.equal(Object.hasOwn(config, '__proto__'), false)
  assert.equal(({} as Record<string, unknown>).polluted, undefined)
})
test('UTF-8 size and depth limits apply before rendering', () => {
  assert.equal(parseViewerConfig(JSON.stringify({ note: '照'.repeat(23000) })).issues[0].path, 'config')
  let deep: unknown = 1
  for (let i = 0; i < 9; i++) deep = { next: deep }
  assert.equal(parseViewerConfig(JSON.stringify(deep)).issues[0].path, 'config')
})
test('invalid numeric JS input is diagnosed instead of rendered', () => {
  for (const density of [NaN, Infinity, -Infinity, -1, 3]) {
    const result = normalizeViewerConfig({ particles: { density } }, 'strict')
    assert.ok(result.issues.some(issue => issue.path === 'particles.density'))
    assert.equal(result.config.particles.density, 1)
  }
})
test('legacy preset names keep old layout and explicit values win', () => {
  assert.equal(parseViewerConfig('{"presetName":"minimal"}', 1, 'legacy').config.layout.mode, 'sphere')
  assert.equal(parseViewerConfig('{"presetName":"minimal","layout":{"mode":"helix"}}', 1, 'legacy').config.layout.mode, 'helix')
})
test('legacy bloom gains explicit old grading while neutral new config does not', () => {
  const old = parseViewerConfig('{"effects":{"bloom":{"enabled":true}}}', 1, 'legacy').config
  assert.equal(old.effects.postGrade?.enabled, true)
  assert.equal(old.effects.postGrade?.contrast, 1.08)
  assert.equal(parseViewerConfig('{}').config.effects.postGrade?.enabled, false)
  assert.equal(parseViewerConfig('{"effects":{"bloom":{"enabled":false}}}', 1, 'legacy').config.effects.postGrade?.enabled, false)
})
test('background image projection validates and builtin URLs gain equirectangular', () => {
  const builtin = normalizeViewerConfig({ background: { mode: 'image', color: '#000000', image: { url: '/g/backgrounds/minimal.webp' } } }).config
  assert.equal(builtin.background?.image?.projection, 'equirectangular')
  const custom = normalizeViewerConfig({ background: { mode: 'image', color: '#000000', image: { url: 'https://cdn.example.com/room.webp' } } }).config
  assert.equal(custom.background?.image?.projection, undefined)
  const explicit = normalizeViewerConfig({ background: { mode: 'image', color: '#000000', image: { url: '/g/backgrounds/minimal.webp', projection: 'flat' } } }).config
  assert.equal(explicit.background?.image?.projection, 'flat')
  const invalid = normalizeViewerConfig({ background: { mode: 'image', color: '#000000', image: { url: '/g/backgrounds/minimal.webp', projection: 'sphere' } } })
  assert.ok(invalid.issues.some(issue => issue.path === 'background.image.projection'))
})
test('legacy background type maps to mode and none wins over image fallback', () => {
  const legacy = normalizeViewerConfig({ background: { type: 'image', color: '#000000', image: { url: '/g/backgrounds/minimal.webp' } } }, 'legacy').config
  assert.equal(legacy.background?.mode, 'image')
  assert.equal(legacy.background?.image?.projection, 'equirectangular')
  const none = normalizeViewerConfig({ background: { type: 'none', color: '#000000', image: { url: '/g/backgrounds/minimal.webp' } } }, 'legacy').config
  assert.equal(none.background?.mode, 'none')
  assert.equal(none.background?.image, undefined)
})
test('all exposed numeric boundaries reject wrong types and out of range', () => {
  const boundaries = [
    ['layout.params.scale', .5, 2], ['layout.params.spacing', .5, 3], ['layout.params.radius', 100, 1500],
    ['layout.params.columns', 1, 12], ['layout.params.height', 100, 1500], ['layout.params.turns', .5, 6],
    ['layout.transition.duration', .2, 3], ['particles.density', 0, 2], ['particles.speed', 0, 2],
    ['particles.size', .5, 2], ['background.angle', 0, 360], ['effects.postGrade.saturation', 0, 2],
    ['effects.postGrade.brightness', .5, 1.5], ['effects.postGrade.contrast', .5, 1.5],
    ['effects.vignette.strength', 0, 1], ['effects.floatAmplitude', 0, 2], ['effects.floatSpeed', 0, 2],
    ['effects.entranceDuration', .2, 2], ['camera.rotateSpeed', 0, 2], ['camera.introDuration', .5, 4]
  ] as const
  for (const [path, min, max] of boundaries) for (const [value, valid] of [[min, true], [max, true], [min - .1, false], [max + 1, false], ['1', false], [null, false]] as const) {
    const input = path.split('.').reduceRight<unknown>((next, key) => ({ [key]: next }), value)
    const result = normalizeViewerConfig(input, 'strict')
    assert.equal(result.issues.length === 0, valid, `${path}=${value}`)
  }
})
test('serialize is deterministic and every nested default is a fresh object', () => {
  const a = parseViewerConfig('{"z":1,"a":2}').config
  const b = parseViewerConfig('{"a":2,"z":1}').config
  assert.equal(serializeViewerConfig(a), serializeViewerConfig(b))
  a.particles.types.push('snow')
  assert.deepEqual(parseViewerConfig('{}').config.particles.types, ['stars'])
})
