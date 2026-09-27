/**
 * 生产形态（同域 /app/ + /g/，生产构建产物）下的配置页实时预览握手验证。
 * 前置：node e2e/prod-shape-static-server.mjs 8099
 * 用法：node e2e/prod-shape-preview-verify.mjs
 */
import { chromium } from '@playwright/test'

const GALLERY_ID = 'gal-demo-1'
const SLUG = 'demo-gallery'
const BASE = 'http://localhost:8099'

const DRAFT_CONFIG = {
  presetName: 'starry-night',
  visitorAllowDownload: false,
  layout: { mode: 'sphere' },
  particles: { enabled: true, types: ['stars', 'meteors', 'fireflies'], density: 1 },
  effects: {
    bloom: { enabled: true, strength: 0.8, radius: 0.6, threshold: 0.15 },
    fog: { enabled: false, color: '#0f172a', density: 0 },
    photoFloat: true
  },
  camera: { autoRotate: true, introFlight: true },
  interaction: { clickRipple: true, cursorTrail: true },
  audio: { bgm: { enabled: true }, sfx: { enabled: true } },
  lighting: { timeOfDay: 'sunset', autoColorAdapt: true }
}
const draftJson = JSON.stringify(DRAFT_CONFIG)

async function mockRoutes(page) {
  await page.route('**/api/auth/csrf', route => route.fulfill({ json: { token: 'mock-csrf-token' } }))
  await page.route('**/api/me', route =>
    route.fulfill({
      json: {
        user: { id: 'u1', email: 't@example.com', displayName: '验证员' },
        tenant: { id: 't1', name: '验证', slug: 'verify' },
        role: 'OWNER',
        capabilities: ['GALLERY_READ', 'PHOTO_READ', 'CONFIG_READ', 'CONFIG_WRITE', 'PUBLISH']
      }
    }))
  await page.route(`**/api/galleries/${GALLERY_ID}/preview-token`, route =>
    route.fulfill({ json: { token: 'mock-preview-token', expiresAt: '2026-12-31T00:00:00Z' } }))
  await page.route(`**/api/galleries/${GALLERY_ID}/viewer-config/versions*`, route =>
    route.fulfill({ json: { items: [], total: 0 } }))
  await page.route(`**/api/galleries/${GALLERY_ID}/viewer-config`, route =>
    route.fulfill({
      json: { configJson: draftJson, presetName: 'starry-night', publishedVersionId: null, lastPublishedAt: null }
    }))
  await page.route(`**/api/galleries/${GALLERY_ID}`, route =>
    route.fulfill({
      json: { id: GALLERY_ID, slug: SLUG, name: '演示展厅', visibility: 'PUBLIC', status: 'PUBLISHED', photoCount: 2 }
    }))
  await page.route(`**/api/g/${SLUG}/photos*`, route =>
    route.fulfill({
      json: {
        items: [
          { title: '照片一', thumbnailUrl: null, width: 800, height: 600, sortOrder: 1 },
          { title: '照片二', thumbnailUrl: null, width: 800, height: 600, sortOrder: 2 }
        ],
        total: 2, page: 0, pageSize: 50
      }
    }))
  await page.route(`**/api/g/${SLUG}/viewer-config`, route =>
    route.fulfill({ json: { configJson: draftJson } }))
  await page.route(`**/api/g/${SLUG}`, route =>
    route.fulfill({
      json: { slug: SLUG, title: '演示展厅', visibility: 'PUBLIC', accessState: 'READY', cover: null, photoCount: 2 }
    }))
}

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
  await mockRoutes(page)

  const errors = []
  page.on('pageerror', err => errors.push(`pageerror: ${err.message}`))
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text().slice(0, 200)}`)
  })

  await page.goto(`${BASE}/app/galleries/${GALLERY_ID}/config`)

  // 与生产一致：等 iframe 握手成功（.live-preview.is-ready）或超时 20s
  let handshake = false
  try {
    await page.waitForSelector('.live-preview.is-ready', { timeout: 20000 })
    handshake = true
  } catch {
    handshake = false
  }

  const emptyText = handshake ? '' : (await page.locator('.preview-empty p').textContent().catch(() => ''))
  await page.screenshot({ path: 'e2e/prod-shape-preview.png' })

  console.log(JSON.stringify({ handshake, emptyText: emptyText?.trim(), errors: errors.slice(0, 10) }, null, 2))
  await browser.close()
  if (!handshake || errors.length) process.exitCode = 1
}

main().catch(err => {
  console.error('verify failed:', err)
  process.exit(1)
})
