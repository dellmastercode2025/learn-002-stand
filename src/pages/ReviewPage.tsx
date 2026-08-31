import { Link } from 'react-router-dom';
import { BookOpen, Eraser, RefreshCw } from 'lucide-react';
import { sifatById } from '@/data/sifat';
import { lessonBySlug } from '@/data/lessons';
import { useAppState } from '@/lib/app-state';
import { usePageMeta } from '@/lib/use-page-meta';
import type { SifatId } from '@/types';
import { plural } from '@/lib/utils';

export default function ReviewPage() {
  usePageMeta(
    'Что повторить: персональный план | Таджвид',
    'Умное повторение: сыфаты, в которых ты чаще ошибаешься, и уроки, которые стоит освежить.',
  );
  const { progress, clearMistakes } = useAppState();

  const entries = (Object.entries(progress.mistakes) as [SifatId, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="mx-auto max-w-content">
      <h1 className="mb-2 font-serif text-3xl font-bold">Что повторить</h1>
      <p className="mb-8 max-w-lg text-sm text-ink-soft dark:text-night-soft">
        Здесь собираются сыфаты, в которых ты ошибался в тестах и тренажёрах. Чем больше ошибок —
        тем выше тема в списке.
      </p>

      {entries.length === 0 ? (
        <div className="card p-10 text-center">
          <RefreshCw className="mx-auto mb-3 h-10 w-10 text-sage-300" aria-hidden="true" />
          <p className="mb-2 font-serif text-xl font-semibold">Пока повторять нечего</p>
          <p className="mx-auto mb-6 max-w-sm text-sm text-ink-soft dark:text-night-soft">
            Пройди пару тренажёров или итоговый тест — если появятся ошибки, они превратятся здесь
            в план повторения.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/practice" className="btn-primary">
              К практике
            </Link>
            <Link to="/quiz" className="btn-secondary">
              К тесту
            </Link>
          </div>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {entries.map(([id, count]) => {
              const s = sifatById[id];
              const lesson = lessonBySlug[s.lessonSlug];
              return (
                <li key={id} className="card flex flex-wrap items-center gap-3 p-4">
                  <span className="arabic w-24 shrink-0 text-2xl text-sage-700 dark:text-sage-300">
                    {s.arabicName}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">Стоит повторить: {s.russianName}</p>
                    <p className="text-xs text-ink-soft dark:text-night-soft">
                      {count} {plural(count, 'ошибка', 'ошибки', 'ошибок')} · {s.meaning}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Link to={`/sifat/${id}`} className="btn-secondary !px-3 !py-1.5 text-xs">
                      Сыфат
                    </Link>
                    {lesson && (
                      <Link to={`/course/${lesson.slug}`} className="btn-primary !px-3 !py-1.5 text-xs">
                        <BookOpen className="h-3.5 w-3.5" />
                        Урок {lesson.number}
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/practice" className="btn-primary">
              Тренировать слабые места
            </Link>
            <button type="button" className="btn-ghost" onClick={clearMistakes}>
              <Eraser className="h-4 w-4" />
              Очистить статистику ошибок
            </button>
          </div>
        </>
      )}
    </div>
  );
}
