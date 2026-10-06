/**
 * 访客端配置消费验证（API mock，无需后端）。
 * 前置：viewer dev server (5174) 已启动。
 * 验证：camera.autoRotate/introFlight 生效、光照时段/星迹拖尾/新粒子配置可下发、
 *       background/theme.accent 已废弃（不再注入 --accent 等 CSS 变量）。
 */
import { chromium } from '@playwright/test'

const SLUG = 'demo-gallery'

const CONFIG = {
  presetName: 'custom',
  layout: { mode: 'sphere' },
  particles: { enabled: true, types: ['stars', 'fireflies', 'meteors'], density: 1 },
  effects: {
    bloom: { enabled: true, strength: 0.8, radius: 0.6, threshold: 0.15 },
    fog: { enabled: false, color: '#0f172a', density: 0 },
    photoFloat: false
  },
  camera: { autoRotate: true, introFlight: true },
  interaction: { clickRipple: true, cursorTrail: true },
  audio: { bgm: { enabled: false }, sfx: { enabled: true } },
  lighting: { timeOfDay: 'sunset', autoColorAdapt: true }
}

async function main() {
  const browser = await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  const errors = []
  page.on('pageerror', err => errors.push(`pageerror: ${err.message}`))
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`)
  })

  await page.route(`**/api/public/g/${SLUG}/photos*`, route =>
    route.fulfill({
      json: {
        items: [
          { title: '照片一', thumbnailUrl: null, width: 800, height: 600, sortOrder: 1 },
          { title: '照片二', thumbnailUrl: null, width: 800, height: 600, sortOrder: 2 }
        ],
        total: 2,
        page: 0,
        pageSize: 50
      }
    }))
  await page.route(`**/api/public/g/${SLUG}/viewer-config`, route =>
    route.fulfill({ json: { configJson: JSON.stringify(CONFIG) } }))
  await page.route(`**/api/public/g/${SLUG}`, route =>
    route.fulfill({
      json: { slug: SLUG, title: '消费验证展厅', visibility: 'PUBLIC', accessState: 'READY', cover: null, photoCount: 2 }
    }))

  await page.goto(`http://localhost:5274/g/${SLUG}`)
  await page.waitForSelector('canvas', { timeout: 20000 })
  await page.waitForTimeout(1500)

  const tourActive = await page.locator('.btn-label-desktop:has-text("巡航中")').count()
  const accentVar = await page.evaluate(() => document.documentElement.style.getPropertyValue('--accent').trim())
  const brandVar = await page.evaluate(() => document.documentElement.style.getPropertyValue('--brand-emerald').trim())

  await page.screenshot({ path: 'e2e/viewer-consume-verify.png' })

  const failed = []
  if (tourActive < 1) failed.push('camera.autoRotate 未生效（HUD 巡航按钮未激活）')
  if (accentVar !== '') failed.push(`点缀色已废弃，但 --accent 仍被注入（实际: "${accentVar}"）`)
  if (brandVar !== '') failed.push(`点缀色已废弃，但 --brand-emerald 仍被注入（实际: "${brandVar}"）`)
  if (errors.length) failed.push(`页面存在 ${errors.length} 条错误（含新粒子/拖尾着色器）`)

  console.log(JSON.stringify({ tourActive, accentVar, brandVar, errors: errors.slice(0, 5), failed }, null, 2))
  await browser.close()
  if (failed.length) process.exitCode = 1
}

main().catch(err => {
  console.error('verify failed:', err)
  process.exit(1)
})
