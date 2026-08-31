import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Heart } from 'lucide-react';
import type { QuranExample } from '@/types';
import { tokenizeArabic } from '@/lib/arabic';
import { sifatById } from '@/data/sifat';
import { letterById } from '@/data/letters';
import { useAppState } from '@/lib/app-state';
import { cn } from '@/lib/utils';

/** Кораническое слово с подсветкой букв и карточками сыфатов */
export function QuranExampleCard({ example }: { example: QuranExample }) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const reduced = useReducedMotion();
  const { favorites, toggleFavoriteExample } = useAppState();
  const fav = favorites.examples.includes(example.id);

  const tokens = tokenizeArabic(example.arabic);
  const highlightByIndex = new Map(example.highlights.map((h) => [h.baseIndex, h]));
  const active = activeIdx !== null ? highlightByIndex.get(activeIdx) : undefined;

  return (
    <article className="card p-5">
      <div className="mb-1 flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gold-600 dark:text-gold-300">
          {example.sourceName} · {example.source}
        </p>
        <button
          type="button"
          onClick={() => toggleFavoriteExample(example.id)}
          aria-label={fav ? 'Убрать пример из избранного' : 'Добавить пример в избранное'}
          aria-pressed={fav}
          className={cn('p-1 transition-colors', fav ? 'text-rose-400' : 'text-ink-faint hover:text-rose-400 dark:text-night-faint')}
        >
          <Heart className="h-4 w-4" fill={fav ? 'currentColor' : 'none'} />
        </button>
      </div>

      <p className="arabic arabic-xl my-3 text-center" dir="rtl" lang="ar">
        {tokens.map((t, i) =>
          t.baseIndex !== null && highlightByIndex.has(t.baseIndex) ? (
            <button
              key={i}
              type="button"
              onClick={() => setActiveIdx(activeIdx === t.baseIndex ? null : t.baseIndex)}
              onMouseEnter={() => setActiveIdx(t.baseIndex)}
              aria-label={`Буква ${letterById[highlightByIndex.get(t.baseIndex)!.letter].name}: показать сыфаты`}
              className={cn(
                'rounded px-0.5 transition-colors',
                activeIdx === t.baseIndex
                  ? 'bg-gold-300/50 text-sage-900 dark:bg-gold-500/30 dark:text-gold-200'
                  : 'text-sage-700 underline decoration-gold-400 decoration-dotted underline-offset-8 hover:bg-gold-300/30 dark:text-sage-300',
              )}
            >
              {t.text}
            </button>
          ) : (
            <span key={i}>{t.text}</span>
          ),
        )}
      </p>

      <p className="mb-1 text-center text-sm text-ink-soft dark:text-night-soft">{example.translit}</p>
      <p className="mb-2 text-center text-sm italic text-ink-faint dark:text-night-faint">{example.translation}</p>

      <AnimatePresence mode="wait">
        {active && (
          <motion.div
            key={active.baseIndex}
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="mt-3 rounded-soft border border-gold-300/50 bg-sand-100/70 p-4 dark:border-gold-500/30 dark:bg-night-raise"
          >
            <p className="mb-1 text-sm font-semibold">
              <span className="arabic mr-2 text-xl">{letterById[active.letter].arabic}</span>
              {letterById[active.letter].name} — здесь проявляются:
            </p>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {active.sifatIds.map((s) => (
                <span key={s} className="badge-sage">
                  {sifatById[s].russianName}
                </span>
              ))}
            </div>
            <p className="text-sm leading-relaxed text-ink-soft dark:text-night-soft">{active.note}</p>
          </motion.div>
        )}
      </AnimatePresence>
      {!active && (
        <p className="mt-2 text-center text-xs text-ink-faint dark:text-night-faint">
          Наведи или нажми на подчёркнутую букву
        </p>
      )}
    </article>
  );
}
