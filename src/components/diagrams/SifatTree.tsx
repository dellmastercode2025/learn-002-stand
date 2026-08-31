import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { oppositionGroups, sifatById, sifatList, unopposedSifat } from '@/data/sifat';
import { letterById } from '@/data/letters';
import { lessonBySlug } from '@/data/lessons';
import type { SifatId } from '@/types';
import { cn } from '@/lib/utils';

type ViewMode = 'tree' | 'table' | 'cards';

function SifatNode({
  id,
  active,
  onClick,
}: {
  id: SifatId;
  active: boolean;
  onClick: () => void;
}) {
  const s = sifatById[id];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-soft border px-3 py-1.5 text-sm font-medium transition-all',
        active
          ? 'scale-105 border-sage-600 bg-sage-600 text-cream-50 shadow-card dark:border-sage-400 dark:bg-sage-500 dark:text-night-bg'
          : 'border-cream-300 bg-white hover:border-sage-400 hover:text-sage-800 dark:border-night-line dark:bg-night-card dark:hover:border-sage-500',
      )}
    >
      {s.russianName}
    </button>
  );
}

function SifatInfoPanel({ id }: { id: SifatId }) {
  const s = sifatById[id];
  const lesson = lessonBySlug[s.lessonSlug];
  return (
    <div className="rounded-soft border border-sage-200 bg-sage-50 p-4 dark:border-sage-800 dark:bg-night-raise">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="arabic text-2xl text-sage-800 dark:text-sage-200">{s.arabicName}</span>
        <span className="font-semibold">{s.russianName}</span>
        <span className="text-sm text-ink-soft dark:text-night-soft">{s.translit} · {s.meaning}</span>
      </div>
      <p className="mb-2 text-sm leading-relaxed">{s.shortDefinition}</p>
      <p className="arabic mb-3 text-xl leading-loose text-gold-600 dark:text-gold-300">
        {s.letters.map((l) => letterById[l].arabic).join(' ')}
      </p>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link to={`/sifat/${s.id}`} className="btn-secondary !px-3 !py-1.5">
          Страница сыфата
        </Link>
        {lesson && (
          <Link to={`/course/${lesson.slug}`} className="btn-ghost !px-3 !py-1.5">
            Урок {lesson.number}: {lesson.title}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}

/** Интерактивное дерево сыфатов с переключением Схема / Таблица / Карточки */
export function SifatTree() {
  const [view, setView] = useState<ViewMode>('tree');
  const [selected, setSelected] = useState<SifatId | null>(null);
  const reduced = useReducedMotion();

  const toggle = (id: SifatId) => setSelected((cur) => (cur === id ? null : id));

  return (
    <div className="card p-5">
      {/* Переключатель вида */}
      <div className="mb-5 flex overflow-hidden rounded-soft border border-cream-300 text-sm dark:border-night-line" role="group" aria-label="Вид карты">
        {(
          [
            ['tree', 'Схема'],
            ['table', 'Таблица'],
            ['cards', 'Карточки'],
          ] as [ViewMode, string][]
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            aria-pressed={view === mode}
            onClick={() => setView(mode)}
            className={cn(
              'flex-1 px-3 py-2 font-medium transition-colors',
              view === mode
                ? 'bg-sage-600 text-cream-50 dark:bg-sage-500 dark:text-night-bg'
                : 'bg-white text-ink-soft hover:bg-cream-100 dark:bg-night-card dark:text-night-soft dark:hover:bg-night-raise',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'tree' && (
        <div>
          <div className="mb-4 text-center">
            <span className="inline-block rounded-soft bg-sage-700 px-4 py-2 font-serif text-lg font-semibold text-cream-50 dark:bg-sage-600">
              Сыфаты <span className="arabic text-base">الصِّفَات</span>
            </span>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <motion.div
              initial={reduced ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <h3 className="mb-3 text-center text-sm font-bold uppercase tracking-wide text-ink-soft dark:text-night-soft">
                Имеющие противоположность
              </h3>
              <div className="space-y-3">
                {oppositionGroups.map((g, gi) => (
                  <motion.div
                    key={g.group}
                    className="rounded-soft border border-cream-200 p-3 dark:border-night-line"
                    initial={reduced ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: reduced ? 0 : 0.1 * gi, duration: 0.35 }}
                  >
                    <p className="mb-2 text-xs font-semibold text-gold-600 dark:text-gold-300">{g.title}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      {g.sifatIds.map((id, i) => (
                        <span key={id} className="flex items-center gap-2">
                          {i > 0 && <span className="text-ink-faint dark:text-night-faint">↔</span>}
                          <SifatNode id={id} active={selected === id} onClick={() => toggle(id)} />
                        </span>
                      ))}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
            <motion.div
              initial={reduced ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: reduced ? 0 : 0.2 }}
            >
              <h3 className="mb-3 text-center text-sm font-bold uppercase tracking-wide text-ink-soft dark:text-night-soft">
                Не имеющие противоположности
              </h3>
              <div className="flex flex-wrap gap-2 rounded-soft border border-cream-200 p-3 dark:border-night-line">
                {unopposedSifat.map((s, i) => (
                  <motion.span
                    key={s.id}
                    initial={reduced ? false : { opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: reduced ? 0 : 0.25 + i * 0.06 }}
                  >
                    <SifatNode id={s.id} active={selected === s.id} onClick={() => toggle(s.id)} />
                  </motion.span>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      )}

      {view === 'table' && (
        <div className="scroll-x">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-cream-300 text-left dark:border-night-line">
                <th className="py-2 pr-3 font-semibold">Сыфат</th>
                <th className="py-2 pr-3 font-semibold">Арабское</th>
                <th className="py-2 pr-3 font-semibold">Значение</th>
                <th className="py-2 pr-3 font-semibold">Противоположность</th>
                <th className="py-2 font-semibold">Буквы</th>
              </tr>
            </thead>
            <tbody>
              {sifatList.map((s) => (
                <tr
                  key={s.id}
                  className={cn(
                    'cursor-pointer border-b border-cream-200 transition-colors hover:bg-cream-100 dark:border-night-line dark:hover:bg-night-raise',
                    selected === s.id && 'bg-sage-50 dark:bg-night-raise',
                  )}
                  onClick={() => toggle(s.id)}
                >
                  <td className="py-2 pr-3 font-medium">{s.russianName}</td>
                  <td className="arabic py-2 pr-3 text-lg">{s.arabicName}</td>
                  <td className="py-2 pr-3 text-ink-soft dark:text-night-soft">{s.meaning}</td>
                  <td className="py-2 pr-3">
                    {s.oppositeIds ? s.oppositeIds.map((o) => sifatById[o].russianName).join(', ') : '—'}
                  </td>
                  <td className="arabic py-2 text-lg leading-relaxed">
                    {s.letters.length > 10 ? `${s.letters.length} букв` : s.letters.map((l) => letterById[l].arabic).join(' ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === 'cards' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sifatList.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => toggle(s.id)}
              aria-pressed={selected === s.id}
              className={cn(
                'card card-hover p-4 text-left',
                selected === s.id && 'ring-2 ring-sage-500',
              )}
            >
              <p className="arabic mb-1 text-xl text-sage-700 dark:text-sage-300">{s.arabicName}</p>
              <p className="font-semibold">{s.russianName}</p>
              <p className="text-xs text-ink-soft dark:text-night-soft">{s.meaning}</p>
            </button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {selected && (
          <motion.div
            className="mt-4"
            initial={reduced ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={reduced ? undefined : { opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
          >
            <SifatInfoPanel id={selected} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
