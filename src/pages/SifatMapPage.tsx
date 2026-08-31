import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { oppositionGroups, sifatById, unopposedSifat } from '@/data/sifat';
import { alphabetOrder, letterById } from '@/data/letters';
import { lessonBySlug } from '@/data/lessons';
import { usePageMeta } from '@/lib/use-page-meta';
import type { SifatId } from '@/types';
import { cn } from '@/lib/utils';

export default function SifatMapPage() {
  usePageMeta(
    'Карта сыфатов — вся система на одном экране | Таджвид',
    'Интерактивная mind-map всех 17 сыфатов с подсветкой букв: выбери сыфат — увидишь его буквы.',
  );
  const [selected, setSelected] = useState<SifatId | null>(null);
  const [zoom, setZoom] = useState(1);

  const selectedSifat = selected ? sifatById[selected] : null;
  const highlightSet = selectedSifat ? new Set(selectedSifat.letters) : null;

  function Node({ id }: { id: SifatId }) {
    const s = sifatById[id];
    const dimmed = selected !== null && selected !== id;
    return (
      <button
        type="button"
        onClick={() => setSelected(selected === id ? null : id)}
        aria-pressed={selected === id}
        className={cn(
          'rounded-soft border px-3 py-1.5 text-sm font-medium transition-all duration-300',
          selected === id &&
            'scale-105 border-sage-600 bg-sage-600 text-cream-50 shadow-lift dark:border-sage-400 dark:bg-sage-500 dark:text-night-bg',
          !selected &&
            'border-cream-300 bg-white hover:border-sage-400 dark:border-night-line dark:bg-night-card',
          dimmed && 'border-cream-200 bg-white opacity-35 dark:border-night-line dark:bg-night-card',
        )}
      >
        {s.russianName}
        <span className="arabic mr-1 block text-base leading-tight text-inherit opacity-80">{s.arabicName}</span>
      </button>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold">Карта сыфатов</h1>
          <p className="mt-1 max-w-lg text-sm text-ink-soft dark:text-night-soft">
            Нажми на сыфат: карта сфокусируется на нём, а его буквы подсветятся внизу.
          </p>
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Масштаб карты">
          <button
            type="button"
            className="btn-secondary !p-2"
            aria-label="Уменьшить"
            onClick={() => setZoom((z) => Math.max(0.7, +(z - 0.15).toFixed(2)))}
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="w-12 text-center text-xs font-semibold">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="btn-secondary !p-2"
            aria-label="Увеличить"
            onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.15).toFixed(2)))}
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="scroll-x card p-6">
        <div style={{ zoom }} className="min-w-[640px]">
          {/* Корень */}
          <div className="mb-6 text-center">
            <span className="inline-block rounded-card bg-sage-700 px-6 py-3 font-serif text-xl font-semibold text-cream-50 shadow-card dark:bg-sage-600">
              Сыфаты букв <span className="arabic block text-lg">صِفَاتُ الحُرُوف</span>
            </span>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Ветвь 1 */}
            <div className={cn('rounded-card border-2 border-dashed p-4 transition-opacity duration-300',
              selected && sifatById[selected].category === 'unopposed' ? 'opacity-40' : 'opacity-100',
              'border-sage-300 dark:border-sage-700')}
            >
              <h2 className="mb-3 text-center font-serif text-lg font-semibold">
                Имеющие противоположность
                <span className="block text-xs font-normal text-ink-soft dark:text-night-soft">5 групп · 10 сыфатов</span>
              </h2>
              <div className="space-y-3">
                {oppositionGroups.map((g) => (
                  <div key={g.group} className="rounded-soft bg-cream-100/70 p-3 dark:bg-night-raise">
                    <p className="mb-2 text-xs font-semibold text-gold-600 dark:text-gold-300">{g.title}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      {g.sifatIds.map((id, i) => (
                        <span key={id} className="flex items-center gap-2">
                          {i > 0 && <span aria-hidden="true" className="text-ink-faint">↔</span>}
                          <Node id={id} />
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Ветвь 2 */}
            <div className={cn('rounded-card border-2 border-dashed p-4 transition-opacity duration-300',
              selected && sifatById[selected].category === 'opposed' ? 'opacity-40' : 'opacity-100',
              'border-gold-300 dark:border-gold-500/40')}
            >
              <h2 className="mb-3 text-center font-serif text-lg font-semibold">
                Без противоположности
                <span className="block text-xs font-normal text-ink-soft dark:text-night-soft">7 особых примет</span>
              </h2>
              <div className="flex flex-wrap gap-2">
                {unopposedSifat.map((s) => (
                  <Node key={s.id} id={s.id} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Панель выбранного сыфата */}
      {selectedSifat && (
        <div className="card mt-4 p-5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="arabic text-2xl text-sage-700 dark:text-sage-300">{selectedSifat.arabicName}</span>
            <span className="font-serif text-lg font-semibold">{selectedSifat.russianName}</span>
            <span className="text-sm text-ink-soft dark:text-night-soft">{selectedSifat.meaning}</span>
          </div>
          <p className="mt-2 max-w-content text-sm leading-relaxed">{selectedSifat.shortDefinition}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to={`/sifat/${selectedSifat.id}`} className="btn-primary !px-3 !py-1.5 text-xs">
              Страница сыфата
            </Link>
            {lessonBySlug[selectedSifat.lessonSlug] && (
              <Link to={`/course/${selectedSifat.lessonSlug}`} className="btn-secondary !px-3 !py-1.5 text-xs">
                Урок {lessonBySlug[selectedSifat.lessonSlug].number}
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Алфавит с подсветкой */}
      <section className="mt-6">
        <h2 className="mb-3 font-serif text-xl font-semibold">
          {selectedSifat ? `Буквы сыфата «${selectedSifat.russianName}»` : 'Алфавит'}
        </h2>
        <ul className="flex flex-wrap gap-2" dir="rtl">
          {alphabetOrder.map((id) => {
            const l = letterById[id];
            const lit = highlightSet ? highlightSet.has(id) : true;
            return (
              <li key={id}>
                <Link
                  to={`/letters/${id}`}
                  className={cn(
                    'arabic grid h-12 w-12 place-items-center rounded-soft border pb-1 text-2xl transition-all duration-300',
                    lit
                      ? highlightSet
                        ? 'scale-105 border-gold-400 bg-gold-300/30 text-sage-900 shadow-card dark:border-gold-500 dark:bg-gold-500/20 dark:text-gold-200'
                        : 'border-cream-300 bg-white dark:border-night-line dark:bg-night-card'
                      : 'border-cream-200 bg-white opacity-25 dark:border-night-line dark:bg-night-card',
                  )}
                  title={l.name}
                >
                  {l.arabic}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
