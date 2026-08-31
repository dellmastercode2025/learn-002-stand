import { chromium } from 'playwright-core';

const BASE = 'http://localhost:4173';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.route(/fonts\.googleapis|fonts\.gstatic|ytimg|youtube/, (r) => r.abort());

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

let step = '';
function log(s) {
  step = s;
  console.log(`→ ${s}`);
}

try {
  // 1. Онбординг
  log('Онбординг: три экрана и «Начать»');
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.getByRole('dialog').waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: 'Дальше' }).click();
  await page.getByRole('button', { name: 'Дальше' }).click();
  await page.getByRole('button', { name: 'Начать', exact: true }).click();
  await page.waitForURL('**/course/01-what-is-sifat');
  console.log('  ok: онбординг завершён, открыт урок 1');

  // 2. Мини-тест урока 1 (3 вопроса)
  log('Урок 1: прохождение мини-теста');
  for (let i = 0; i < 3; i++) {
    const group = page.getByRole('group', { name: 'Варианты ответа' });
    await group.waitFor();
    await group.getByRole('button').first().click();
    await page.getByRole('button', { name: i < 2 ? 'Дальше' : 'Завершить' }).click();
  }
  await page.getByText(/из 3/).first().waitFor();
  console.log('  ok: мини-тест пройден, показан результат');

  // 3. Переход к уроку 2
  log('Переход к уроку 2');
  await page.getByRole('button', { name: /Следующий урок/ }).click();
  await page.waitForURL('**/course/02-map');
  await page.getByRole('heading', { name: 'Большая карта сыфатов' }).waitFor();
  console.log('  ok: урок 2 открыт (последовательная блокировка снята прохождением урока 1)');

  // 3b. Дерево сыфатов интерактивно
  log('Урок 2: клик по узлу дерева');
  await page.getByRole('button', { name: 'Хамс', exact: true }).first().click();
  await page.getByText('Страница сыфата').first().waitFor();
  console.log('  ok: узел дерева открывает карточку сыфата');

  // 4. Прогресс на главной
  log('Главная: дашборд прогресса');
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.getByText('Твой прогресс').waitFor();
  await page.getByText(/Продолжить/).waitFor();
  console.log('  ok: главная показывает прогресс и кнопку «Продолжить»');

  // 5. Тёмная тема + сохранение
  log('Тёмная тема');
  await page.getByRole('button', { name: /тёмную тему/ }).click();
  let isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  if (!isDark) throw new Error('класс dark не применился');
  await page.reload({ waitUntil: 'load' });
  isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  if (!isDark) throw new Error('тема не сохранилась после перезагрузки');
  await page.getByRole('button', { name: /светлую тему/ }).click();
  console.log('  ok: тёмная тема включается и переживает перезагрузку');

  // 6. Практика: режим «Сыфаты буквы»
  log('Практика: режим «Сыфаты буквы»');
  await page.goto(BASE + '/practice', { waitUntil: 'load' });
  await page.getByRole('button', { name: /Сыфаты буквы/ }).click();
  await page.getByText(/1 \/ 6/).waitFor();
  const opts = page.locator('.card button', { hasText: /\(/ });
  await opts.first().click();
  await page.getByRole('button', { name: 'Проверить' }).click();
  await page.getByText(/Махрадж:/).waitFor();
  console.log('  ok: вопрос отвечен, показано объяснение с данными буквы');

  // 7. «Разложи по полочкам»: перенос буквы кликами
  log('Разложи по полочкам');
  await page.goto(BASE + '/practice', { waitUntil: 'load' });
  await page.getByRole('button', { name: /Разложи по полочкам/ }).click();
  const pool = page.locator('[aria-label="Буквы для распределения"] button');
  const count = await pool.count();
  for (let i = 0; i < count; i++) {
    await pool.first().click();
    await page.locator('[aria-label^="Полочка"] p').first().click();
  }
  await page.getByRole('button', { name: 'Проверить' }).click();
  await page.getByText(/Правильный ответ|Верно/).waitFor();
  console.log('  ok: буквы разложены, показан разбор');

  // 8. Итоговый тест
  log('Итоговый тест');
  await page.goto(BASE + '/quiz', { waitUntil: 'load' });
  await page.getByRole('button', { name: 'Начать тест' }).click();
  await page.getByText(/1 \/ 14/).waitFor();
  console.log('  ok: итоговый тест запускается (14 заданий)');

  // 9. Избранное
  log('Избранное: буква ق');
  await page.goto(BASE + '/letters/qaf', { waitUntil: 'load' });
  await page.getByRole('button', { name: 'В избранное' }).first().click();
  await page.goto(BASE + '/favorites', { waitUntil: 'load' });
  await page.getByTitle('Каф (глубокая)').waitFor();
  console.log('  ok: буква добавлена в избранное и видна на странице');

  // 10. Поиск
  log('Поиск «хамс»');
  await page.getByLabel(/Поиск/).fill('хамс');
  await page.getByRole('button', { name: /Хамс/ }).first().click();
  await page.waitForURL('**/sifat/hams');
  console.log('  ok: поиск ведёт на страницу сыфата');

  // 11. Коранические примеры: подсветка буквы
  log('Урок 11: подсветка буквы в примере');
  await page.goto(BASE + '/course/11-quran', { waitUntil: 'load' });
  // Урок закрыт последовательной блокировкой — проверяем экран и снимаем её
  await page.getByText('Урок пока закрыт').waitFor();
  await page.getByRole('button', { name: 'Открыть все уроки' }).click();
  console.log('  ok: экран блокировки работает, блокировка снимается кнопкой');
  const hl = page.locator('button[aria-label^="Буква"]').first();
  await hl.click();
  await page.getByText(/здесь проявляются/).first().waitFor();
  console.log('  ok: карточка сыфатов буквы появляется по клику');

  if (errors.length > 0) {
    console.log('\nPAGE ERRORS:', errors.slice(0, 5));
    process.exit(1);
  }
  console.log('\nUSER JOURNEY: ALL OK');
  await browser.close();
  process.exit(0);
} catch (e) {
  console.error(`\nFAIL на шаге «${step}»: ${e.message.slice(0, 400)}`);
  await page.screenshot({ path: 'journey-fail.png' }).catch(() => {});
  await browser.close();
  process.exit(1);
}
