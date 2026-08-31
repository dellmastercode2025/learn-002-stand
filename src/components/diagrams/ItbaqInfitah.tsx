import { useState } from 'react';
import { sifatById } from '@/data/sifat';
import { letterById } from '@/data/letters';
import { cn } from '@/lib/utils';
import { MouthDiagram } from './MouthDiagram';

/** Интерактив урока 6: «крышка» между языком и нёбом */
export function ItbaqInfitah() {
  const [mode, setMode] = useState<'itbaq' | 'infitah'>('itbaq');
  const sifat = sifatById[mode];

  return (
    <div className="card p-5">
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Выбор сыфата">
        <button
          type="button"
          className={cn(mode === 'itbaq' ? 'btn-primary' : 'btn-secondary')}
          aria-pressed={mode === 'itbaq'}
          onClick={() => setMode('itbaq')}
        >
          Итбак — <span className="arabic text-base">صَ</span>
        </button>
        <button
          type="button"
          className={cn(mode === 'infitah' ? 'btn-primary' : 'btn-secondary')}
          aria-pressed={mode === 'infitah'}
          onClick={() => setMode('infitah')}
        >
          Инфитах — <span className="arabic text-base">سَ</span>
        </button>
      </div>
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <MouthDiagram
          tongue={mode === 'itbaq' ? 'itbaq' : 'rest'}
          showGap
          title={mode === 'itbaq' ? 'Итбак: язык прижат к нёбу' : 'Инфитах: между языком и нёбом пространство'}
        />
        <div className="min-w-0 flex-1">
          <p className="arabic mb-1 text-2xl text-sage-700 dark:text-sage-300">{sifat.arabicName}</p>
          <p className="mb-2 font-semibold">
            {sifat.russianName} — {sifat.meaning}
          </p>
          <p className="text-sm leading-relaxed text-ink-soft dark:text-night-soft">{sifat.whatHappens}</p>
          {mode === 'itbaq' && (
            <p className="arabic mt-3 text-2xl text-gold-600 dark:text-gold-300">
              {sifat.letters.map((l) => letterById[l].arabic).join(' ')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
