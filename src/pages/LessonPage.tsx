import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, CheckCircle2, Lock } from 'lucide-react';
import { getNextLesson, getPrevLesson, lessonBySlug } from '@/data/lessons';
import { useAppState } from '@/lib/app-state';
import { usePageMeta } from '@/lib/use-page-meta';
import { LessonBlocks } from '@/components/lesson/LessonBlocks';
import { MiniQuiz } from '@/components/lesson/MiniQuiz';

export default function LessonPage() {
  const { slug } = useParams<{ slug: string }>();
  const lesson = slug ? lessonBySlug[slug] : undefined;
  const navigate = useNavigate();
  const { completeLesson, setLastLesson, recordQuizResult, isLessonUnlocked, progress, setSequentialLock } =
    useAppState();
  const reduced = useReducedMotion();

  usePageMeta(lesson?.metaTitle ?? 'Урок не найден', lesson?.metaDescription);

  useEffect(() => {
    if (lesson) setLastLesson(lesson.slug);
  }, [lesson, setLastLesson]);

  if (!lesson) {
    return (
      <div className="mx-auto max-w-content py-16 text-center">
        <p className="arabic mb-3 text-4xl text-sage-300">؟</p>
        <h1 className="mb-2 font-serif text-2xl font-semibold">Такого урока нет</h1>
        <Link to="/course" className="btn-primary mt-4">
          К списку уроков
        </Link>
      </div>
    );
  }

  const unlocked = isLessonUnlocked(lesson.slug, lesson.number);
  if (!unlocked) {
    return (
      <div className="mx-auto max-w-content py-16 text-center">
        <Lock className="mx-auto mb-3 h-10 w-10 text-ink-faint dark:text-night-faint" aria-hidden="true" />
        <h1 className="mb-2 font-serif text-2xl font-semibold">Урок пока закрыт</h1>
        <p className="mx-auto mb-6 max-w-md text-sm text-ink-soft dark:text-night-soft">
          Включён последовательный порядок: заверши предыдущий урок — или отключи блокировку, чтобы
          открыть все уроки сразу.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/course" className="btn-secondary">
            К списку уроков
          </Link>
          <button type="button" className="btn-primary" onClick={() => setSequentialLock(false)}>
            Открыть все уроки
          </button>
        </div>
      </div>
    );
  }

  const next = getNextLesson(lesson.slug);
  const prev = getPrevLesson(lesson.slug);
  const isDone = progress.completedLessons.includes(lesson.slug);

  function finishQuiz(correct: number, total: number) {
    if (!lesson) return;
    recordQuizResult(`lesson-${lesson.slug}`, correct, total);
    completeLesson(lesson.slug);
  }

  return (
    <motion.article
      key={lesson.slug}
      className="mx-auto max-w-3xl"
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <header className="mb-8">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gold-600 dark:text-gold-300">
          Урок {lesson.number} из 12 {isDone && '· пройден ✓'}
        </p>
        <h1 className="font-serif text-3xl font-bold leading-tight sm:text-4xl">{lesson.title}</h1>
        <p className="mt-1 text-lg text-ink-soft dark:text-night-soft">{lesson.subtitle}</p>
      </header>

      <LessonBlocks blocks={lesson.blocks} />

      {/* Мини-тест */}
      <section className="card mt-10 p-6">
        <h2 className="mb-4 font-serif text-xl font-semibold">Мини-тест</h2>
        <MiniQuiz key={lesson.slug} questions={lesson.miniQuiz} onFinish={finishQuiz} />
        {isDone && (
          <p className="mt-4 flex items-center gap-2 text-sm text-sage-700 dark:text-sage-300">
            <CheckCircle2 className="h-4 w-4" />
            Урок отмечен как пройденный.
          </p>
        )}
      </section>

      {/* Навигация */}
      <nav className="mt-8 flex flex-wrap items-center justify-between gap-3" aria-label="Навигация по урокам">
        {prev ? (
          <Link to={`/course/${prev.slug}`} className="btn-secondary">
            <ArrowLeft className="h-4 w-4" />
            Урок {prev.number}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              if (!isDone) completeLesson(lesson.slug);
              navigate(`/course/${next.slug}`);
            }}
          >
            Следующий урок: {next.title}
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <Link to="/quiz" className="btn-primary">
            Перейти к итоговому тесту
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </nav>
    </motion.article>
  );
}
