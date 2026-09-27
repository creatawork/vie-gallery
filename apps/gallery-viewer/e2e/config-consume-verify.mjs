/**
 * 访客端配置消费验证（API mock，无需后端）。
 * 前置：viewer dev server (5174) 已启动。
 * 验证：camera.autoRotate 初始生效（HUD 巡航按钮激活）、theme.accent 写入 CSS 变量。
 */
import { chromium } from '@playwright/test'

const SLUG = 'demo-gallery'

const CONFIG = {
  presetName: 'custom',
  layout: { mode: 'sphere' },
  background: { type: 'sky', sky: { theme: 'starry', timeOfDay: 'night' } },
  particles: { enabled: true, types: ['stars'], density: 1 },
  effects: {
    bloom: { enabled: true, strength: 0.8, radius: 0.6, threshold: 0.15 },
    fog: { enabled: false, color: '#0f172a', density: 0 },
    photoFloat: false
  },
  camera: { autoRotate: true },
  interaction: { clickRipple: true },
  audio: { bgm: { enabled: false }, sfx: { enabled: true } },
  theme: { engine: 'custom', accent: '#D4C4F0' }
}

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

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

  await page.goto(`http://localhost:5174/g/${SLUG}`)
  await page.waitForSelector('canvas', { timeout: 20000 })
  await page.waitForTimeout(1500)

  const tourActive = await page.locator('.btn-label-desktop:has-text("巡航中")').count()
  const accentVar = await page.evaluate(() => document.documentElement.style.getPropertyValue('--accent').trim())
  const brandVar = await page.evaluate(() => document.documentElement.style.getPropertyValue('--brand-emerald').trim())

  await page.screenshot({ path: 'e2e/viewer-consume-verify.png' })

  const failed = []
  if (tourActive < 1) failed.push('camera.autoRotate 未生效（HUD 巡航按钮未激活）')
  if (accentVar !== '#D4C4F0') failed.push(`theme.accent 未写入 --accent（实际: "${accentVar}"）`)
  if (brandVar !== '#D4C4F0') failed.push(`theme.accent 未写入 --brand-emerald（实际: "${brandVar}"）`)

  console.log(JSON.stringify({ tourActive, accentVar, brandVar, failed }, null, 2))
  await browser.close()
  if (failed.length) process.exitCode = 1
}

main().catch(err => {
  console.error('verify failed:', err)
  process.exit(1)
})
