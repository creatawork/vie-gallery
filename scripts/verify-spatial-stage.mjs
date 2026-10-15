import { chromium, expect } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'

const base = process.env.VIEWER_URL || 'http://127.0.0.1:15174'
const out = path.resolve('acceptance-shots/spatial-stage')
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? {channel:process.env.BROWSER_CHANNEL} : {}) })
const errors = []
async function setup(context, count = 12) {
  const page = await context.newPage()
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  if(process.env.DEBUG_STAGE) page.on('console', m => console.log(m.type(),m.text()))
  const names = ['coast','forest','lake','courtyard','stream','bamboo','gallery']
  await page.route('**/stage-photo-*', async route => {
    const i = Number(route.request().url().match(/stage-photo-(\d+)/)[1])
    await route.fulfill({ contentType:'image/png', body:await fs.readFile(`apps/gallery-admin/public/covers/${names[i % names.length]}.png`) })
  })
  await page.route('**/api/public/g/spatial-demo**', route => {
    const url = new URL(route.request().url())
    if(url.pathname.endsWith('/viewer-config')) return route.fulfill({json:{enabled:true, configJson:JSON.stringify({layout:{mode:'helix',params:{composition:'curated',scale:2}},camera:{autoRotate:true,rotateSpeed:.12},background:{mode:'gradient',color:'#080c15',secondaryColor:'#263951',motion:true},particles:{enabled:true,types:['stars','fireflies'],density:.45,speed:.3,size:1.4},effects:{bloom:{enabled:false},fog:{enabled:false},postGrade:{enabled:false},vignette:{enabled:false}},lighting:{timeOfDay:'noon',autoColorAdapt:false},interaction:{clickRipple:false,cursorTrail:false}})}})
    if(url.pathname.endsWith('/photos')) return route.fulfill({json:{items:Array.from({length:count},(_,i)=>({title:['海岸的风','林间来信','山的另一边','午后留白','流动的绿','竹间','光的形状'][i%7],width:1536,height:1024,sortOrder:i,thumbnailUrl:`/stage-photo-${i}`,textureUrl:`/stage-photo-${i}`,mediumUrl:`/stage-photo-${i}`})),page:0,pageSize:50,total:count}})
    return route.fulfill({json:{slug:'spatial-demo',title:'山海之间',visibility:'PUBLIC',accessState:'READY',photoCount:count}})
  })
  await page.goto(`${base}/g/spatial-demo`)
  return page
}
try {
  const context = await browser.newContext({viewport:{width:1440,height:960}})
  const page = await setup(context)
  if(process.env.DEBUG_STAGE) {
    await page.getByRole('button',{name:'螺旋',exact:true}).click()
    await page.waitForTimeout(8000)
    console.log(await page.evaluate(()=>window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot()))
    process.exitCode=0
  } else {
  await expect(page.getByRole('button',{name:'下一张作品',exact:true})).toBeVisible()
  await expect.poll(()=>page.evaluate(()=>window.__VIE_VIEWER_DIAGNOSTICS__?.snapshot().renderedPhotos.ready||0),{timeout:20000}).toBeGreaterThan(4)
  await page.getByRole('button',{name:'暂停漫游',exact:true}).click()
  await expect(page.locator('.stage-counter')).toContainText('01')
  await page.mouse.move(720,480)
  await page.mouse.wheel(0,400)
  await expect(page.locator('.stage-counter')).toContainText('02')
  await page.getByRole('button',{name:'上一张作品',exact:true}).click()
  await expect(page.locator('.stage-counter')).toContainText('01')
  await page.getByRole('button',{name:'下一张作品',exact:true}).click()
  await expect(page.locator('.stage-counter')).toContainText('02')
  await page.locator('canvas.webgl-canvas').focus()
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('.stage-counter')).toContainText('01')
  await page.mouse.move(900,480)
  await page.mouse.down()
  await page.mouse.move(500,480,{steps:12})
  await page.mouse.up()
  await expect(page.locator('.stage-counter span').first()).toHaveText('02')
  await page.getByRole('button',{name:'上一张作品',exact:true}).click()
  await expect(page.locator('.stage-counter span').first()).toHaveText('01')
  for(const [label,name] of [['螺旋','helix'],['环幕','ring'],['波浪','wave']]) {
    await page.getByRole('button',{name:label,exact:true}).click()
    await page.waitForTimeout(2000)
    await page.mouse.move(10,10)
    await page.screenshot({path:`${out}/${name}.png`})
  }
  await page.setViewportSize({width:390,height:844})
  for(const [label,name] of [['螺旋','mobile'],['环幕','mobile-ring'],['波浪','mobile-wave']]) {
    await page.getByRole('button',{name:label,exact:true}).click()
    await page.waitForTimeout(1800)
    await page.screenshot({path:`${out}/${name}.png`})
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false)
  await page.getByRole('button',{name:'查看当前作品',exact:true}).click()
  await expect(page.getByRole('dialog').first()).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button',{name:'平面展览',exact:true}).click()
  await expect(page.locator('.photo-wall img').first()).toBeVisible()
  const reduced = await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'})
  const still = await setup(reduced)
  const before = await still.locator('.stage-counter').innerText()
  await still.waitForTimeout(1800)
  expect(await still.locator('.stage-counter').innerText()).toBe(before)
  await still.getByRole('button',{name:'下一张作品',exact:true}).click()
  await expect(still.locator('.stage-counter')).toContainText('02')
  for(const count of [1,2,3,50]) {
    const small=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'})
    const p=await setup(small,count)
    if(count===1) await expect(p.getByRole('button',{name:'下一张作品',exact:true})).toBeDisabled()
    else {
      await p.getByRole('button',{name:'上一张作品',exact:true}).click()
      await expect(p.locator('.stage-counter span').first()).toHaveText(String(count).padStart(2,'0'))
    }
    await small.close()
  }
  const fallback = await browser.newContext({viewport:{width:390,height:844}})
  await fallback.addInitScript(()=>{const old=HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext=function(type,...args){return type.includes('webgl')?null:old.call(this,type,...args)}})
  const low = await setup(fallback)
  await expect(low.locator('.photo-wall img').first()).toBeVisible()
  expect(errors).toEqual([])
  await fs.writeFile(`${out}/verification.json`,JSON.stringify({passed:true,desktop:true,mobile:true,keyboard:true,drag:true,wheel:true,reducedMotion:true,fallback:true,smallAlbums:[1,2,3],largeAlbum:50,errors},null,2))
  console.log(JSON.stringify({passed:true,desktop:true,mobile:true,keyboard:true,reducedMotion:true,fallback:true,errors},null,2))
  }
} finally {await browser.close()}
