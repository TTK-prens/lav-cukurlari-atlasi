import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = process.argv[3] || 'https://ttk-prens.github.io/lav-cukurlari-atlasi/';
const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
  args: ['--hide-scrollbars'],
});
const ctx = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } },
});
const tCtx = Date.now();
const page = await ctx.newPage();

// Önbelleği ısıt: harita döşemeleri ve görseller kayıtta takılmasın
for (const h of ['#/home', '#/atlas', '#/karsilastir', '#/siralama', '#/gorev', '#/home']) {
  await page.goto(BASE + '?lang=en' + h, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
}
// Arsia'ya yakınlaşma döşemelerini de ısıt (videodaki flyTo ile aynı hedef)
await page.goto(BASE + '?lang=en#/atlas', { waitUntil: 'networkidle' });
for (const id of ['MARS-02', 'MARS-01']) {
  await page.click(`button.li[data-id="${id}"]`);
  await page.waitForTimeout(2500);
  await page.waitForLoadState('networkidle');
}

await page.addInitScript(() => {
  // altyazı her değiştiğinde sayfa saatine göre zaman damgası tut
  window.__caps = [];
  let last = '';
  const tick = () => {
    const el = document.querySelector('#tour .tour-txt');
    const txt = el ? el.textContent : '';
    if (txt !== last) { window.__caps.push({ t: performance.now(), txt }); last = txt; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
await page.goto(BASE + '?video=1&lang=en&team=Milestone#/home', { waitUntil: 'networkidle' });
await page.waitForSelector('#tour', { timeout: 15000 });
const tStart = Date.now();
await page.waitForSelector('#tour', { state: 'detached', timeout: 60000 });
const tEnd = Date.now();
const caps = await page.evaluate(() => window.__caps);
fs.writeFileSync(OUT + '/caps.json', JSON.stringify(caps, null, 1));
await page.waitForTimeout(600);
const video = page.video();
await ctx.close();
const path = await video.path();
await browser.close();
const res = { video: path, start_s: (tStart - tCtx) / 1000, end_s: (tEnd - tCtx) / 1000, dur_s: (tEnd - tStart) / 1000 };
fs.writeFileSync(OUT + '/timing.json', JSON.stringify(res, null, 1));
console.log(JSON.stringify(res));
