import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, BookOpen, Map, RefreshCw } from 'lucide-react';
import { lessons } from '@/data/lessons';
import { sifatById } from '@/data/sifat';
import { useAppState } from '@/lib/app-state';
import { usePageMeta } from '@/lib/use-page-meta';
import { LessonPath } from '@/components/course/LessonPath';
import type { SifatId } from '@/types';

function HeroIllustration() {
  return (
    <div className="relative mx-auto h-[250px] w-full max-w-[420px] sm:h-[300px]" aria-hidden="true">
      <div className="absolute inset-x-8 bottom-5 h-24 rounded-[50%] bg-sage-100/40 blur-xl" />
      <svg viewBox="0 0 440 310" className="relative h-full w-full overflow-visible">
        <g opacity=".35" fill="#829c84">
          <ellipse cx="80" cy="92" rx="52" ry="17" transform="rotate(-35 80 92)" />
          <ellipse cx="120" cy="60" rx="48" ry="15" transform="rotate(25 120 60)" />
          <ellipse cx="347" cy="83" rx="55" ry="17" transform="rotate(28 347 83)" />
          <ellipse cx="382" cy="124" rx="44" ry="14" transform="rotate(-34 382 124)" />
        </g>
        <path d="M58 232 C121 202 169 202 220 230 C270 201 324 201 387 232" fill="#c9b080" opacity=".17" />
        <g transform="translate(100 124)">
          <path d="M0 36 C48 10 83 8 120 31 L120 123 C81 102 45 104 0 130Z" fill="#fbf4e4" stroke="#a88652" strokeWidth="2" />
          <path d="M240 36 C192 10 157 8 120 31 L120 123 C159 102 195 104 240 130Z" fill="#fbf4e4" stroke="#a88652" strokeWidth="2" />
          <path d="M120 31v92" stroke="#b79660" strokeWidth="2" />
          <path d="M16 49 C54 31 83 29 108 43M16 63 C52 48 80 47 108 57M224 49 C186 31 157 29 132 43M224 63 C188 48 160 47 132 57" stroke="#829177" opacity=".42" />
          <path d="M38 143 L120 113 L202 143 L169 156 L120 137 L71 156Z" fill="#765b3c" opacity=".82" />
          <path d="M120 137v42M71 156l49 23 49-23" stroke="#62472e" strokeWidth="5" strokeLinecap="round" />
        </g>
        <g transform="translate(40 115)">
          <path d="M25 10h42l10 25-7 113c-2 18-10 28-24 28s-22-10-24-28L15 35Z" fill="#8a693d" opacity=".72" stroke="#6b512f" strokeWidth="2" />
          <path d="M25 42h42M28 128h36" stroke="#ead19b" opacity=".75" />
          <ellipse cx="46" cy="91" rx="13" ry="27" fill="#f4d78b" opacity=".56" />
          <path d="M31 10c2-17 8-25 15-25s13 8 15 25" stroke="#765b36" strokeWidth="3" fill="none" />
        </g>
      </svg>
    </div>
  );
}

export default function HomePage() {
  usePageMeta('Сыфаты в таджвиде — интерактивный курс', 'Перестань заучивать таблицы. Начни понимать, как рождается звук: 12 уроков, схемы, тренажёры и проверенные видео.');
  const { progress } = useAppState();
  const reduced = useReducedMotion();
  const started = progress.completedLessons.length > 0 || progress.lastLessonSlug !== null;
  const doneCount = progress.completedLessons.length;
  const pct = Math.round((doneCount / lessons.length) * 100);
  const continueLesson = lessons.find((l) => l.slug === progress.lastLessonSlug && !progress.completedLessons.includes(l.slug)) ?? lessons.find((l) => !progress.completedLessons.includes(l.slug)) ?? lessons[0];
  const topMistakes = (Object.entries(progress.mistakes) as [SifatId, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);

  return (
    <div className="mx-auto max-w-5xl">
      <section className="page-shell book-frame relative overflow-hidden px-5 py-8 sm:px-10 sm:py-10 lg:px-14">
        <div className="absolute left-1/2 top-0 h-36 w-72 -translate-x-1/2 rounded-full bg-gold-300/10 blur-3xl" />
        <div className="relative grid items-center gap-3 lg:grid-cols-[.9fr_1.1fr] lg:gap-8">
          <motion.div initial={reduced ? false : { opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: .65 }}>
            <HeroIllustration />
          </motion.div>

          <div className="relative text-center lg:text-left">
            <motion.p className="arabic text-4xl text-sage-700/65 dark:text-sage-300/70 sm:text-5xl" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1 }}>
              صِفَاتُ الحُرُوف
            </motion.p>
            <motion.h1 className="mt-1 font-serif text-4xl font-semibold leading-tight text-sage-900 dark:text-sage-100 sm:text-5xl" initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .55 }}>
              Сыфаты в таджвиде
            </motion.h1>
            <div className="ornament-rule mx-auto my-4 max-w-sm lg:mx-0"><span className="text-sm">✦</span></div>
            <motion.p className="max-w-xl font-serif text-lg leading-relaxed text-ink-soft dark:text-night-soft sm:text-xl" initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .55, delay: .08 }}>
              Понимание свойств букв — ключ к красивому и правильному чтению Корана.
            </motion.p>
            <p className="mt-4 max-w-xl text-sm leading-6 text-ink-soft dark:text-night-soft">
              Изучай сыфаты через понятные схемы, сравнения, примеры произношения и короткую практику — от первого понятия до уверенного разбора букв.
            </p>

            {!started ? (
              <div className="mt-7 flex flex-wrap justify-center gap-3 lg:justify-start">
                <Link to="/course/01-what-is-sifat" className="btn-primary !px-7 !py-3 !text-base">Начать обучение <ArrowRight className="h-4 w-4" /></Link>
                <Link to="/map" className="btn-secondary !px-6 !py-3"><Map className="h-4 w-4" /> Карта сыфатов</Link>
              </div>
            ) : (
              <motion.div className="card mt-7 p-5 text-left" initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                <p className="mb-2 font-serif text-sm font-semibold text-sage-800 dark:text-sage-200">Твой прогресс · {pct}%</p>
                <div className="mb-3 h-2 overflow-hidden rounded-full bg-cream-200/80 dark:bg-night-raise"><div className="h-full rounded-full bg-sage-500" style={{ width: `${pct}%` }} /></div>
                <Link to={`/course/${continueLesson.slug}`} className="btn-primary w-full"><BookOpen className="h-4 w-4" />{doneCount >= lessons.length ? 'Курс пройден — повторить' : `Продолжить урок ${continueLesson.number}`}</Link>
                {topMistakes.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{topMistakes.map(([id]) => <Link key={id} to={`/sifat/${id}`} className="badge-gold">{sifatById[id].russianName}</Link>)}<Link to="/review" className="badge-sage"><RefreshCw className="h-3 w-3" /> повторить</Link></div>}
              </motion.div>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto mt-10 max-w-4xl">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[.24em] text-gold-600 dark:text-gold-300">12 последовательных уроков</p>
          <h2 className="mt-2 font-serif text-3xl font-semibold">Твой путь к пониманию</h2>
          <div className="ornament-rule mx-auto mt-3 max-w-xs"><span>✦</span></div>
        </div>
        <LessonPath />
      </section>
    </div>
  );
}
