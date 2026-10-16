import test from 'node:test'
import assert from 'node:assert/strict'
import { PHOTO_EFFECTS, PRESET_PHOTO_EFFECTS, PHOTO_ARRANGEMENTS, resolvePhotoEffect, resolvePhotoArrangement } from '../src/photoEffects'
import { VIEWER_PRESETS, applyViewerPreset } from '../src/viewerPresets'
import { normalizeViewerConfig, serializeViewerConfig, parseViewerConfig } from '../src/viewerConfig'
import { applyCuratedStyle } from '../src/curatedStyles'

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
  assert.equal(new Set(Object.values(VIEWER_PRESETS).filter(c => c.layout.params?.composition === 'curated').map(resolvePhotoArrangement)).size, PHOTO_ARRANGEMENTS.length)
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
