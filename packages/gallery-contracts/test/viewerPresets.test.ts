import test from 'node:test'
import assert from 'node:assert/strict'
import { VIEWER_PRESETS, applyViewerPreset, restoreViewerPreset, createRecommendedViewerConfig, RECOMMENDED_SCENE_PRESET } from '../src/viewerPresets'
import { normalizeViewerConfig, serializeViewerConfig } from '../src/viewerConfig'
import { SCENE_BACKGROUND_VERSION, backgroundTextureUrl, sceneBackgroundThumbUrl, sceneBackgroundUrl } from '../src/galleryMedia'

test('scene background urls are versioned, thumbnailed and tiered by quality', () => {
  assert.equal(sceneBackgroundUrl('minimal'), `/g/backgrounds/minimal.webp?v=${SCENE_BACKGROUND_VERSION}`)
  assert.equal(sceneBackgroundThumbUrl('minimal'), `/g/backgrounds/thumbs/minimal.webp?v=${SCENE_BACKGROUND_VERSION}`)
  assert.equal(sceneBackgroundThumbUrl('not-a-scene'), undefined)
  assert.equal(backgroundTextureUrl(sceneBackgroundUrl('minimal'), 'low'), `/g/backgrounds/minimal-low.webp?v=${SCENE_BACKGROUND_VERSION}`)
  assert.equal(backgroundTextureUrl(sceneBackgroundUrl('minimal'), 'mid'), sceneBackgroundUrl('minimal'))
  assert.equal(backgroundTextureUrl(sceneBackgroundUrl('minimal'), 'high'), sceneBackgroundUrl('minimal'))
  const custom = 'https://cdn.example.com/room.webp'
  assert.equal(backgroundTextureUrl(custom, 'low'), custom)
  const unknownScene = '/g/backgrounds/not-a-scene.webp?v=1'
  assert.equal(backgroundTextureUrl(unknownScene, 'low'), unknownScene)
})

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
test('scene presets declare equirectangular image backgrounds', () => {
  for (const [name, scene] of Object.entries(VIEWER_PRESETS)) {
    assert.equal(scene.background?.mode, 'image', name)
    assert.equal(scene.background?.image?.projection, 'equirectangular', name)
    assert.equal(scene.background?.image?.url, sceneBackgroundUrl(name), name)
  }
})
test('historical preset-only config stays historical until a card is applied', () => {
  const old = normalizeViewerConfig({ presetName: 'minimal' }, 'legacy').config
  assert.equal(old.layout.mode, 'sphere')
  assert.equal(applyViewerPreset('minimal', old).layout.mode, 'grid')
  assert.equal(normalizeViewerConfig({ presetName: 'minimal', layout: 'helix' }, 'legacy').config.layout.mode, 'helix')
})

test('saved builtin background URLs load the current asset version at every quality', () => {
  for (const quality of ['low', 'mid', 'high'] as const) {
    const expected = quality === 'low' ? `/g/backgrounds/forest-dream-low.webp?v=${SCENE_BACKGROUND_VERSION}` : sceneBackgroundUrl('forest-dream')
    for (const url of ['/g/backgrounds/forest-dream.webp?v=2026-10-06', '/g/backgrounds/forest-dream.webp']) {
      assert.equal(backgroundTextureUrl(url, quality), expected)
    }
    for (const url of ['https://cdn.example.com/room.webp?v=old', '/g/backgrounds/not-a-scene.webp?v=old']) {
      assert.equal(backgroundTextureUrl(url, quality), url)
    }
  }
})

test('recommended scene is a canonical, valid, clone-isolated preset', () => {
  assert.equal(RECOMMENDED_SCENE_PRESET, 'starry-night')
  const recommended = createRecommendedViewerConfig() as typeof VIEWER_PRESETS['starry-night']
  assert.deepEqual(recommended, VIEWER_PRESETS['starry-night'])
  assert.equal(normalizeViewerConfig(recommended).issues.length, 0)
  assert.equal(recommended.background?.image?.projection, 'equirectangular')
  recommended.effects.bloom!.strength = 9
  recommended.presetName = 'mutated'
  assert.equal(VIEWER_PRESETS['starry-night'].effects.bloom!.strength, .5, 'preset registry must not be mutated')
  assert.equal(VIEWER_PRESETS['starry-night'].presetName, 'starry-night')
})
