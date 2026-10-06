/**
 * 本轮 viewer 交互优化回归（API mock，无需后端）。前置：viewer dev server (5174)。
 * 覆盖：2D PhotoWall 渲染、视图模式记忆、HUD 3D 工具随视图挂载、
 *       视角复位按钮、大图键盘导航、高清源逐级回退、Esc 关闭与焦点恢复。
 */
import { chromium } from '@playwright/test'

const SLUG = 'demo-gallery'
const svg = label =>
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="100%" height="100%" fill="#123"/><text x="50%" y="50%" fill="#9f9" font-size="28" text-anchor="middle">${label}</text></svg>`
  )

const PHOTOS = Array.from({ length: 5 }, (_, i) => ({
  title: `测试照片 ${i + 1}`,
  thumbnailUrl: svg(`T${i + 1}`),
  textureUrl: '/broken-texture.png',
  mediumUrl: '/broken-medium.png',
  width: 320,
  height: 240,
  sortOrder: i
}))

const CONFIG = {
  presetName: 'starry-night',
  layout: { mode: 'sphere' },
  particles: { enabled: true, types: ['stars'], density: 1 },
  effects: { bloom: { enabled: true, strength: 0.8, radius: 0.6, threshold: 0.15 }, fog: { enabled: false, color: '#0f172a', density: 0 }, photoFloat: false },
  camera: { autoRotate: false, introFlight: false },
  interaction: { clickRipple: true, cursorTrail: false },
  audio: { bgm: { enabled: false }, sfx: { enabled: true } },
  lighting: { timeOfDay: 'night', autoColorAdapt: true }
}

const failed = []
const browser = await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', err => errors.push(`pageerror: ${err.message}`))
page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) errors.push(`console: ${msg.text()}`) })

await page.route(`**/api/public/g/${SLUG}/photos*`, route =>
  route.fulfill({ json: { items: PHOTOS, total: PHOTOS.length, page: 0, pageSize: 50 } }))
await page.route(`**/broken-*.png`, route => route.fulfill({ status: 404 }))
await page.route(`**/api/public/g/${SLUG}/viewer-config`, route =>
  route.fulfill({ json: { configJson: JSON.stringify(CONFIG) } }))
await page.route(`**/api/public/g/${SLUG}`, route =>
  route.fulfill({ json: { slug: SLUG, title: '交互回归展厅', visibility: 'PUBLIC', accessState: 'READY', cover: null, photoCount: PHOTOS.length } }))

// ---- 1. 3D 视图：3D 专属工具挂载 + 视角复位按钮存在 ----
await page.goto(`http://localhost:5274/g/${SLUG}`)
await page.waitForSelector('canvas', { timeout: 20000 })
await page.waitForTimeout(1200)
if (!await page.getByTitle('视角复位').count()) failed.push('3D HUD 缺少视角复位按钮')
if (!await page.getByTitle(/自动漫游|自动巡航/).count()) failed.push('3D HUD 缺少自动巡航按钮')

// ---- 2. 切到 2D：3D 工具卸载，PhotoWall 渲染带标题的照片卡 ----
await page.getByTitle('2D 经典画廊').click()
await page.waitForTimeout(400)
if (await page.getByTitle(/自动漫游|自动巡航/).count()) failed.push('2D 视图仍渲染 3D 专属工具')
const cardCount = await page.locator('.photo-card').count()
if (cardCount !== 5) failed.push(`照片墙应渲染 5 张卡片，实际 ${cardCount}`)
if (!await page.locator('.photo-caption').first().textContent().then(t => t?.includes('测试照片 1'))) {
  failed.push('照片卡缺少标题说明')
}

// ---- 3. 大图：键盘导航 + 高清源回退到缩略图 + Esc 关闭 ----
await page.locator('.photo-card').nth(2).click()
const dialog = page.locator('dialog[aria-modal="true"]')
await dialog.waitFor({ timeout: 5000 })
await page.waitForTimeout(600)
const loadedSrc = await page.locator('.main-image').getAttribute('src')
if (!loadedSrc?.startsWith('data:image')) failed.push(`大图未回退到可用源，实际 src=${loadedSrc}`)
if ((await page.locator('.index-current').textContent()) !== '3') failed.push('大图序号应为 3')
await page.keyboard.press('ArrowRight')
await page.waitForTimeout(300)
if ((await page.locator('.index-current').textContent()) !== '4') failed.push('ArrowRight 未切到第 4 张')
await page.keyboard.press('End')
await page.waitForTimeout(300)
if (!(await page.getByTitle('下一张 (ArrowRight)') || true)) {}
const nextDisabled = await page.locator('.next-btn').isDisabled()
if (!nextDisabled) failed.push('最后一张时下一张按钮未禁用')
await page.keyboard.press('Home')
await page.waitForTimeout(300)
if ((await page.locator('.index-current').textContent()) !== '1') failed.push('Home 未回到第 1 张')
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
if (await dialog.count()) failed.push('Esc 未关闭大图')
const focusAfterClose = await page.evaluate(() => document.activeElement?.className || '')
if (!focusAfterClose.includes('photo-card')) failed.push(`关闭后焦点未恢复到照片卡，实际 ${focusAfterClose}`)

// ---- 4. 模式记忆：刷新后仍停留在 2D ----
await page.reload()
await page.waitForTimeout(1500)
if (!await page.locator('.photo-card').first().count()) failed.push('刷新后未记住 2D 偏好')

// ---- 5. 清除偏好后默认回到 3D ----
await page.evaluate(() => localStorage.removeItem('vie:view-mode'))
await page.reload()
await page.waitForSelector('canvas', { timeout: 20000 })
// Canvas mounts before the engine finishes its asynchronous plugin installation.
await page.getByTitle(/自动漫游|自动巡航/).waitFor({ timeout: 20000 })
if (!await page.getByTitle(/自动漫游|自动巡航/).count()) failed.push('清除偏好后未默认回到 3D')

if (errors.length) failed.push(`页面错误: ${errors.slice(0, 3).join(' | ')}`)

console.log(JSON.stringify({ failed, errors: errors.slice(0, 5) }, null, 2))
await page.screenshot({ path: 'e2e/interaction-verify.png' })
await browser.close()
if (failed.length) process.exitCode = 1
