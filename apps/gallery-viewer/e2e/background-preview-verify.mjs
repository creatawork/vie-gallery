import { chromium, expect } from '@playwright/test'
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const failures=[]
page.on('pageerror', e=>failures.push(e.message))
await page.route('**/api/public/g/background-check/photos*', r=>r.fulfill({json:{items:[{title:'失败照片',thumbnailUrl:'https://vie-gallery.oss-cn-hangzhou.aliyuncs.com/tenant/test/photos/test/thumbnail?Expires=9999999999&Signature=a%2Bb%3D',width:800,height:600,sortOrder:0}],total:1,page:0,pageSize:50}}))
await page.route('**/api/public/g/background-check/viewer-config',r=>r.fulfill({json:{configJson:JSON.stringify({presetName:'minimal',particles:{enabled:false,types:[]},effects:{bloom:{enabled:false},fog:{enabled:false}},lighting:{autoColorAdapt:false}})}}))
await page.route('**/api/public/g/background-check',r=>r.fulfill({json:{slug:'background-check',title:'背景验证',visibility:'PUBLIC',accessState:'READY',photoCount:1,cover:null}}))
let proxied=false
let hangPhoto=false
await page.route('**/oss/tenant/**',r=>{expect(r.request().url()).toContain('Signature=a%2Bb%3D');proxied=true;if(hangPhoto)return;return r.fulfill({status:404,body:'missing'})})
await page.route('**/background-parent',r=>r.fulfill({contentType:'text/html',body:'<iframe style="width:100%;height:860px;border:0" src="/g/background-check?preview=test&embed=preview"></iframe>'}))
await page.goto('http://localhost:5274/background-parent')
await page.locator('iframe').waitFor()
const frame = page.frameLocator('iframe')
await expect(frame.locator('canvas')).toBeVisible()
await expect(frame.locator('.photo-load-notice')).toBeVisible({timeout:15000})
await expect(frame.locator('.photo-load-notice')).toBeHidden({timeout:8000})
expect(proxied).toBe(true)
let previewFrame=page.frames().find(f=>f.url().includes('/g/background-check'))
await previewFrame.goto(previewFrame.url())
await expect(frame.locator('.photo-load-notice')).toBeVisible()
await frame.getByRole('button',{name:'关闭照片加载提示'}).click()
await expect(frame.locator('.photo-load-notice')).toBeHidden()
hangPhoto=true
await previewFrame.goto(previewFrame.url(),{waitUntil:'domcontentloaded'})
await expect(frame.locator('.photo-load-notice')).toBeVisible({timeout:16000})
await expect(frame.locator('.photo-load-notice')).toBeHidden({timeout:8000})
await expect(frame.locator('.photo-load-notice')).toBeHidden()
hangPhoto=false
await frame.locator('canvas').click()
const lateBackground = 'http://localhost:5274/g/backgrounds/forest-dream.webp'
await page.route(lateBackground,async route=>{await new Promise(r=>setTimeout(r,800));await route.continue()})
const childForRace = page.frames().find(f=>f.url().includes('/g/background-check'))
const raceResult = await childForRace.evaluate(async()=>{
  const {ViewerEngine}=await import('/g/src/core/ViewerEngine.ts')
  const canvas=document.createElement('canvas');canvas.style.width='100px';canvas.style.height='100px';document.body.append(canvas)
  const engine=new ViewerEngine(canvas,{particles:{enabled:false,types:[]},effects:{bloom:{enabled:false},fog:{enabled:false}}})
  await engine.applyConfig({background:{type:'image',image:{url:'/g/backgrounds/forest-dream.webp'}}})
  await engine.applyConfig({background:{type:'image',image:{url:'/g/backgrounds/starry-night.webp'}}})
  await new Promise(r=>setTimeout(r,1500))
  const source=engine.getScene().background?.image?.src || ''
  await engine.applyConfig({background:{type:'none'}})
  const cleared=engine.getScene().background===null
  engine.dispose();canvas.remove()
  return {source,cleared}
})
expect(raceResult.source).toContain('starry-night.webp')
expect(raceResult.cleared).toBe(true)
const child = page.frames().find(f=>f.url().includes('/g/background-check'))
const presets=await child.evaluate(async()=>{const {ConfigManager,BUILTIN_PRESETS}=await import('/g/src/core/ConfigManager.ts');const c=new ConfigManager();return await Promise.all(Object.keys(BUILTIN_PRESETS).map(async name=>({name,background:(await c.loadPreset(name)).background})))})
expect(presets).toHaveLength(8)
for(const p of presets){expect(p.background.image.url).toContain(p.name);const r=await page.request.get('http://localhost:5274'+p.background.image.url);expect(r.ok()).toBe(true);expect(r.headers()['content-type']).toMatch(/image/)}
expect(failures).toEqual([])
await page.screenshot({path:'e2e/background-preview-verify.png'})
console.log(JSON.stringify({presets:presets.map(p=>p.name),proxied,noticeAutoHidden:true,hangingRequestAutoHidden:true,manualDismiss:true,raceResult,failures}))
await browser.close()
