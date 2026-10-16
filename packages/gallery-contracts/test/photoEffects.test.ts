import test from 'node:test'
import assert from 'node:assert/strict'
import { PHOTO_EFFECTS, PRESET_PHOTO_EFFECTS, PHOTO_ARRANGEMENTS, resolvePhotoEffect, resolvePhotoArrangement } from '../src/photoEffects'
import { VIEWER_PRESETS, applyViewerPreset } from '../src/viewerPresets'
import { normalizeViewerConfig, serializeViewerConfig, parseViewerConfig } from '../src/viewerConfig'
import { CURATED_STYLES, applyCuratedStyle, applyPhotoArrangement, resolveCuratedStyle } from '../src/curatedStyles'

test('all presets have a unique photograph treatment independent of background and particles', () => {
  assert.equal(new Set(Object.values(VIEWER_PRESETS).map(config => config.effects.photo?.style)).size, 16)
  assert.equal(PHOTO_EFFECTS.length, 17)
  for (const [name, config] of Object.entries(VIEWER_PRESETS)) {
    assert.deepEqual(parseViewerConfig(serializeViewerConfig(config)).config.effects.photo, PRESET_PHOTO_EFFECTS[name])
    const changed = applyViewerPreset(name as keyof typeof VIEWER_PRESETS, normalizeViewerConfig({ effects: { photo: { style: 'contact', intensity: 0, speed: 2, extension: 'keep' } } }).config)
    assert.equal(changed.effects.photo?.style, PRESET_PHOTO_EFFECTS[name].style)
    assert.equal(changed.effects.photo?.intensity, PRESET_PHOTO_EFFECTS[name].intensity)
    assert.equal((changed.effects.photo as Record<string, unknown>).extension, 'keep')
  }
  const arrangements = new Set(PHOTO_ARRANGEMENTS.map(item => item.id))
  for (const config of Object.values(VIEWER_PRESETS)) assert.ok(arrangements.has(resolvePhotoArrangement(config)))
  for (const mode of ['book', 'tunnel'] as const) {
    const changed = applyCuratedStyle(normalizeViewerConfig({}).config, mode)
    assert.equal(resolvePhotoArrangement(parseViewerConfig(serializeViewerConfig(changed)).config), mode)
  }
})

test('historical untouched presets get effects, custom photographs and explicit off keep their intent', () => {
  const old = normalizeViewerConfig({ presetName: 'deep-ocean' }, 'legacy').config
  assert.equal(resolvePhotoEffect(old).style, 'ripple')
  assert.equal(old.effects.photo, undefined, 'rendering fallback never rewrites stored history')
  old.customized = true
  assert.equal(resolvePhotoEffect(old).style, 'none')
  old.customized = false
  old.effects.photo = { style: 'none', intensity: 0, speed: 0 }
  assert.deepEqual(resolvePhotoEffect(old), old.effects.photo)
  assert.equal(resolvePhotoEffect(normalizeViewerConfig({ presetName: 'toString' }).config).style, 'none')
})

test('visitor layout changes retain the visible treatment of historical presets', () => {
  const old = normalizeViewerConfig({ presetName: 'deep-ocean' }, 'legacy').config
  const changed = applyCuratedStyle(old, 'carousel')
  assert.equal(changed.customized, true)
  assert.equal(resolvePhotoEffect(changed).style, 'ripple')
  assert.equal(resolvePhotoArrangement(changed), 'arc')
  assert.equal(old.effects.photo, undefined)
})

test('composition selection uses one canonical geometry and retains authored fine tuning', () => {
  const current = normalizeViewerConfig({
    presetName: 'deep-ocean', layout: { mode: 'sphere', params: { scale: 1.25, spacing: 1.5, radius: 470, extension: 'kept' }, transition: { style: 'burst', duration: 1.7 } },
    background: { mode: 'solid', color: '#123456' }, particles: { enabled: false },
    quality: 'low', audio: { bgm: { enabled: true } }
  }, 'legacy').config
  const before = structuredClone(current)
  for (const arrangement of PHOTO_ARRANGEMENTS) {
    const next = applyPhotoArrangement(current, arrangement.id)
    assert.equal(next.customized, true)
    assert.equal(next.layout.mode, arrangement.mode)
    assert.equal(next.layout.params?.composition, 'curated')
    assert.equal(next.layout.params?.arrangement, arrangement.id)
    assert.equal(next.layout.params?.scale, 1.25)
    assert.equal(next.layout.params?.spacing, 1.5)
    assert.equal(next.layout.params?.radius, 470)
    assert.equal(next.layout.params?.extension, 'kept')
    assert.equal(next.layout.transition?.style, 'smooth')
    assert.equal(next.layout.transition?.duration, 1.7)
    assert.equal(resolvePhotoEffect(next).style, 'ripple', 'historical treatment survives the first edit')
    for (const key of ['background', 'particles', 'camera', 'lighting', 'interaction', 'audio', 'quality'] as const) assert.deepEqual(next[key], before[key], key)
    assert.deepEqual(parseViewerConfig(serializeViewerConfig(next)).config, next)
  }
  assert.deepEqual(current, before, 'selection does not mutate the saved config')
})

test('composition selection preserves explicit no motion and original photo treatment', () => {
  const current = normalizeViewerConfig({
    layout: { transition: { style: 'none' } }, effects: { photo: { style: 'none', intensity: 0, speed: 0 } }
  }).config
  const next = applyPhotoArrangement(current, 'book')
  assert.equal(next.layout.transition?.style, 'none')
  assert.deepEqual(next.effects.photo, current.effects.photo)
})

test('editing a partial historical treatment captures its visible defaults before customization', () => {
  const current = normalizeViewerConfig({ presetName: 'deep-ocean', effects: { photo: { intensity: .35, extension: 'kept' } } }, 'legacy').config
  const displayed = resolvePhotoEffect(current)
  const next = applyPhotoArrangement(current, 'book')
  assert.deepEqual(resolvePhotoEffect(next), displayed)
  assert.equal((next.effects.photo as Record<string, unknown>).extension, 'kept')
  assert.deepEqual(current.effects.photo, { intensity: .35, extension: 'kept' })
})

test('quick style selection reflects rendered book and tunnel, without mislabeling specialized or spatial layouts', () => {
  const current = normalizeViewerConfig({}).config
  for (const style of CURATED_STYLES) {
    const next = applyCuratedStyle(current, style.id)
    assert.equal(resolveCuratedStyle(next), style.id)
    if (style.id === 'book' || style.id === 'tunnel') assert.equal(next.layout.mode, 'helix')
  }
  for (const arrangement of ['orbit', 'filmstrip', 'fan', 'cascade', 'stack'] as const) {
    assert.equal(resolveCuratedStyle(applyPhotoArrangement(current, arrangement)), undefined)
  }
  assert.equal(resolveCuratedStyle(normalizeViewerConfig({ layout: { mode: 'helix' } }).config), undefined)
  const historical = normalizeViewerConfig({ presetName: 'deep-ocean', layout: { mode: 'grid', params: { composition: 'curated' } } }, 'legacy').config
  assert.equal(resolveCuratedStyle(historical), 'grid')
  assert.equal(historical.layout.params?.arrangement, undefined, 'reading selection never rewrites history')
})
