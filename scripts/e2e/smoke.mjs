import { chromium } from 'playwright-core';

const BASE = 'http://localhost:4173';
const routes = [
  '/',
  '/course',
  '/course/01-what-is-sifat',
  '/course/02-map',
  '/course/03-hams-jahr',
  '/course/04-shidda-rakhawa',
  '/course/05-istila-istifal',
  '/course/06-itbaq-infitah',
  '/course/07-idhlaq-ismat',
  '/course/08-unopposed',
  '/course/09-letter-dna',
  '/course/10-compare',
  '/course/11-quran',
  '/course/12-final-practice',
  '/map',
  '/sifat/hams',
  '/sifat/qalqala',
  '/sifat/istitala',
  '/letters',
  '/letters/qaf',
  '/letters/dad',
  '/compare?a=sin&b=sad',
  '/practice',
  '/quiz',
  '/review',
  '/favorites',
  '/about',
  '/nope-404',
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let failures = 0;

for (const viewport of [{ width: 1280, height: 900, name: 'desktop' }, { width: 390, height: 844, name: 'mobile' }]) {
  const ctx = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await ctx.newPage();
  await page.route(/fonts\.googleapis|fonts\.gstatic|ytimg|youtube/, (r) => r.abort());
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  for (const route of routes) {
    errors.length = 0;
    try {
      const resp = await page.goto(BASE + route, { waitUntil: 'load', timeout: 15000 });
      const status = resp?.status();
      await page.waitForTimeout(700);
      const bodyText = await page.evaluate(() => document.body.innerText.length);
      // отфильтруем сетевые ошибки внешних ресурсов (шрифты/thumbnail в песочнице)
      const realErrors = errors.filter(
        (e) => !/net::|Failed to load resource|ERR_|fonts.g|ytimg/.test(e),
      );
      if (realErrors.length > 0 || (status && status >= 400) || bodyText < 40) {
        failures++;
        console.log(`FAIL [${viewport.name}] ${route} status=${status} textLen=${bodyText}`);
        realErrors.slice(0, 4).forEach((e) => console.log('   ', e.slice(0, 300)));
      } else {
        console.log(`ok   [${viewport.name}] ${route}`);
      }
    } catch (e) {
      failures++;
      console.log(`FAIL [${viewport.name}] ${route}: ${e.message.slice(0, 200)}`);
    }
  }
  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? '\nALL ROUTES OK' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
