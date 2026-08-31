/**
 * Проверка целостности учебных данных: npm run check-data
 *
 * — количество букв в каждом сыфате (сумма противоположных = 29);
 * — симметричность ссылок на противоположности;
 * — у каждой буквы ровно 5 «обязательных» сыфатов (по одному из группы);
 * — корректность baseIndex в коранических примерах (буква на этой позиции
 *   действительно та, что заявлена);
 * — все уроки и слаги согласованы.
 */
import { sifatById, sifatList, oppositionGroups } from '../src/data/sifat';
import { letters, lettersWithSifat } from '../src/data/letters';
import { quranExamples } from '../src/data/quran-examples';
import { lessons, lessonBySlug } from '../src/data/lessons';
import { tokenizeArabic } from '../src/lib/arabic';

let errors = 0;
function err(msg: string) {
  errors += 1;
  console.error(`✗ ${msg}`);
}
function ok(msg: string) {
  console.log(`✓ ${msg}`);
}

// 1. Количество букв
const TOTAL = 29;
if (letters.length !== TOTAL) err(`букв ${letters.length}, ожидалось ${TOTAL}`);
else ok(`букв: ${TOTAL}`);

const expectCounts: Record<string, number> = {
  hams: 10, jahr: 19, shidda: 8, tawassut: 5, rakhawa: 16,
  istila: 7, istifal: 22, itbaq: 4, infitah: 25, idhlaq: 6, ismat: 23,
  safir: 3, qalqala: 5, lin: 2, inhiraf: 2, takrir: 1, tafashshi: 1, istitala: 1,
};
for (const s of sifatList) {
  const expected = expectCounts[s.id];
  if (s.letters.length !== expected) {
    err(`${s.id}: букв ${s.letters.length}, ожидалось ${expected}`);
  }
  const uniq = new Set(s.letters);
  if (uniq.size !== s.letters.length) err(`${s.id}: дубликаты букв`);
}
ok('размеры всех 18 списков букв соответствуют классической системе');

// 2. Каждая группа противоположностей покрывает все 29 букв без пересечений
for (const g of oppositionGroups) {
  const all = g.sifatIds.flatMap((id) => sifatById[id].letters);
  const uniq = new Set(all);
  if (all.length !== TOTAL || uniq.size !== TOTAL) {
    err(`группа «${g.title}»: покрывает ${uniq.size}/${all.length} букв, ожидалось ${TOTAL} без пересечений`);
  }
}
ok('каждая группа противоположных сыфатов покрывает все буквы ровно один раз');

// 3. Симметричность противоположностей
for (const s of sifatList) {
  for (const o of s.oppositeIds ?? []) {
    if (!sifatById[o].oppositeIds?.includes(s.id)) {
      err(`противоположность не симметрична: ${s.id} → ${o}`);
    }
  }
}
ok('противоположные сыфаты связаны симметрично');

// 4. У каждой буквы по одному сыфату из каждой группы
for (const l of lettersWithSifat) {
  for (const g of oppositionGroups) {
    const inGroup = g.sifatIds.filter((id) => l.sifatIds.includes(id));
    if (inGroup.length !== 1) {
      err(`буква ${l.id}: в группе «${g.title}» ${inGroup.length} сыфатов (${inGroup.join(', ')})`);
    }
  }
}
ok('у каждой буквы ровно 5 «обязательных» сыфатов');

// 5. Коранические примеры: baseIndex указывает на заявленную букву
const letterArabic = new Map(letters.map((l) => [l.id, l.arabic]));
for (const e of quranExamples) {
  const tokens = tokenizeArabic(e.arabic).filter((t) => t.baseIndex !== null);
  for (const h of e.highlights) {
    const token = tokens.find((t) => t.baseIndex === h.baseIndex);
    if (!token) {
      err(`${e.id}: baseIndex ${h.baseIndex} вне диапазона (букв: ${tokens.length})`);
      continue;
    }
    const base = [...token.text][0];
    const expected = letterArabic.get(h.letter)!;
    // Хамза может писаться на подставке (أ إ ئ ؤ)
    const hamzaForms = ['ء', 'أ', 'إ', 'ئ', 'ؤ'];
    const matches =
      base === expected ||
      (h.letter === 'hamza' && hamzaForms.includes(base)) ||
      (h.letter === 'alif' && ['ا', 'آ', 'ى'].includes(base));
    if (!matches) {
      err(`${e.id}: на позиции ${h.baseIndex} стоит «${base}», а заявлена буква ${h.letter} («${expected}»)`);
    }
    for (const sid of h.sifatIds) {
      const sifat = sifatById[sid];
      if (!sifat) {
        err(`${e.id}: неизвестный сыфат ${sid}`);
      } else if (!sifat.letters.includes(h.letter)) {
        err(`${e.id}: буква ${h.letter} не имеет сыфата ${sid}`);
      }
    }
  }
}
ok('подсветки коранических примеров указывают на правильные буквы и сыфаты');

// 6. Уроки
if (lessons.length !== 12) err(`уроков ${lessons.length}, ожидалось 12`);
lessons.forEach((l, i) => {
  if (l.number !== i + 1) err(`урок ${l.slug}: number=${l.number}, позиция ${i + 1}`);
  if (l.miniQuiz.length < 3) err(`урок ${l.slug}: мини-тест из ${l.miniQuiz.length} вопросов (< 3)`);
});
for (const s of sifatList) {
  if (!lessonBySlug[s.lessonSlug]) err(`${s.id}: ссылается на несуществующий урок ${s.lessonSlug}`);
}
ok('12 уроков, у каждого мини-тест, все ссылки сыфат→урок корректны');

console.log(`\nИтог: ${errors === 0 ? 'все проверки пройдены' : `ошибок — ${errors}`}`);
process.exit(errors > 0 ? 1 : 0);
