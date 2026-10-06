// 全景投影验收截图：8 场景 × 0/90/180/270 度，供人工接缝评审。
const { chromium } = require('@playwright/test')
const NAMES = ['minimal', 'forest-dream', 'starry-night', 'ocean-breeze', 'sunset-glow', 'romantic', 'winter-snow', 'film-gallery']
;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 800, height: 844 } })
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="100%" height="100%" fill="#333"/></svg>'
  await page.route('**/fixtures/photo-*', r => r.fulfill({ contentType: 'image/svg+xml', body: svg }))
  await page.route('**/api/public/g/effects-fixture**', r => {
    const url = new URL(r.request().url())
    if (url.pathname.endsWith('/viewer-config')) return r.fulfill({ json: { id: 'c', galleryId: 'g', enabled: true, configJson: '{"quality":"mid"}', schemaVersion: 1 } })
    if (url.pathname.endsWith('/photos')) return r.fulfill({ json: { items: Array.from({ length: 4 }, (_, i) => ({ title: 'S' + i, width: 900, height: 600, sortOrder: i, thumbnailUrl: '/fixtures/photo-' + i + '.svg', textureUrl: '/fixtures/photo-' + i + '.svg', mediumUrl: '/fixtures/photo-' + i + '.svg' })), page: 0, pageSize: 50, total: 4 } })
    return r.fulfill({ json: { slug: 'effects-fixture', title: 'x', visibility: 'PUBLIC', accessState: 'READY', cover: null, photoCount: 4 } })
  })
  await page.goto('http://127.0.0.1:15174/g/effects-fixture')
  await page.waitForFunction(() => !!window.__VIE_VIEWER_DIAGNOSTICS__)
  const quarter = Math.round(844 / 4)
  for (const name of NAMES) {
    const preset = { background: { mode: 'image', color: '#000000', image: { url: `/g/backgrounds/${name}.webp`, projection: 'equirectangular' } } }
    const patch = { ...preset, quality: 'mid', camera: { ...preset.camera, autoRotate: false }, layout: { ...preset.layout, transition: { style: 'none', duration: 0.2 } }, effects: { ...preset.effects, photoFloat: false, photoEntrance: 'none', bloom: { enabled: false } } }
    await page.evaluate((cfg) => window.__VIE_VIEWER_DIAGNOSTICS__.requestConfig(cfg), patch)
    await page.waitForTimeout(2500)
    for (let yaw = 0; yaw < 4; yaw++) {
      await page.screenshot({ path: `e2e/panorama-review/${name}-${yaw * 90}.png` })
      await page.mouse.move(700, 420)
      await page.mouse.down()
      await page.mouse.move(700 - quarter, 420, { steps: 12 })
      await page.mouse.up()
      await page.waitForTimeout(700)
    }
    console.log('captured', name)
  }
  await browser.close()
})()
