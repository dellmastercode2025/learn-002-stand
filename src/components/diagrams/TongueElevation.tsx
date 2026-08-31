import { useState } from 'react';
import { sifatById } from '@/data/sifat';
import { letterById } from '@/data/letters';
import { cn } from '@/lib/utils';
import { MouthDiagram } from './MouthDiagram';

/** Интерактив урока 5: подъём задней части языка */
export function TongueElevation() {
  const [mode, setMode] = useState<'istila' | 'istifal'>('istila');
  const sifat = sifatById[mode];

  return (
    <div className="card p-5">
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Выбор сыфата">
        <button
          type="button"
          className={cn(mode === 'istila' ? 'btn-primary' : 'btn-secondary')}
          aria-pressed={mode === 'istila'}
          onClick={() => setMode('istila')}
        >
          Исти‘ля — <span className="arabic text-base">قَ</span>
        </button>
        <button
          type="button"
          className={cn(mode === 'istifal' ? 'btn-primary' : 'btn-secondary')}
          aria-pressed={mode === 'istifal'}
          onClick={() => setMode('istifal')}
        >
          Истифаль — <span className="arabic text-base">كَ</span>
        </button>
      </div>
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <MouthDiagram
          tongue={mode === 'istila' ? 'raised' : 'rest'}
          title={mode === 'istila' ? 'Исти‘ля: задняя часть языка поднята' : 'Истифаль: язык лежит низко'}
        />
        <div className="min-w-0 flex-1">
          <p className="arabic mb-1 text-2xl text-sage-700 dark:text-sage-300">{sifat.arabicName}</p>
          <p className="mb-2 font-semibold">
            {sifat.russianName} — {sifat.meaning}
          </p>
          <p className="text-sm leading-relaxed text-ink-soft dark:text-night-soft">{sifat.whatHappens}</p>
          {mode === 'istila' && (
            <p className="arabic mt-3 text-2xl leading-loose text-gold-600 dark:text-gold-300">
              {sifat.letters.map((l) => letterById[l].arabic).join(' ')}
            </p>
          )}
          <p className="mt-2 text-sm text-ink-soft dark:text-night-soft">
            {mode === 'istila'
              ? 'Семь твёрдых букв: خُصَّ ضَغْطٍ قِظْ. Во рту образуется «купол», звук наполняется.'
              : 'Все остальные буквы: язык спокоен, звук лёгкий и «светлый».'}
          </p>
        </div>
      </div>
    </div>
  );
}
