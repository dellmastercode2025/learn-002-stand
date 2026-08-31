import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { genClassifyQuestion } from '@/lib/practice';
import type { ClassifyQuestion, SifatId } from '@/types';
import { QuizRunner } from '@/components/quiz/QuizRunner';

const shelfSets: { label: string; groups: [SifatId, SifatId] | [SifatId, SifatId, SifatId] }[] = [
  { label: 'Хамс / Джахр', groups: ['hams', 'jahr'] },
  { label: 'Шидда / Тавассут / Рихва', groups: ['shidda', 'tawassut', 'rakhawa'] },
  { label: 'Исти‘ля / Истифаль', groups: ['istila', 'istifal'] },
  { label: 'Итбак / Инфитах', groups: ['itbaq', 'infitah'] },
  { label: 'Изляк / Исмат', groups: ['idhlaq', 'ismat'] },
];

/** Игровой тренажёр «Разложи по полочкам» */
export function Shelves() {
  const [setIdx, setSetIdx] = useState(0);
  const [round, setRound] = useState(0);
  const [question, setQuestion] = useState<ClassifyQuestion>(() =>
    genClassifyQuestion(shelfSets[0].groups, 3),
  );

  function start(idx: number) {
    setSetIdx(idx);
    setQuestion(genClassifyQuestion(shelfSets[idx].groups, 3));
    setRound((r) => r + 1);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Выбор полочек">
        {shelfSets.map((s, i) => (
          <button
            key={s.label}
            type="button"
            aria-pressed={i === setIdx}
            onClick={() => start(i)}
            className={i === setIdx ? 'btn-primary !px-3 !py-1.5 text-xs' : 'btn-secondary !px-3 !py-1.5 text-xs'}
          >
            {s.label}
          </button>
        ))}
        <button
          type="button"
          className="btn-ghost !px-3 !py-1.5 text-xs"
          onClick={() => start(setIdx)}
          aria-label="Новый набор букв"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Новые буквы
        </button>
      </div>
      <QuizRunner
        key={`${setIdx}-${round}`}
        questions={[question]}
        quizId={`shelves-${shelfSets[setIdx].groups.join('-')}`}
        title="Разложи по полочкам"
        onRestart={() => start(setIdx)}
      />
    </div>
  );
}
