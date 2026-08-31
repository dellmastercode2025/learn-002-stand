import { chromium } from 'playwright-core';

const BASE = 'http://localhost:4173';
const OUT = process.env.SHOTS_DIR ?? '.';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

async function shot(name, url, { width, height, dark = false, fullPage = false, before }) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  await page.addInitScript((d) => {
    try {
      localStorage.setItem('sifat-course/progress', JSON.stringify({
        completedLessons: ['01-what-is-sifat'], lastLessonSlug: '02-map',
        quizResults: {}, mistakes: {}, onboardingDone: true,
      }));
      localStorage.setItem('sifat-course/settings', JSON.stringify({ theme: d ? 'dark' : 'light', sequentialLock: false }));
    } catch {}
  }, dark);
  await page.goto(BASE + url, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  if (before) await before(page);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
  await ctx.close();
  console.log(`shot: ${name}`);
}

await shot('home-light-desktop', '/', { width: 1280, height: 900 });
await shot('lesson3-light-desktop', '/course/03-hams-jahr', { width: 1280, height: 2400, fullPage: false });
await shot('lesson5-diagram', '/course/05-istila-istifal', {
  width: 1280, height: 900,
  before: async (p) => p.getByRole('heading', { name: 'Поймай движение языка' }).scrollIntoViewIfNeeded(),
});
await shot('map-dark-desktop', '/map', { width: 1280, height: 950, dark: true });
await shot('alphabet-light-mobile', '/letters', { width: 390, height: 844 });
await shot('letter-qaf-dark-mobile', '/letters/qaf', { width: 390, height: 844, dark: true });
await shot('lesson9-soundbirth', '/course/09-letter-dna', {
  width: 1280, height: 900,
  before: async (p) => p.locator('.card').nth(1).scrollIntoViewIfNeeded(),
});

await browser.close();
console.log('done');
