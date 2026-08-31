import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { sifatById } from '@/data/sifat';
import { letterById } from '@/data/letters';
import type { LetterId, SifatId } from '@/types';
import { cn } from '@/lib/utils';

type FlowGroup = 'shidda' | 'tawassut' | 'rakhawa';

const scaleLetters: { letterId: LetterId; group: FlowGroup }[] = [
  { letterId: 'ba', group: 'shidda' },
  { letterId: 'qaf', group: 'shidda' },
  { letterId: 'dal', group: 'shidda' },
  { letterId: 'lam', group: 'tawassut' },
  { letterId: 'nun', group: 'tawassut' },
  { letterId: 'ayn', group: 'tawassut' },
  { letterId: 'sin', group: 'rakhawa' },
  { letterId: 'shin', group: 'rakhawa' },
  { letterId: 'zha', group: 'rakhawa' },
];

const groupInfo: Record<FlowGroup, { pos: number; note: string; can: string }> = {
  shidda: {
    pos: 8,
    note: 'Опора крепкая — звук полностью запирается в махрадже.',
    can: 'Потянуть нельзя: звук хлопнул и закончился.',
  },
  tawassut: {
    pos: 50,
    note: 'Опора средняя — звук проходит частично, «в обход» преграды.',
    can: 'Тянется, но не так свободно, как буквы рихвы.',
  },
  rakhawa: {
    pos: 92,
    note: 'Опора слабая — звук свободно течёт через махрадж.',
    can: 'Можно тянуть, пока хватает дыхания.',
  },
};

/** Интерактив урока 4: шкала «звук задерживается ←→ звук проходит» */
export function FlowScale() {
  const [selected, setSelected] = useState<LetterId>('ba');
  const reduced = useReducedMotion();
  const entry = scaleLetters.find((s) => s.letterId === selected)!;
  const info = groupInfo[entry.group];
  const sifat = sifatById[entry.group as SifatId];
  const letter = letterById[selected];

  return (
    <div className="card p-5">
      <div className="mb-2 flex justify-between text-xs font-semibold uppercase tracking-wide text-ink-soft dark:text-night-soft">
        <span>Звук задерживается</span>
        <span>Звук проходит</span>
      </div>
      {/* Шкала */}
      <div className="relative mb-6 h-4 rounded-full bg-gradient-to-r from-rose-300 via-sand-300 to-sage-300">
        <motion.div
          className="absolute top-1/2 h-7 w-7 -translate-y-1/2 rounded-full border-4 border-white bg-sage-700 shadow-card dark:border-night-bg dark:bg-gold-400"
          initial={false}
          animate={{ left: `calc(${info.pos}% - 14px)` }}
          transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 200, damping: 22 }}
          aria-hidden="true"
        />
      </div>
      <div className="mb-1 flex justify-between text-xs font-medium text-ink-faint dark:text-night-faint">
        <span>Шидда</span>
        <span>Тавассут</span>
        <span>Рихва</span>
      </div>

      {/* Кнопки букв */}
      <div className="mb-4 mt-4 flex flex-wrap gap-2" role="group" aria-label="Выбор буквы">
        {scaleLetters.map(({ letterId }) => (
          <button
            key={letterId}
            type="button"
            aria-pressed={selected === letterId}
            onClick={() => setSelected(letterId)}
            className={cn(
              'arabic grid h-12 w-12 place-items-center rounded-soft border pb-1 text-2xl transition-all',
              selected === letterId
                ? 'scale-105 border-sage-600 bg-sage-100 text-sage-800 dark:border-sage-400 dark:bg-sage-900 dark:text-sage-200'
                : 'border-cream-300 bg-white text-ink hover:border-sage-300 dark:border-night-line dark:bg-night-card dark:text-night-text',
            )}
          >
            {letterById[letterId].arabic}
          </button>
        ))}
      </div>

      {/* Пояснение */}
      <div className="rounded-soft bg-cream-100 p-4 dark:bg-night-raise">
        <p className="mb-1 font-semibold">
          <span className="arabic mr-2 text-xl">{letter.arabic}</span>
          {letter.name}: {sifat.russianName} ({sifat.arabicName})
        </p>
        <p className="text-sm text-ink-soft dark:text-night-soft">{info.note}</p>
        <p className="mt-1 text-sm text-ink-soft dark:text-night-soft">
          <strong>Где преграда:</strong> {letter.makhraj}
        </p>
        <p className="mt-1 text-sm font-medium text-sage-700 dark:text-sage-300">{info.can}</p>
      </div>
    </div>
  );
}
