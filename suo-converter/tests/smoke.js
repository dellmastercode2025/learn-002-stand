/*
 * Проверка ядра маппинга на реальном файле ТТ (без браузера).
 *   npm install            (ставит exceljs из devDependencies)
 *   node tests/smoke.js /path/to/T_-KMTF-2026.09_CONSO_1.xlsm
 * Выводит строки R3 с контролем к балансу, страны 2R, итоги 4R и журнал. Код выхода 1, если
 * есть расхождения с балансом ТТ.
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const SUO = require(path.join(__dirname, '..', 'js', 'mapping.js'));

(async () => {
  const file = process.argv[2];
  if (!file) { console.error('Укажите путь к файлу ТТ'); process.exit(2); }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(fs.readFileSync(file));
  const tt = SUO.parseTT(wb, {});
  const res = SUO.compute(tt, {});
  const f = SUO.fmt;
  console.log('Период:', tt.info.period && tt.info.period.label, '| компания:', tt.info.company, '| строк ТТ:', tt.rows.length);
  console.log('\n--- R3');
  let bad = 0;
  for (const L of SUO.R3_LINES) {
    const l = res.r3.lines[L.row];
    if (Math.abs(l.diff) > 1) bad++;
    const nz = Object.entries(l.cur).filter(([, v]) => v).map(([k, v]) => `${k}=${f(v)}`).join(' ');
    console.log(String(L.row).padStart(3), L.name.padEnd(62).slice(0, 62), 'итого', f(l.total).padStart(14), 'баланс', f(l.control).padStart(14), Math.abs(l.diff) > 1 ? 'РАСХОЖДЕНИЕ ' + f(l.diff) : 'ok', '|', nz);
  }
  const t = SUO.r3Totals(res.r3.lines);
  console.log('Активы', f(t.assets.total), '(баланс', f(res.r3.bs.assets) + ')', '| Обязательства', f(t.liabilities.total), '(баланс', f(res.r3.bs.liabilities) + ')', '| Капитал', f(res.r3.equity));
  console.log('ЧВП по валютам:', Object.entries(t.nfp.cur).filter(([, v]) => v).map(([k, v]) => `${k}=${f(v)}`).join(' '), '| ОВП без тенге', f(t.nfp.fx));
  console.log('\n--- 2R');
  for (const [c, v] of Object.entries(res.r2.countries).sort((a, b) => SUO.R2_COLS.reduce((s, k) => s + b[1][k], 0) - SUO.R2_COLS.reduce((s, k) => s + a[1][k], 0))) console.log(c.padEnd(42), SUO.R2_COLS.map(k => `${k}=${f(v[k])}`).join(' '));
  console.log('\n--- 4R: доля чувствительных', (res.r4.share * 100).toFixed(2) + '%', res.r4.blank ? '(пустографка)' : '(заполняется)');
  const tot = SUO.r4Totals(res.r4.cells);
  console.log('Разрыв по срокам:', SUO.R4_BUCKETS.map(b => `${SUO.R4_BUCKET_LABEL[b]}=${f(tot.gap[b])}`).join('; '));
  console.log('\n--- Журнал');
  res.log.forEach(l => console.log(l.level.padEnd(5), l.form, (l.row || '').toString().padStart(3), l.msg));
  if (bad || Math.abs(t.assets.total - res.r3.bs.assets) > 1 || Math.abs(t.liabilities.total - res.r3.bs.liabilities) > 1) { console.error('\nЕсть расхождения с балансом ТТ'); process.exit(1); }
  console.log('\nКонтроль с балансом пройден');
})().catch(e => { console.error(e); process.exit(1); });
