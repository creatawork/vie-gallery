import test from 'node:test'
import assert from 'node:assert/strict'
import { VIEWER_PRESETS, applyViewerPreset, restoreViewerPreset } from '../src/viewerPresets'
import { normalizeViewerConfig, serializeViewerConfig } from '../src/viewerConfig'

test('eight complete scenes are distinct, valid and clear previous scene effects', () => {
  const fingerprints = new Set<string>()
  assert.equal(Object.keys(VIEWER_PRESETS).length, 8)
  for (const [name, scene] of Object.entries(VIEWER_PRESETS)) {
    assert.equal(normalizeViewerConfig(scene).issues.length, 0, name)
    fingerprints.add(JSON.stringify([scene.layout, scene.particles, scene.background, scene.effects, scene.camera]))
    const minimal = applyViewerPreset('minimal', scene)
    assert.equal(minimal.particles.enabled, false)
    assert.equal(minimal.effects.bloom?.enabled, false)
    assert.equal(minimal.effects.vignette?.enabled, false)
    assert.equal(minimal.effects.postGrade?.enabled, false)
    assert.equal(minimal.camera?.autoRotate, false)
  }
  assert.equal(fingerprints.size, 8)
})
test('scene switch and restore preserve access, quality, audio and nested extensions', () => {
  const current = normalizeViewerConfig({ quality: 'low', visitorAllowDownload: true, extension: { label: 'kept' }, camera: { extension: true }, audio: { bgm: { enabled: true } } }).config
  const scene = applyViewerPreset('romantic', current)
  scene.effects.floatAmplitude = 2
  scene.customized = true
  const restored = restoreViewerPreset(scene)
  assert.equal(restored.effects.floatAmplitude, 1)
  assert.equal(restored.customized, false)
  assert.equal(restored.quality, 'low')
  assert.equal(restored.visitorAllowDownload, true)
  assert.deepEqual(restored.extension, { label: 'kept' })
  assert.equal(restored.camera?.extension, true)
  assert.equal(restored.audio.bgm?.enabled, true)
  assert.equal(serializeViewerConfig(scene).includes('kept'), true)
  assert.equal(VIEWER_PRESETS.romantic.effects.floatAmplitude, 1)
  const tinted = normalizeViewerConfig({ particles: { color: '#ff0000' }, layout: { params: { radius: 1500, extension: 'kept' } } }).config
  const minimal = applyViewerPreset('minimal', tinted)
  assert.equal(minimal.particles.color, undefined)
  assert.equal(minimal.layout.params?.radius, undefined)
  assert.equal(minimal.layout.params?.extension, 'kept')
})
test('historical preset-only config stays historical until a card is applied', () => {
  const old = normalizeViewerConfig({ presetName: 'minimal' }, 'legacy').config
  assert.equal(old.layout.mode, 'sphere')
  assert.equal(applyViewerPreset('minimal', old).layout.mode, 'grid')
  assert.equal(normalizeViewerConfig({ presetName: 'minimal', layout: 'helix' }, 'legacy').config.layout.mode, 'helix')
})
