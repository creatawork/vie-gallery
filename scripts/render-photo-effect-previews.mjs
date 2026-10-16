// Captures the production photo shader, using the same local photograph in all 16 cards.
// Start the viewer dev server, then: node scripts/render-photo-effect-previews.mjs
import { chromium } from '@playwright/test'
import { build } from 'esbuild'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const origin = process.env.VIEWER_URL || 'http://127.0.0.1:5174'
const output = resolve('apps/gallery-admin/public/effect-previews')
await mkdir(output, { recursive: true })
await mkdir('.cache/photo-effects', { recursive: true })
const bundle = resolve('.cache/photo-effects/contracts.mjs')
await build({ entryPoints: ['packages/gallery-contracts/src/index.ts'], outfile: bundle, bundle: true, platform: 'node', format: 'esm' })
const { VIEWER_PRESETS, PHOTO_EFFECTS } = await import(pathToFileURL(bundle).href)
const photograph = await readFile('apps/gallery-admin/public/covers/coast.png')
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.route('**/photo-effect-preview', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><meta charset="utf-8"><title>照片特效预览</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}canvas{display:block;width:100%;height:100%}</style><canvas></canvas></html>' }))
  await page.route('**/preview-photograph.png', route => route.fulfill({ contentType: 'image/png', body: photograph }))
  await page.goto(`${origin}/g/photo-effect-preview`)
  const { width: photoWidth, height: photoHeight } = await page.evaluate(async () => {
    const image = new Image(); image.src = '/preview-photograph.png'; await image.decode()
    return { width: image.naturalWidth, height: image.naturalHeight }
  })
  await page.evaluate(async ({ width, height, initial }) => {
    const { ViewerEngine } = await import('/g/src/core/ViewerEngine.ts')
    const engine = new ViewerEngine(document.querySelector('canvas'), initial)
    window.previewEngine = engine
    await engine.init(undefined, initial, { applyLocalPreferences: false })
    engine.syncPhotos([{ title: '海边来信', thumbnailUrl: '/preview-photograph.png', width, height, sortOrder: 0 }])
    engine.start()
  }, { width: photoWidth, height: photoHeight, initial: {
    ...VIEWER_PRESETS['jade-flow'], quality: 'high',
    camera: { autoRotate: false }, particles: { enabled: false, types: [] },
    effects: { ...VIEWER_PRESETS['jade-flow'].effects, photoEntrance: 'none', photoFloat: false, bloom: { enabled: false } },
    layout: { mode: 'helix', params: { composition: 'curated', scale: 1.6 }, transition: { style: 'none' } }
  } })
  await page.waitForFunction(() => window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot().renderedPhotos.ready === 1)
  await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__.freezeTime(4))
  for (const [name, preset] of Object.entries(VIEWER_PRESETS)) {
    await page.evaluate(async config => {
      await window.previewEngine.replaceConfig({ ...config, quality: 'high',
        camera: { autoRotate: false }, particles: { enabled: false, types: [] },
        layout: { mode: 'helix', params: { composition: 'curated', scale: 1.6 }, transition: { style: 'none' } },
        background: { mode: 'solid', color: '#101412', motion: false },
        lighting: { timeOfDay: 'noon', autoColorAdapt: false },
        effects: { photo: config.effects.photo, photoEntrance: 'none', photoFloat: false, bloom: { enabled: false }, fog: { enabled: false } }
      })
    }, preset)
    // Wait for a rendered frame after the GPU uniforms and material program change.
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))))
    const screenshot = await page.locator('canvas').screenshot()
    const webp = await page.evaluate(async data => {
      const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode()
      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 200
      const context = canvas.getContext('2d'); context.drawImage(image, image.naturalWidth / 6, image.naturalHeight / 6, image.naturalWidth * 2 / 3, image.naturalHeight * 2 / 3, 0, 0, 320, 200)
      const pixels = context.getImageData(0, 0, 320, 200).data
      const colors = new Set()
      for (let i = 0; i < pixels.length; i += 16) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`)
      if (colors.size < 100) throw new Error('Preview photograph did not render')
      return canvas.toDataURL('image/webp', .88).split(',')[1]
    }, screenshot.toString('base64'))
    await writeFile(resolve(output, `${name}.webp`), Buffer.from(webp, 'base64'))
    console.log(`${name}: ${PHOTO_EFFECTS.find(item => item.id === preset.effects.photo.style).label}`)
  }
  if (errors.length) throw new Error(errors.join('\n'))
  const previews = await Promise.all(Object.keys(VIEWER_PRESETS).map(async name => ({
    name, label: PHOTO_EFFECTS.find(item => item.id === VIEWER_PRESETS[name].effects.photo.style).label,
    image: (await readFile(resolve(output, `${name}.webp`))).toString('base64')
  })))
  const comparison = await page.evaluate(async items => {
    const canvas = document.createElement('canvas'); canvas.width = 1400; canvas.height = 1152
    const context = canvas.getContext('2d'); context.fillStyle = '#111513'; context.fillRect(0, 0, 1400, 1152)
    context.fillStyle = '#f2eee3'; context.font = '500 32px "Microsoft YaHei", sans-serif'; context.fillText('16 种照片特效 · 同图对照', 40, 57)
    context.fillStyle = '#a4b4a9'; context.font = '17px "Microsoft YaHei", sans-serif'; context.fillText('固定照片与布局，仅切换照片处理。以下均由实际渲染器输出。', 40, 91)
    for (let index = 0; index < items.length; index++) {
      const item = items[index], x = 40 + index % 4 * 338, y = 124 + Math.floor(index / 4) * 252
      const image = new Image(); image.src = 'data:image/webp;base64,' + item.image; await image.decode()
      context.drawImage(image, x, y, 306, 191)
      context.fillStyle = '#f2eee3'; context.font = '17px "Microsoft YaHei", sans-serif'; context.fillText(`${String(index + 1).padStart(2, '0')}  ${item.label}`, x + 4, y + 219)
    }
    return canvas.toDataURL('image/webp', .92).split(',')[1]
  }, previews)
  await writeFile('.cache/photo-effects/comparison.webp', Buffer.from(comparison, 'base64'))
} finally { await browser.close() }
