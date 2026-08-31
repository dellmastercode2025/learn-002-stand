import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, BookOpen, Map, RefreshCw } from 'lucide-react';
import { lessons } from '@/data/lessons';
import { sifatById } from '@/data/sifat';
import { useAppState } from '@/lib/app-state';
import { usePageMeta } from '@/lib/use-page-meta';
import { LessonPath } from '@/components/course/LessonPath';
import type { SifatId } from '@/types';

export default function HomePage() {
  usePageMeta(
    'Сыфаты в таджвиде — интерактивный курс',
    'Перестань заучивать таблицы. Начни понимать, как рождается звук: 12 уроков, схемы, тренажёры и проверенные видео.',
  );
  const { progress } = useAppState();
  const reduced = useReducedMotion();

  const started = progress.completedLessons.length > 0 || progress.lastLessonSlug !== null;
  const doneCount = progress.completedLessons.length;
  const pct = Math.round((doneCount / lessons.length) * 100);
  const continueLesson =
    lessons.find((l) => l.slug === progress.lastLessonSlug && !progress.completedLessons.includes(l.slug)) ??
    lessons.find((l) => !progress.completedLessons.includes(l.slug)) ??
    lessons[0];

  const topMistakes = (Object.entries(progress.mistakes) as [SifatId, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-content pt-8 text-center sm:pt-14">
        <motion.p
          className="arabic arabic-display text-sage-300 dark:text-sage-700"
          aria-hidden="true"
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
        >
          صِفَاتُ الحُرُوف
        </motion.p>
        <motion.h1
          className="mt-2 font-serif text-4xl font-bold leading-tight sm:text-5xl"
          initial={reduced ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          Сыфаты в таджвиде
        </motion.h1>
        <motion.p
          className="mx-auto mt-4 max-w-lg font-serif text-xl italic text-ink-soft dark:text-night-soft"
          initial={reduced ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          Перестань заучивать таблицы.
          <br />
          Начни понимать, как рождается звук.
        </motion.p>

        {!started ? (
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <p className="mx-auto mt-4 max-w-md text-sm text-ink-soft dark:text-night-soft">
              12 последовательных уроков, схемы, примеры и практика помогут превратить «тёмный лес»
              сыфатов в понятную систему.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to="/course/01-what-is-sifat" className="btn-primary !px-7 !py-3 !text-base">
                Начать обучение
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/map" className="btn-secondary !px-7 !py-3 !text-base">
                <Map className="h-4 w-4" />
                Открыть карту сыфатов
              </Link>
            </div>
          </motion.div>
        ) : (
          <motion.div
            className="card mx-auto mt-8 max-w-lg p-6 text-left"
            initial={reduced ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-faint dark:text-night-faint">
              Твой прогресс
            </p>
            <div className="mb-2 flex items-center gap-3">
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-cream-200 dark:bg-night-raise">
                <div className="h-full rounded-full bg-sage-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-sm font-bold">{pct}%</span>
            </div>
            <p className="mb-4 text-sm text-ink-soft dark:text-night-soft">
              Пройдено уроков: {doneCount} из {lessons.length}
            </p>
            <Link to={`/course/${continueLesson.slug}`} className="btn-primary w-full">
              <BookOpen className="h-4 w-4" />
              {doneCount >= lessons.length
                ? 'Курс пройден — повторить уроки'
                : `Продолжить: урок ${continueLesson.number} — ${continueLesson.title}`}
            </Link>
            {topMistakes.length > 0 && (
              <div className="mt-4 border-t border-cream-200 pt-4 dark:border-night-line">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint dark:text-night-faint">
                  Сегодня повторить
                </p>
                <div className="flex flex-wrap gap-2">
                  {topMistakes.map(([id]) => (
                    <Link key={id} to={`/sifat/${id}`} className="badge-gold hover:underline">
                      {sifatById[id].russianName}
                    </Link>
                  ))}
                  <Link to="/review" className="badge-sage hover:underline">
                    <RefreshCw className="h-3 w-3" />
                    все повторения
                  </Link>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </section>

      {/* ── Путь курса ───────────────────────────────────────────── */}
      <section className="mx-auto mt-16 max-w-content">
        <h2 className="mb-6 text-center font-serif text-2xl font-semibold">Твой путь</h2>
        <LessonPath />
      </section>
    </div>
  );
}
