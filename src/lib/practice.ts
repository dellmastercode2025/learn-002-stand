/**
 * Генераторы практических заданий.
 * Все вопросы строятся из единого data layer (sifat.ts, letters.ts,
 * quran-examples.ts) — контент не дублируется.
 */
import type {
  ClassifyQuestion,
  LetterId,
  MultiChoiceQuestion,
  OddOneOutQuestion,
  QuizQuestion,
  SifatId,
  SingleChoiceQuestion,
} from '@/types';
import { sifatById, sifatList } from '@/data/sifat';
import { alphabetOrder, letterById, letterWithSifatById } from '@/data/letters';
import { quranExamples } from '@/data/quran-examples';
import { pick, sample, shuffle } from './utils';

let uid = 0;
function nextId(prefix: string): string {
  uid += 1;
  return `${prefix}-${uid}`;
}

/** Сыфаты, удобные для вопросов (без «всё остальное»-списков) */
const compactSifatIds: SifatId[] = [
  'hams',
  'shidda',
  'tawassut',
  'istila',
  'itbaq',
  'idhlaq',
  'safir',
  'qalqala',
  'lin',
  'inhiraf',
  'takrir',
  'tafashshi',
  'istitala',
];

const interestingLetters: LetterId[] = [
  'ba', 'ta', 'tha', 'jim', 'hha', 'kha', 'dal', 'dhal', 'ra', 'zay',
  'sin', 'shin', 'sad', 'dad', 'tta', 'zha', 'ayn', 'ghayn', 'fa', 'qaf',
  'kaf', 'lam', 'mim', 'nun', 'ha', 'waw', 'ya',
];

/** Режим 1: «Какие сыфаты имеет эта буква?» */
export function genLetterSifatQuestion(): MultiChoiceQuestion {
  const letterId = pick(interestingLetters);
  const letter = letterWithSifatById[letterId];
  const correct = letter.sifatIds.filter((s) => compactSifatIds.includes(s));
  const wrongPool = compactSifatIds.filter((s) => !letter.sifatIds.includes(s));
  const correctChosen = sample(correct, Math.min(correct.length, 3));
  const wrongChosen = sample(wrongPool, Math.min(3, wrongPool.length));
  const options = shuffle(
    [...correctChosen, ...wrongChosen].map((s) => ({
      text: `${sifatById[s].russianName} (${sifatById[s].meaning})`,
      sifatId: s,
    })),
  );
  const correctIndices = options
    .map((o, i) => (correctChosen.includes(o.sifatId) ? i : -1))
    .filter((i) => i >= 0);
  return {
    id: nextId('l2s'),
    kind: 'multi',
    prompt: `Отметь все сыфаты, которыми обладает буква ${letter.name}:`,
    arabic: letter.arabic,
    options: options.map((o) => ({ text: o.text })),
    correctIndices,
    sifatIds: correctChosen,
    explanation: `${letter.name} (${letter.arabic}): ${letter.sifatIds
      .map((s) => sifatById[s].russianName)
      .join(', ')}. Махрадж: ${letter.makhraj}`,
  };
}

/** Режим 2: «Какие буквы относятся к этому сыфату?» */
export function genSifatLettersQuestion(): MultiChoiceQuestion {
  const sifatId = pick(compactSifatIds.filter((s) => sifatById[s].letters.length <= 10));
  const sifat = sifatById[sifatId];
  const correctChosen = sample(sifat.letters, Math.min(3, sifat.letters.length));
  const wrongPool = alphabetOrder.filter((l) => !sifat.letters.includes(l) && l !== 'alif' && l !== 'hamza');
  const wrongChosen = sample(wrongPool, 3);
  const options = shuffle(
    [...correctChosen, ...wrongChosen].map((l) => ({ letterId: l, arabic: letterById[l].arabic })),
  );
  const correctIndices = options
    .map((o, i) => (correctChosen.includes(o.letterId) ? i : -1))
    .filter((i) => i >= 0);
  return {
    id: nextId('s2l'),
    kind: 'multi',
    prompt: `${sifat.russianName} (${sifat.arabicName}, ${sifat.meaning}). Отметь буквы, у которых есть этот сыфат:`,
    options: options.map((o) => ({ text: letterById[o.letterId].name, arabic: o.arabic })),
    correctIndices,
    sifatIds: [sifatId],
    explanation: `${sifat.russianName}: ${sifat.letters.map((l) => letterById[l].arabic).join(' ')}${
      sifat.mnemonic ? ` — мнемоника ${sifat.mnemonic}` : ''
    }. ${sifat.shortDefinition}`,
  };
}

/** Режим 3: «Определи сыфат по описанию» */
export function genDescriptionQuestion(): SingleChoiceQuestion {
  const sifatId = pick(compactSifatIds);
  const sifat = sifatById[sifatId];
  const description = pick([sifat.shortDefinition, sifat.whatHappens]);
  const wrong = sample(
    sifatList.filter((s) => s.id !== sifatId),
    3,
  ).map((s) => s.id);
  const all = shuffle([sifatId, ...wrong]);
  return {
    id: nextId('desc'),
    kind: 'single',
    prompt: `«${description}» — о каком сыфате идёт речь?`,
    options: all.map((s) => ({ text: `${sifatById[s].russianName} — ${sifatById[s].meaning}` })),
    correctIndex: all.indexOf(sifatId),
    sifatIds: [sifatId],
    explanation: `${sifat.russianName} (${sifat.arabicName}): ${sifat.shortDefinition}`,
  };
}

/** Режим 4: «Найди лишнюю букву» */
export function genOddOneOutQuestion(): OddOneOutQuestion {
  const sifatId = pick(
    compactSifatIds.filter((s) => sifatById[s].letters.length >= 3 && sifatById[s].letters.length <= 10),
  );
  const sifat = sifatById[sifatId];
  const inGroup = sample(sifat.letters, 3);
  const outPool = interestingLetters.filter((l) => !sifat.letters.includes(l));
  const odd = pick(outPool);
  const options = shuffle([...inGroup, odd]);
  return {
    id: nextId('odd'),
    kind: 'odd-one-out',
    prompt: `Три буквы объединяет сыфат «${sifat.russianName}». Найди лишнюю:`,
    options: options.map((l) => ({ text: letterById[l].name, arabic: letterById[l].arabic })),
    correctIndex: options.indexOf(odd),
    sifatIds: [sifatId],
    explanation: `${inGroup.map((l) => letterById[l].arabic).join(' ')} — буквы сыфата «${
      sifat.russianName
    }» (${sifat.arabicName}), а у ${letterById[odd].arabic} этого сыфата нет.`,
  };
}

/** Пары «двойников» для сравнения */
export const comparePairs: [LetterId, LetterId][] = [
  ['ta', 'tta'],
  ['sin', 'sad'],
  ['kaf', 'qaf'],
  ['dhal', 'zha'],
  ['sin', 'zay'],
  ['hha', 'ha'],
  ['tha', 'sin'],
  ['dal', 'dad'],
];

/** Режим 5: «Каким сыфатом различаются две буквы?» */
export function genCompareQuestion(): SingleChoiceQuestion {
  const [aId, bId] = pick(comparePairs);
  const a = letterWithSifatById[aId];
  const b = letterWithSifatById[bId];
  const diff = compactSifatIds.filter(
    (s) => a.sifatIds.includes(s) !== b.sifatIds.includes(s),
  );
  const common = compactSifatIds.filter(
    (s) => a.sifatIds.includes(s) && b.sifatIds.includes(s),
  );
  const answer = pick(diff);
  const wrongPool = [
    ...common,
    ...compactSifatIds.filter((s) => !a.sifatIds.includes(s) && !b.sifatIds.includes(s)),
  ].filter((s) => !diff.includes(s));
  const wrong = sample(wrongPool, 3);
  const all = shuffle([answer, ...wrong]);
  const holder = a.sifatIds.includes(answer) ? a : b;
  return {
    id: nextId('cmp'),
    kind: 'single',
    prompt: `Буквы ${a.name} и ${b.name} звучат по-разному. Какой из этих сыфатов есть только у одной из них?`,
    arabic: `${a.arabic} — ${b.arabic}`,
    options: all.map((s) => ({ text: sifatById[s].russianName })),
    correctIndex: all.indexOf(answer),
    sifatIds: [answer],
    explanation: `«${sifatById[answer].russianName}» есть у ${holder.arabic}, но не у ${
      holder.id === a.id ? b.arabic : a.arabic
    }. ${sifatById[answer].shortDefinition}`,
  };
}

/** Режим 6: «Разбери слово» — по кораническим примерам */
export function genWordQuestion(): MultiChoiceQuestion {
  const example = pick(quranExamples);
  const h = pick(example.highlights);
  const letter = letterById[h.letter];
  const correct = h.sifatIds.filter((s) => compactSifatIds.includes(s));
  const chosen = correct.length > 0 ? correct : h.sifatIds;
  const wrongPool = compactSifatIds.filter((s) => !letterWithSifatById[h.letter].sifatIds.includes(s));
  const wrong = sample(wrongPool, Math.min(3, wrongPool.length));
  const options = shuffle([...chosen, ...wrong]);
  return {
    id: nextId('word'),
    kind: 'multi',
    prompt: `${example.sourceName} (${example.source}). Какие сыфаты проявляются у буквы ${letter.name} в этом слове?`,
    arabic: example.arabic,
    options: options.map((s) => ({ text: sifatById[s].russianName })),
    correctIndices: options.map((s, i) => (chosen.includes(s) ? i : -1)).filter((i) => i >= 0),
    sifatIds: chosen,
    explanation: h.note,
  };
}

/** Классификация «Разложи по полочкам» */
export function genClassifyQuestion(
  groupIds: [SifatId, SifatId] | [SifatId, SifatId, SifatId],
  perGroup = 3,
): ClassifyQuestion {
  const categories = groupIds.map((s) => ({ id: s, label: sifatById[s].russianName }));
  const items = groupIds.flatMap((s) => {
    const others = groupIds.filter((g) => g !== s);
    const pool = sifatById[s].letters.filter(
      (l) =>
        l !== 'alif' &&
        l !== 'hamza' &&
        others.every((o) => !sifatById[o].letters.includes(l)),
    );
    return sample(pool, Math.min(perGroup, pool.length)).map((l) => ({
      arabic: letterById[l].arabic,
      letterId: l,
      categoryId: s,
    }));
  });
  return {
    id: nextId('cls'),
    kind: 'classify',
    prompt: `Разложи буквы по полочкам: ${groupIds.map((s) => sifatById[s].russianName).join(' / ')}`,
    categories,
    items: shuffle(items),
    sifatIds: [...groupIds],
    explanation: groupIds
      .map((s) => `${sifatById[s].russianName}: ${sifatById[s].letters.map((l) => letterById[l].arabic).join(' ')}`)
      .join('. '),
  };
}

export type PracticeMode =
  | 'letter-sifat'
  | 'sifat-letters'
  | 'description'
  | 'odd-one-out'
  | 'compare'
  | 'word';

export function genByMode(mode: PracticeMode): QuizQuestion {
  switch (mode) {
    case 'letter-sifat':
      return genLetterSifatQuestion();
    case 'sifat-letters':
      return genSifatLettersQuestion();
    case 'description':
      return genDescriptionQuestion();
    case 'odd-one-out':
      return genOddOneOutQuestion();
    case 'compare':
      return genCompareQuestion();
    case 'word':
      return genWordQuestion();
  }
}

/** Итоговый тест: смешанный набор из всех режимов */
export function genFinalQuiz(): QuizQuestion[] {
  const modes: PracticeMode[] = [
    'description',
    'letter-sifat',
    'sifat-letters',
    'odd-one-out',
    'compare',
    'word',
    'description',
    'letter-sifat',
    'sifat-letters',
    'compare',
    'odd-one-out',
    'word',
  ];
  const questions = modes.map((m) => genByMode(m));
  questions.push(genClassifyQuestion(['hams', 'jahr'], 3));
  questions.push(genClassifyQuestion(['shidda', 'tawassut', 'rakhawa'], 2));
  return questions;
}
