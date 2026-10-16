import test from 'node:test'
import assert from 'node:assert/strict'
import { VIEWER_PRESETS, VIEWER_PRESET_CARDS, applyViewerPreset, restoreViewerPreset, createRecommendedViewerConfig, RECOMMENDED_SCENE_PRESET } from '../src/viewerPresets'
import { normalizeViewerConfig, serializeViewerConfig } from '../src/viewerConfig'
import { SCENE_BACKGROUND_VERSION, backgroundTextureUrl, sceneBackgroundThumbUrl, sceneBackgroundUrl } from '../src/galleryMedia'
import { applyCuratedStyle } from '../src/curatedStyles'
import { PHOTO_EFFECTS, PHOTO_ARRANGEMENTS, resolvePhotoArrangement } from '../src/photoEffects'

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

test('sixteen complete scenes are distinct, valid and clear previous scene effects', () => {
  const fingerprints = new Set<string>()
  assert.equal(Object.keys(VIEWER_PRESETS).length, 16)
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
  assert.equal(fingerprints.size, 16)
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
    if (scene.background?.mode !== 'image') continue
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

test('recommended scene is a valid, clone-isolated curated helix without a background download', () => {
  assert.equal(RECOMMENDED_SCENE_PRESET, 'jade-flow')
  const recommended = createRecommendedViewerConfig() as typeof VIEWER_PRESETS['starry-night']
  assert.equal(recommended.layout.mode, 'helix')
  assert.equal(recommended.layout.params?.composition, 'curated')
  assert.equal(normalizeViewerConfig(recommended).issues.length, 0)
  assert.equal(recommended.background?.mode, 'gradient')
  assert.equal(recommended.background?.color, '#111a17')
  assert.equal(recommended.background?.secondaryColor, '#263b32')
  assert.deepEqual(recommended, VIEWER_PRESETS[RECOMMENDED_SCENE_PRESET])
  assert.equal(recommended.customized, false)
  recommended.effects.bloom!.strength = 9
  recommended.presetName = 'mutated'
  assert.equal(VIEWER_PRESETS['starry-night'].effects.bloom!.strength, .5, 'preset registry must not be mutated')
  assert.equal(VIEWER_PRESETS['starry-night'].presetName, 'starry-night')
})

test('every preset replaces composition and background motion without losing nested extensions', () => {
  for (const preset of Object.keys(VIEWER_PRESETS) as (keyof typeof VIEWER_PRESETS)[]) {
    for (const previous of Object.values(VIEWER_PRESETS)) {
      const current = structuredClone(previous)
      current.layout.params!.extension = 'preserved'
      current.layout.params!.cellW = 999
      current.layout.params!.rx = 999
      const next = applyViewerPreset(preset, current)
      assert.equal(next.layout.params?.composition, VIEWER_PRESETS[preset].layout.params?.composition)
      assert.equal(next.background?.motion, VIEWER_PRESETS[preset].background?.motion)
      assert.equal(next.background?.mode, VIEWER_PRESETS[preset].background?.mode)
      assert.equal(next.layout.params?.extension, 'preserved')
      assert.equal(next.layout.params?.cellW, undefined)
      assert.equal(next.layout.params?.rx, undefined)
      if (next.background?.mode !== 'image') assert.equal(next.background?.image, undefined)
    }
  }
})

test('visitor composition controls preserve the authored atmosphere', () => {
  const current = structuredClone(VIEWER_PRESETS['forest-dream'])
  const next = applyCuratedStyle(current, 'carousel')
  assert.equal(next.layout.mode, 'carousel')
  assert.equal(next.layout.params?.composition, 'curated')
  for (const key of ['background', 'particles', 'effects', 'lighting', 'camera', 'interaction'] as const) assert.deepEqual(next[key], current[key], key)
})

test('style cards describe their actual treatment, composition and palette', () => {
  assert.deepEqual(VIEWER_PRESET_CARDS.map(card => card.name).sort(), Object.keys(VIEWER_PRESETS).sort())
  for (const card of VIEWER_PRESET_CARDS) {
    const preset = VIEWER_PRESETS[card.name]
    const treatment = PHOTO_EFFECTS.find(item => item.id === preset.effects.photo?.style)!
    assert.ok(card.hint.includes(treatment.label), card.name)
    assert.ok(card.description.startsWith('适合'), card.name)
    assert.match(card.accent, /^#[0-9a-f]{6}$/i)
    if (preset.layout.params?.composition === 'curated') {
      const arrangement = PHOTO_ARRANGEMENTS.find(item => item.id === resolvePhotoArrangement(preset))!
      assert.equal(card.category, 'light')
      assert.ok(card.hint.includes(arrangement.label))
      assert.equal(preset.layout.mode, arrangement.mode, card.name)
    } else {
      assert.equal(card.category, 'panorama')
      assert.ok(card.hint.includes('360° 全景'))
    }
  }
})
