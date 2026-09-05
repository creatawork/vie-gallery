const { chromium } = require('playwright');

(async () => {
  console.log('Launching browser...');
  const browser = await chromium.launch({
    headless: true
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err));

  try {
    console.log('Navigating to http://localhost:5173/ ...');
    await page.goto('http://localhost:5173/', { timeout: 10000 });
    await page.waitForTimeout(1000);

    console.log('Current URL:', page.url());
    // 查看是否有登录或画廊列表
    const text = await page.textContent('body');
    console.log('Page content summary:', text.slice(0, 200));

    // 查找相册列表或者进入第一个相册
    const configLinks = await page.$$('a[href*="/config"]');
    console.log('Config links found:', configLinks.length);

    if (configLinks.length > 0) {
      await configLinks[0].click();
      await page.waitForTimeout(2000);
      console.log('Navigated to config page:', page.url());
      
      // 查找“保存发布配置”按钮
      const saveBtn = await page.waitForSelector('button:has-text("保存发布配置")', { timeout: 5000 });
      console.log('Clicking "保存发布配置"...');
      await saveBtn.click();
      console.log('Clicked "保存发布配置", waiting 3s to observe response...');
      await page.waitForTimeout(3000);
      console.log('After save wait, current state...');
    }
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
})();
