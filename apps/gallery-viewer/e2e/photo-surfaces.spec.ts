import { test, expect } from '@playwright/test'

test('front and rear render the full photograph upright with readable colors', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/g/e2e/fixtures/photo-surfaces.html')
  await page.waitForFunction(() => 'photoSurfaces' in window)
  for (const side of [1, -1]) {
    const pixels = await page.evaluate(side => (window as any).photoSurfaces.render(side), side)
    const [red, green, blue, yellow] = pixels as number[][]
    expect(red[0] - Math.max(red[1], red[2])).toBeGreaterThan(60)
    expect(green[1] - Math.max(green[0], green[2])).toBeGreaterThan(60)
    expect(blue[2] - Math.max(blue[0], blue[1])).toBeGreaterThan(60)
    expect(Math.min(yellow[0], yellow[1]) - yellow[2]).toBeGreaterThan(60)
    await page.locator('canvas').screenshot({ path: info.outputPath(side === 1 ? 'photo-front.png' : 'photo-back.png') })
  }
  expect(errors).toEqual([])
})
