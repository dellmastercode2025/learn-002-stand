import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import { sifatList, sifatById } from '@/data/sifat';
import { letterById } from '@/data/letters';
import type { SifatId } from '@/types';
import { shuffle } from '@/lib/utils';

/** Тренировочный режим «Карточки»: лицевая сторона — арабский термин */
export function Flashcards() {
  const [queue, setQueue] = useState<SifatId[]>(() => shuffle(sifatList.map((s) => s.id)));
  const [flipped, setFlipped] = useState(false);
  const [knownCount, setKnownCount] = useState(0);
  const reduced = useReducedMotion();

  const total = sifatList.length;
  const current = queue[0];

  const stats = useMemo(
    () => ({ left: queue.length, known: knownCount }),
    [queue.length, knownCount],
  );

  function answer(kind: 'know' | 'repeat' | 'dontknow') {
    setFlipped(false);
    setQueue((prev) => {
      const [head, ...rest] = prev;
      if (kind === 'know') {
        setKnownCount((c) => c + 1);
        return rest;
      }
      // «Повторить» — вернём через 2 карточки, «Не знаю» — в конец
      if (kind === 'repeat') {
        const copy = [...rest];
        copy.splice(Math.min(2, copy.length), 0, head);
        return copy;
      }
      return [...rest, head];
    });
  }

  function restart() {
    setQueue(shuffle(sifatList.map((s) => s.id)));
    setKnownCount(0);
    setFlipped(false);
  }

  if (!current) {
    return (
      <div className="card p-8 text-center">
        <p className="mb-2 font-serif text-2xl font-semibold">Колода пройдена!</p>
        <p className="mb-4 text-sm text-ink-soft dark:text-night-soft">
          Все {total} сыфатов отмечены как «знаю».
        </p>
        <button type="button" className="btn-primary" onClick={restart}>
          <RotateCcw className="h-4 w-4" />
          Начать заново
        </button>
      </div>
    );
  }

  const s = sifatById[current];

  return (
    <div>
      <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-ink-faint dark:text-night-faint">
        Знаю: {stats.known} из {total} · осталось в колоде: {stats.left}
      </p>
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? 'Показать лицевую сторону' : 'Перевернуть карточку'}
        className="mx-auto block w-full max-w-md"
        style={{ perspective: '1200px' }}
      >
        <motion.div
          className="relative min-h-[280px]"
          initial={false}
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={reduced ? { duration: 0 } : { duration: 0.5 }}
          style={{ transformStyle: 'preserve-3d' }}
        >
          {/* Лицевая сторона */}
          <div
            className="card absolute inset-0 flex flex-col items-center justify-center p-6"
            style={{ backfaceVisibility: 'hidden' }}
          >
            <p className="arabic arabic-display text-sage-800 dark:text-sage-200" lang="ar">
              {s.arabicName}
            </p>
            <p className="mt-3 text-xs text-ink-faint dark:text-night-faint">нажми, чтобы перевернуть</p>
          </div>
          {/* Обратная сторона */}
          <div
            className="card absolute inset-0 flex flex-col justify-center overflow-y-auto p-6 text-left"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <p className="mb-0.5 font-serif text-xl font-semibold">
              {s.russianName} <span className="text-sm font-normal text-ink-soft dark:text-night-soft">({s.translit})</span>
            </p>
            <p className="mb-2 text-xs italic text-gold-600 dark:text-gold-300">{s.meaning}</p>
            <p className="mb-2 text-sm leading-relaxed">{s.shortDefinition}</p>
            <p className="arabic mb-1 text-xl leading-loose text-sage-700 dark:text-sage-300" dir="rtl">
              {s.letters.length > 12 ? '' : s.letters.map((l) => letterById[l].arabic).join(' ')}
            </p>
            {s.letters.length > 12 && (
              <p className="mb-1 text-xs text-ink-soft dark:text-night-soft">{s.letters.length} букв (все остальные)</p>
            )}
            {s.mnemonic && (
              <p className="text-sm">
                Мнемоника: <span className="arabic text-lg">{s.mnemonic}</span> ({s.mnemonicTranslit})
              </p>
            )}
            <p className="mt-2 text-xs text-ink-soft dark:text-night-soft">{s.feel}</p>
          </div>
        </motion.div>
      </button>

      <div className="mt-5 flex justify-center gap-2">
        <button type="button" className="btn-secondary" onClick={() => answer('dontknow')}>
          Не знаю
        </button>
        <button type="button" className="btn-secondary" onClick={() => answer('repeat')}>
          Повторить
        </button>
        <button type="button" className="btn-primary" onClick={() => answer('know')}>
          Знаю
        </button>
      </div>
    </div>
  );
}
