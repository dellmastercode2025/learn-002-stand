import { useState } from 'react';
import { sifatById } from '@/data/sifat';
import { cn } from '@/lib/utils';
import { MouthDiagram } from './MouthDiagram';

/** Интерактив урока 3: поток воздуха при хамсе и джахре */
export function AirflowHamsJahr() {
  const [mode, setMode] = useState<'hams' | 'jahr'>('hams');
  const sifat = sifatById[mode];

  return (
    <div className="card p-5">
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Выбор сыфата">
        <button
          type="button"
          className={cn(mode === 'hams' ? 'btn-primary' : 'btn-secondary')}
          aria-pressed={mode === 'hams'}
          onClick={() => setMode('hams')}
        >
          Хамс — <span className="arabic text-base">سْ</span>
        </button>
        <button
          type="button"
          className={cn(mode === 'jahr' ? 'btn-primary' : 'btn-secondary')}
          aria-pressed={mode === 'jahr'}
          onClick={() => setMode('jahr')}
        >
          Джахр — <span className="arabic text-base">دْ</span>
        </button>
      </div>
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <MouthDiagram
          tongue="rest"
          airflow={mode === 'hams' ? 'free' : 'blocked'}
          title={mode === 'hams' ? 'Хамс: воздух свободно выходит' : 'Джахр: воздух задержан'}
        />
        <div className="min-w-0 flex-1">
          <p className="arabic mb-1 text-2xl text-sage-700 dark:text-sage-300">{sifat.arabicName}</p>
          <p className="mb-2 font-semibold">
            {sifat.russianName} — {sifat.meaning}
          </p>
          <p className="text-sm leading-relaxed text-ink-soft dark:text-night-soft">{sifat.whatHappens}</p>
          <p className="mt-3 rounded-soft bg-sage-50 p-3 text-sm dark:bg-night-raise">
            {mode === 'hams'
              ? 'Поток воздуха свободно проходит через махрадж и выходит изо рта — ладонь у губ его чувствует.'
              : 'Опора на махрадж сильная: дыхание задерживается, наружу почти ничего не выходит — звук плотный и звонкий.'}
          </p>
        </div>
      </div>
    </div>
  );
}
