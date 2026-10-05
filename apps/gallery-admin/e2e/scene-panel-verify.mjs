/**
 * 配置中心端到端验证脚本（API mock，无需后端）。
 * 前置：admin dev server (5173) 与 viewer dev server (5174) 已启动。
 * 用法：node e2e/config-center-verify.mjs
 */
import { chromium, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const GALLERY_ID = 'gal-demo-1'
const SLUG = 'demo-gallery'
const ADMIN = 'http://localhost:5273'
const OUT = resolve('e2e/config-verify-shots')
mkdirSync(OUT, { recursive: true })

const DRAFT_CONFIG = {
  presetName: 'starry-night',
  visitorAllowDownload: false,
  layout: { mode: 'sphere' },
  particles: { enabled: true, types: ['stars'], density: 1 },
  effects: {
    bloom: { enabled: true, strength: 0.8, radius: 0.6, threshold: 0.15 },
    fog: { enabled: false, color: '#0f172a', density: 0 },
    photoFloat: true
  },
  camera: { autoRotate: false, introFlight: false },
  interaction: { clickRipple: true, cursorTrail: false },
  audio: { bgm: { enabled: true }, sfx: { enabled: true } },
  lighting: { timeOfDay: 'auto', autoColorAdapt: true }
}

const draftJson = JSON.stringify(DRAFT_CONFIG)
const savedBodies = []
const publishCalls = []

function galleryAdmin() {
  return {
    id: GALLERY_ID,
    slug: SLUG,
    name: '演示展厅',
    visibility: 'PUBLIC',
    status: 'PUBLISHED',
    photoCount: 3,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-20T00:00:00Z'
  }
}

function galleryPublic() {
  return {
    slug: SLUG,
    title: '演示展厅',
    visibility: 'PUBLIC',
    accessState: 'READY',
    cover: null,
    photoCount: 0
  }
}

async function mockRoutes(page) {
  await page.route('**/api/auth/csrf', route =>
    route.fulfill({ json: { token: 'mock-csrf-token' } }))

  await page.route('**/api/me', route =>
    route.fulfill({
      json: {
        user: { id: 'u1', email: 'tester@example.com', displayName: '配置验证员' },
        tenant: { id: 't1', name: '验证工作区', slug: 'verify' },
        role: 'OWNER',
        capabilities: ['GALLERY_READ', 'GALLERY_CREATE', 'PHOTO_READ', 'PHOTO_WRITE', 'CONFIG_READ', 'CONFIG_WRITE', 'PUBLISH', 'SHARE_MANAGE', 'MEMBER_MANAGE']
      }
    }))

  await page.route(`**/api/galleries/${GALLERY_ID}/preview-token`, route =>
    route.fulfill({ json: { token: 'mock-preview-token', expiresAt: '2026-12-31T00:00:00Z' } }))

  await page.route(`**/api/galleries/${GALLERY_ID}/viewer-config/versions*`, route =>
    route.fulfill({
      json: {
        items: [
          { id: 'v3', versionNumber: 3, createdAt: '2026-09-25T10:00:00Z', presetName: 'starry-night' },
          { id: 'v2', versionNumber: 2, createdAt: '2026-09-20T10:00:00Z', presetName: 'minimal' },
          { id: 'v1', versionNumber: 1, createdAt: '2026-09-15T10:00:00Z', presetName: 'romantic' }
        ],
        total: 3
      }
    }))

  await page.route(`**/api/galleries/${GALLERY_ID}/viewer-config/publish`, async route => {
    const body = route.request().postDataJSON()
    publishCalls.push(body)
    return route.fulfill({ json: { id: 'v4', versionNumber: 4, createdAt: '2026-09-27T12:00:00Z' } })
  })

  await page.route(`**/api/galleries/${GALLERY_ID}/viewer-config`, async route => {
    const method = route.request().method()
    if (method === 'PUT') {
      savedBodies.push(JSON.parse(route.request().postData() || '{}'))
      return route.fulfill({ json: { ok: true } })
    }
    return route.fulfill({
      json: {
        configJson: draftJson,
        presetName: 'starry-night',
        publishedVersionId: 'v2',
        lastPublishedAt: '2026-09-20T10:00:00Z',
        publishedConfigJson: draftJson
      }
    })
  })

  await page.route(`**/api/galleries/${GALLERY_ID}`, route =>
    route.fulfill({ json: galleryAdmin() }))

  // 访客端（预览 iframe 加载自 5174）
  await page.route(`**/api/public/g/${SLUG}/photos*`, route =>
    route.fulfill({ json: { items: [], total: 0, page: 0, pageSize: 50 } }))
  await page.route(`**/api/public/g/${SLUG}/viewer-config`, route =>
    route.fulfill({ json: { configJson: draftJson } }))
  await page.route(`**/api/public/g/${SLUG}`, route =>
    route.fulfill({ json: galleryPublic() }))
}

const browser = await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
const page = await browser.newPage({viewport:{width:1440,height:1000}})
const errors=[]
page.on('pageerror',e=>errors.push(e.message))
await mockRoutes(page)
await page.route('**/g/backgrounds/*.webp',async r=>{const {readFile}=await import('node:fs/promises');const name=new URL(r.request().url()).pathname.split('/').pop();await r.fulfill({contentType:'image/webp',body:await readFile('../gallery-viewer/public/backgrounds/'+name)})})
await page.route('http://localhost:5273/g/demo-gallery?**',r=>r.fulfill({status:302,headers:{Location:r.request().url().replace(':5273',':5274')}}))
await page.goto(ADMIN+'/app/galleries/'+GALLERY_ID+'/config')
await expect(page.locator('.config-side')).toBeVisible()
await page.getByRole('tab',{name:'氛围',exact:true}).click()
await expect(page.locator('.preset-mini')).toHaveCount(8)
await expect(page.locator('.preset-image img')).toHaveCount(8)
await expect.poll(()=>page.locator('.preset-image img').evaluateAll(imgs=>imgs.every(img=>img.complete&&img.naturalWidth>0))).toBe(true)
await page.locator('.preset-mini').filter({hasText:'冬日雪境'}).click()
await expect(page.locator('.preset-mini.active')).toContainText('冬日雪境')
await expect.poll(()=>savedBodies.length).toBeGreaterThan(0)
expect(JSON.parse(savedBodies.at(-1).configJson).background.image.url).toBe('/g/backgrounds/winter-snow.webp')
await page.screenshot({path:OUT+'/scene-panel-desktop.png'})
await page.locator('#scene-background').selectOption('none')
await expect.poll(()=>JSON.parse(savedBodies.at(-1).configJson).background.type).toBe('none')
await page.locator('.preset-mini').filter({hasText:'胶片展厅'}).click()
await expect.poll(()=>JSON.parse(savedBodies.at(-1).configJson).background.image.url).toBe('/g/backgrounds/film-gallery.webp')
await page.setViewportSize({width:390,height:844})
await page.screenshot({path:OUT+'/scene-panel-mobile.png',fullPage:true})
expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
expect(errors).toEqual([])
console.log(JSON.stringify({cards:8,imagesLoaded:true,backgroundSaved:true,noneSaved:true,mobileOverflow:false,errors}))
await browser.close()
