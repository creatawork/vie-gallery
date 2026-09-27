/**
 * 配置中心端到端验证脚本（API mock，无需后端）。
 * 前置：admin dev server (5173) 与 viewer dev server (5174) 已启动。
 * 用法：node e2e/config-center-verify.mjs
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const GALLERY_ID = 'gal-demo-1'
const SLUG = 'demo-gallery'
const ADMIN = 'http://localhost:5173'
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
  await page.route(`**/api/g/${SLUG}/photos*`, route =>
    route.fulfill({ json: { items: [], total: 0, page: 0, pageSize: 50 } }))
  await page.route(`**/api/g/${SLUG}/viewer-config`, route =>
    route.fulfill({ json: { configJson: draftJson } }))
  await page.route(`**/api/g/${SLUG}`, route =>
    route.fulfill({ json: galleryPublic() }))
}

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
  await mockRoutes(page)

  const errors = []
  page.on('pageerror', err => errors.push(`pageerror: ${err.message}`))
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`)
  })

  await page.goto(`${ADMIN}/app/galleries/${GALLERY_ID}/config`)
  await page.waitForSelector('.live-preview.is-ready', { timeout: 25000 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/01-basics.png`, fullPage: false })

  // 氛围 tab
  await page.click('.side-tab:has-text("氛围")')
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/02-atmosphere.png` })

  // 空间背景与点缀色配置已移除：对应控件不应出现
  const backgroundCards = await page.locator('.mode-card').count()
  const accentSwatches = await page.locator('.swatch[aria-label^="使用点缀色"]').count()

  // 雾化滑块 + 雾色色板
  const fogSlider = page.locator('.side-block:has(h2:text-is("氛围")) input.range').nth(1)
  await fogSlider.fill('40')
  await page.waitForTimeout(300)
  const fogSwatches = await page.locator('.swatch-row:has(.swatch-label:text-is("雾色")) .swatch').count()
  await page.click('.swatch[aria-label="使用雾色 #0c4a6e"]')
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/03-fog.png` })

  // 光照时段：黄昏 + 星迹拖尾开关
  const lightingChips = await page.locator('.side-block:has(h2:text-is("氛围")) .chip').count()
  await page.click('.side-block:has(h2:text-is("氛围")) .chip:has-text("黄昏")')
  await page.click('.toggle-row:has-text("星迹拖尾") label.switch')
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/04-lighting.png` })

  // 自动漫漫漫游开关 → 应写入 camera.autoRotate
  await page.click('.toggle-row:has-text("自动漫游") label.switch')
  await page.click('.toggle-row:has-text("开场电影运镜") label.switch')
  await page.waitForTimeout(1500) // 等防抖保存落盘
  await page.screenshot({ path: `${OUT}/05-camera.png` })

  // 高级 tab：辉光微调 + 粒子（含新增萤火虫/流星）
  await page.click('.side-tab:has-text("高级")')
  await page.waitForTimeout(300)
  const meteorChip = await page.locator('.particle-chips .chip:has-text("流星")').count()
  await page.click('.particle-chips .chip:has-text("流星")')
  await page.click('.particle-chips .chip:has-text("萤火虫")')
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/06-advanced.png` })

  // 版本 tab：当前线上版本标注
  await page.click('.side-tab:has-text("版本")')
  await page.waitForTimeout(300)
  const currentLabel = await page.locator('.history-row strong:has-text("当前线上版本")').count()
  await page.screenshot({ path: `${OUT}/07-history.png` })

  // 发布链路
  await page.waitForTimeout(1200) // 等自动保存完成后按钮可用
  await page.click('.btn.solid:has-text("同步到访客端")')
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/08-publish-confirm.png` })
  await page.click('.modal-card button:has-text("确认同步")')
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/09-published.png` })

  // 断言
  const lastSave = savedBodies.at(-1)?.configJson ? JSON.parse(savedBodies.at(-1).configJson) : null
  const checks = {
    backgroundCards,
    accentSwatches,
    fogSwatchesShown: fogSwatches >= 6,
    lightingChipsShown: lightingChips >= 5,
    meteorChipShown: meteorChip === 1,
    historyCurrentLabel: currentLabel >= 1,
    autosaveCount: savedBodies.length,
    publishCount: publishCalls.length,
    savedBackground: lastSave?.background,
    savedTheme: lastSave?.theme,
    savedFogColor: lastSave?.effects?.fog?.color,
    savedFogEnabled: lastSave?.effects?.fog?.enabled,
    savedLightingTime: lastSave?.lighting?.timeOfDay,
    savedAutoColorAdapt: lastSave?.lighting?.autoColorAdapt,
    savedCursorTrail: lastSave?.interaction?.cursorTrail,
    savedIntroFlight: lastSave?.camera?.introFlight,
    savedParticleTypes: lastSave?.particles?.types,
    savedAutoRotate: lastSave?.camera?.autoRotate,
    savedPhotoFloat: lastSave?.effects?.photoFloat
  }
  const failed = []
  if (backgroundCards !== 0) failed.push('空间背景配置卡片未移除')
  if (accentSwatches !== 0) failed.push('点缀色色板未移除')
  if (!checks.fogSwatchesShown) failed.push('雾色色板未出现')
  if (!checks.lightingChipsShown) failed.push('光照时段选项未出现')
  if (!checks.meteorChipShown) failed.push('流星粒子选项未出现')
  if (!checks.historyCurrentLabel) failed.push('版本历史缺少“当前线上版本”标注')
  if (checks.savedBackground !== undefined) failed.push('background 不应再写入配置')
  if (checks.savedTheme !== undefined) failed.push('theme 不应再写入配置')
  if (checks.savedFogColor !== '#0c4a6e') failed.push('雾色未保存')
  if (!checks.savedFogEnabled) failed.push('雾效未随滑块启用')
  if (checks.savedLightingTime !== 'sunset') failed.push('光照时段未保存为 sunset')
  if (checks.savedAutoColorAdapt !== true) failed.push('照片主色适应未持久化')
  if (checks.savedCursorTrail !== true) failed.push('星迹拖尾未持久化')
  if (checks.savedIntroFlight !== true) failed.push('开场电影运镜未持久化')
  if (!Array.isArray(checks.savedParticleTypes) || !checks.savedParticleTypes.includes('meteors') || !checks.savedParticleTypes.includes('fireflies')) failed.push('新粒子类型未保存')
  if (checks.savedAutoRotate !== true) failed.push('自动漫游未持久化')
  if (checks.savedPhotoFloat !== true) failed.push('照片悬浮未持久化')
  if (checks.publishCount < 1) failed.push('发布请求未发出')

  console.log(JSON.stringify({ checks, failed, errors: errors.slice(0, 8) }, null, 2))
  await browser.close()
  if (failed.length || errors.length) process.exitCode = 1
}

main().catch(err => {
  console.error('verify failed:', err)
  process.exit(1)
})
