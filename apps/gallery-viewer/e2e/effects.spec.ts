import { test, expect } from '@playwright/test'
import { VIEWER_PRESETS } from '@vie/gallery-contracts'
import { mockGallery } from './helpers/mockGallery'

test('grading and vignette render independently with neutral disabled uniforms', async ({ page }, info) => {
  const { errors } = await mockGallery(page, { config: { quality: 'mid', layout: { mode: 'grid' }, particles: { enabled: false }, effects: { bloom: { enabled: false }, photoFloat: false, photoEntrance: 'none', postGrade: { enabled: true, saturation: 0 } } } })
  await page.goto('/g/effects-fixture')
  await expect.poll(() => page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot().postProcessing.grading)).toBe(true)
  await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.freezeTime(3))
  const canvas = page.locator('canvas').first()
  const gray = await canvas.screenshot({ path: info.outputPath('gray.png') })
  expect(await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot().postProcessing.uniforms.saturation)).toBe(0)
  await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.requestConfig({ effects: { postGrade: { enabled: false } } }))
  const neutral = await canvas.screenshot({ path: info.outputPath('neutral.png') })
  expect(gray.equals(neutral)).toBe(false)
  await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.requestConfig({ effects: { vignette: { enabled: true, strength: 1 } } }))
  const vignette = await canvas.screenshot({ path: info.outputPath('vignette.png') })
  expect(vignette.equals(neutral)).toBe(false)
  const state = await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot().postProcessing)
  expect(state).toMatchObject({ bloom: false, grading: false, vignette: true, uniforms: { brightness: 1, contrast: 1, saturation: 1, vignette: 1 } })
  expect(errors).toEqual([])
})

test('optional compositor failure keeps photos and controls available and supports retry', async ({ page }) => {
  const { errors } = await mockGallery(page)
  await page.route('**/src/core/PostProcessing.ts', async route => {
    const response = await route.fetch()
    const source = await response.text()
    const patched = source.replace(/new EffectComposer\((\w+)\)/, (_match, renderer) => `(() => { if (!globalThis.__injectedPostFailure) { globalThis.__injectedPostFailure = true; throw new Error('injected composer failure'); } return new EffectComposer(${renderer}); })()`)
    expect(patched).not.toBe(source)
    await route.fulfill({ response, body: patched })
  })
  await page.goto('/g/effects-fixture')
  await expect(page.getByText('已使用基础显示效果', { exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__?.photoMeshIds().length)).toBe(12)
  expect(await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot().requestedConfig.effects.bloom?.enabled)).toBe(true)
  expect(await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot().postProcessing.bloom)).toBe(false)
  await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.requestConfig({ effects: { bloom: { enabled: true } } }))
  expect(await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot().postProcessing.bloom)).toBe(true)
  await expect(page.locator('canvas').first()).toBeVisible()
  expect(errors).toEqual([])
})

test('eight scene backgrounds and output chains switch without shader errors', async ({ page }, info) => {
  const { errors } = await mockGallery(page, { config: { quality: 'mid', particles: { enabled: false } } })
  await page.goto('/g/effects-fixture')
  await expect.poll(() => page.evaluate(() => !!window.__VIE_VIEWER_DIAGNOSTICS__)).toBe(true)
  await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.freezeTime(4))
  for (const [name, preset] of Object.entries(VIEWER_PRESETS)) {
    await page.evaluate(config => window.__VIE_VIEWER_DIAGNOSTICS__!.requestConfig(config), { ...preset, camera: { ...preset.camera, autoRotate: false }, layout: { ...preset.layout, transition: { style: 'none', duration: .2 } }, effects: { ...preset.effects, photoEntrance: 'none' } })
    await page.locator('canvas').first().screenshot({ path: info.outputPath(`${name}.png`) })
    const state = await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__!.snapshot().postProcessing)
    expect(state.bloom).toBe(preset.effects.bloom!.enabled)
    expect(state.grading).toBe(preset.effects.postGrade!.enabled)
    expect(state.vignette).toBe(preset.effects.vignette!.enabled)
  }
  expect(errors).toEqual([])
})
