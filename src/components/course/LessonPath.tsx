import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, Circle, Leaf, Lock } from 'lucide-react';
import { lessons } from '@/data/lessons';
import { useAppState } from '@/lib/app-state';
import { cn } from '@/lib/utils';

type LessonStatus = 'done' | 'current' | 'available' | 'locked';

/** Визуальный маршрут из 12 уроков со статусами */
export function LessonPath() {
  const { progress, settings, setSequentialLock, isLessonUnlocked } = useAppState();
  const reduced = useReducedMotion();

  const firstIncomplete = lessons.find((l) => !progress.completedLessons.includes(l.slug));

  function statusOf(slug: string, number: number): LessonStatus {
    if (progress.completedLessons.includes(slug)) return 'done';
    if (!isLessonUnlocked(slug, number)) return 'locked';
    if (firstIncomplete?.slug === slug) return 'current';
    return 'available';
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-end gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-soft dark:text-night-soft">
          <input
            type="checkbox"
            checked={settings.sequentialLock}
            onChange={(e) => setSequentialLock(e.target.checked)}
            className="h-4 w-4 accent-sage-600"
          />
          Открывать уроки по порядку
        </label>
      </div>

      <ol className="relative">
        {/* Вертикальная линия-стебель */}
        <span
          aria-hidden="true"
          className="absolute bottom-6 left-[22px] top-6 w-0.5 bg-gradient-to-b from-sage-300 via-sage-200 to-sand-300 dark:from-sage-700 dark:via-night-line dark:to-night-line"
        />
        {lessons.map((lesson, i) => {
          const status = statusOf(lesson.slug, lesson.number);
          const locked = status === 'locked';
          const inner = (
            <>
              <span
                className={cn(
                  'relative z-10 grid h-11 w-11 shrink-0 place-items-center rounded-full border-2',
                  status === 'done' &&
                    'border-sage-500 bg-sage-500 text-cream-50 dark:border-sage-400 dark:bg-sage-400 dark:text-night-bg',
                  status === 'current' &&
                    'border-gold-400 bg-gold-300/30 text-gold-600 dark:text-gold-300',
                  status === 'available' &&
                    'border-sage-300 bg-white text-sage-500 dark:border-sage-700 dark:bg-night-card',
                  locked && 'border-cream-300 bg-cream-100 text-ink-faint dark:border-night-line dark:bg-night-raise dark:text-night-faint',
                )}
                aria-hidden="true"
              >
                {status === 'done' ? (
                  <Check className="h-5 w-5" />
                ) : status === 'current' ? (
                  <Leaf className="h-5 w-5" />
                ) : locked ? (
                  <Lock className="h-4 w-4" />
                ) : (
                  <Circle className="h-3 w-3" />
                )}
              </span>
              <span className="min-w-0 flex-1 pb-1">
                <span className="block text-xs font-semibold uppercase tracking-wide text-ink-faint dark:text-night-faint">
                  Урок {lesson.number}
                  {status === 'done' && ' · пройден'}
                  {status === 'current' && ' · текущий'}
                  {locked && ' · закрыт'}
                </span>
                <span className="block font-serif text-lg font-semibold leading-snug">{lesson.title}</span>
                <span className="block text-sm text-ink-soft dark:text-night-soft">{lesson.promise}</span>
              </span>
            </>
          );

          return (
            <motion.li
              key={lesson.slug}
              className="relative"
              initial={reduced ? false : { opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.35, delay: reduced ? 0 : Math.min(i * 0.04, 0.3) }}
            >
              {locked ? (
                <div
                  className="flex items-start gap-4 rounded-card px-2 py-3 opacity-70"
                  aria-label={`Урок ${lesson.number} закрыт: завершите предыдущий или отключите последовательный порядок`}
                >
                  {inner}
                </div>
              ) : (
                <Link
                  to={`/course/${lesson.slug}`}
                  className="flex items-start gap-4 rounded-card px-2 py-3 transition-colors hover:bg-cream-100/80 dark:hover:bg-night-raise"
                >
                  {inner}
                </Link>
              )}
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
