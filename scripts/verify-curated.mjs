import { chromium, expect } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'

// Local acceptance only. Creates a separate local creator and gallery; no external accounts.
const admin = process.env.ADMIN_URL || 'http://127.0.0.1:15173'
const viewer = process.env.VIEWER_URL || 'http://127.0.0.1:15174'
if (![admin, viewer].every(url => ['localhost','127.0.0.1'].includes(new URL(url).hostname))) throw Error('Local servers only')
const out = path.resolve('acceptance-shots/curated')
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
const page = await context.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
try {
  await page.goto(`${admin}/app/`)
  await page.getByRole('button', { name: '注册账户', exact: true }).click()
  await page.locator('#auth-display-name').fill('光影策展人')
  await page.locator('#auth-email').fill(`curated-${Date.now()}@example.test`)
  await page.locator('#auth-password').fill(`Local-${Date.now()}-only!`)
  await page.locator('form button[type=submit]').click()
  await page.getByRole('heading', { name: '我的空间', exact: true }).waitFor()
  await page.getByRole('button', { name: '新建空间', exact: true }).click()
  await page.locator('#input-gallery-name').fill('山海之间')
  await page.getByRole('dialog').locator('button[type=submit]').click()
  await page.waitForURL('**/app/galleries/*')
  const galleryId = new URL(page.url()).pathname.split('/').at(-1)
  await context.storageState({path:'.cache/curated-creator-session.json'})
  const sources = ['coast','forest','lake','courtyard','stream','bamboo','gallery']
  const photos = await Promise.all(Array.from({ length:12 }, async (_,i) => ({
    name: `山海-${i+1}.png`, mimeType:'image/png', buffer: await fs.readFile(`apps/gallery-admin/public/covers/${sources[i%sources.length]}.png`)
  })))
  await page.locator('input[type=file]').first().setInputFiles(photos)
  await expect.poll(async () => {
    const r=await page.request.get(`${admin}/api/galleries/${galleryId}/publish-readiness`)
    return r.ok() ? (await r.json()).readyPhotoCount : 0
  }, { timeout:120000 }).toBe(12)
  await page.getByRole('button', { name: /波浪/ }).click()
  await expect(page.getByRole('status').filter({hasText:'风格已保存'})).toBeVisible()
  await expect(page.locator('.meta-row')).toContainText('12 张照片', { timeout: 15000 })
  await expect(page.locator('.photo-card')).toHaveCount(12)
  await page.locator('.photo-card').first().scrollIntoViewIfNeeded()
  await expect(page.locator('.photo-card').first()).toHaveCSS('opacity', '1')
  await expect.poll(()=>page.locator('.photo-card img').first().evaluate(img=>img.complete && img.naturalWidth>0)).toBe(true)
  console.log('Creator cards:', await page.locator('.photo-card').first().evaluate(el=>({opacity:getComputedStyle(el).opacity,transform:getComputedStyle(el).transform,visibility:getComputedStyle(el).visibility,rect:el.getBoundingClientRect().toJSON()})))
  await page.evaluate(()=>scrollTo(0,0))
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${out}/creator.png`, fullPage: true })
  await page.getByRole('button', { name: '发布并分享', exact:true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  const url=await page.locator('#public-gallery-link').inputValue()
  expect(new URL(url).origin).toBe(new URL(viewer).origin)
  await expect(page.getByRole('button',{name:'复制链接',exact:true})).toBeVisible()
  await page.screenshot({path:`${out}/share.png`})
  await fs.writeFile(`${out}/local-gallery.json`,JSON.stringify({galleryId,url},null,2))
  console.log('Published local gallery: '+url)
  const visitor = await browser.newContext({ viewport: { width:1440,height:960 } })
  const view = await visitor.newPage()
  view.on('pageerror', e=>errors.push(e.message))
  view.on('console', m=>{if(m.type()==='error') errors.push(m.text())})
  await view.goto(url)
  await expect(view.getByRole('button',{name:'波浪',exact:true})).toHaveAttribute('aria-pressed','true')
  await expect(view.getByRole('button',{name:'螺旋',exact:true})).toBeVisible()
  await expect.poll(()=>view.evaluate(()=>window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot().renderedPhotos.ready||0),{timeout:30000}).toBeGreaterThan(0)
  for(const [label,file] of [['螺旋','helix'],['环幕','ring'],['波浪','wave']]) {
    await view.getByRole('button',{name:label,exact:true}).click()
    await view.waitForTimeout(2200) // Authored morph is 1.6s plus a 350ms stagger.
    await view.screenshot({path:`${out}/${file}.png`})
  }
  await view.getByRole('button',{name:'平面展览',exact:true}).click()
  await expect(view.locator('.photo-wall img').first()).toBeVisible()
  await view.screenshot({path:`${out}/exhibition.png`,fullPage:true})
  await view.locator('.photo-wall button').first().click()
  await expect(view.getByRole('dialog')).toBeVisible()
  await view.keyboard.press('Escape')
  await view.getByRole('button',{name:'空间漫游',exact:true}).click()
  await view.setViewportSize({width:390,height:844})
  await view.getByRole('button',{name:'螺旋',exact:true}).click()
  await view.waitForTimeout(2200)
  await view.screenshot({path:`${out}/mobile.png`})
  const overflow=await view.evaluate(()=>document.documentElement.scrollWidth>innerWidth)
  expect(overflow).toBe(false)
  await expect(view.getByRole('button',{name:'暂停漫游',exact:true})).toBeVisible()
  expect(await view.locator('canvas.webgl-canvas').evaluate(el=>el.getBoundingClientRect().width)).toBe(390)
  await view.getByRole('button',{name:'波浪',exact:true}).click()
  await view.waitForTimeout(2200)
  await view.screenshot({path:`${out}/mobile-wave.png`})
  // A new phone visitor must receive the creator's wave and its correct initial framing.
  const phone=await browser.newContext({viewport:{width:390,height:844}})
  const firstVisit=await phone.newPage(); await firstVisit.goto(url)
  await expect(firstVisit.getByRole('button',{name:'波浪',exact:true})).toHaveAttribute('aria-pressed','true')
  await expect.poll(()=>firstVisit.evaluate(()=>window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot().renderedPhotos.ready||0),{timeout:15000}).toBeGreaterThan(0)
  await firstVisit.getByRole('button',{name:'暂停漫游',exact:true}).click()
  await firstVisit.getByRole('button',{name:'下一张作品',exact:true}).click()
  await expect(firstVisit.locator('.stage-counter span').first()).toHaveText('02')
  await firstVisit.screenshot({path:`${out}/mobile-first-visit.png`})
  // A separate visitor with no WebGL still gets the photographic exhibition.
  const fallback=await browser.newContext({viewport:{width:390,height:844}})
  await fallback.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext=function(type,...args){ return String(type).includes('webgl')?null:original.call(this,type,...args) }
  })
  const low=await fallback.newPage(); await low.goto(url)
  await expect(low.locator('.photo-wall img').first()).toBeVisible()
  await low.screenshot({path:`${out}/fallback.png`,fullPage:true})
  console.log(JSON.stringify({published:true,anonymousVisitor:true,photoCount:12,styles:3,mobileOverflow:overflow,webglFallback:true,errors},null,2))
  expect(errors).toEqual([])
} catch(e) {
  await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{})
  console.error((await page.locator('body').innerText()).slice(0,3000))
  throw e
} finally { await browser.close() }
