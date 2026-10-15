import { chromium, expect } from '@playwright/test'
import fs from 'node:fs/promises'

const out = 'acceptance-shots/curated'
const { url: savedUrl } = JSON.parse(await fs.readFile(`${out}/local-gallery.json`, 'utf8'))
const url = new URL(savedUrl)
if (process.env.VIEWER_URL) url.host = new URL(process.env.VIEWER_URL).host
if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw Error('Local servers only')
const browser = await chromium.launch()
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 2 })
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 2 })
  })
  const page = await context.newPage(), errors = []
  page.on('pageerror', error => errors.push(error.message))
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 75000 })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  const start = Date.now()
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60000 })
  await expect.poll(() => page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot().renderedPhotos.ready ?? 0), { timeout: 60000 }).toBeGreaterThan(0)
  const firstPhotoMs = Date.now() - start
  await page.screenshot({ path: `${out}/weak-network.png` })
  const snapshot = await page.evaluate(() => window.__VIE_VIEWER_DIAGNOSTICS__.snapshot())
  await page.getByRole('button', { name: '平面展览', exact: true }).click()
  await expect(page.locator('.photo-wall img').first()).toBeVisible()
  await expect.poll(() => page.locator('.photo-wall img').first().evaluate(img => img.complete && img.naturalWidth > 0), { timeout: 30000 }).toBe(true)
  const result = { conditions: '1.6 Mbps / 150 ms latency / 4x CPU slowdown / 2 logical cores / 2 GB reported memory', firstPhotoMs, effectiveQuality: snapshot.effectiveQuality, visiblePhotos: snapshot.renderedPhotos, exhibitionUsable: true, errors }
  await fs.writeFile(`${out}/resilience.json`, JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
  expect(errors).toEqual([])
} finally { await browser.close() }
