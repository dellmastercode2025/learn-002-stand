import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, BookOpen, GitCompare, Heart, MapPin } from 'lucide-react';
import { alphabetOrder, letterWithSifatById, makhrajZones } from '@/data/letters';
import { sifatById } from '@/data/sifat';
import { lessonBySlug } from '@/data/lessons';
import { verifiedVideos } from '@/data/videos';
import { useAppState } from '@/lib/app-state';
import { usePageMeta } from '@/lib/use-page-meta';
import { MouthDiagram } from '@/components/diagrams/MouthDiagram';
import { VideoCard } from '@/components/video/VideoCard';
import type { LetterId, SifatId } from '@/types';
import { cn } from '@/lib/utils';

export default function LetterDetailPage() {
  const { letterId } = useParams<{ letterId: string }>();
  const letter =
    letterId && letterId in letterWithSifatById
      ? letterWithSifatById[letterId as LetterId]
      : undefined;
  const { favorites, toggleFavoriteLetter } = useAppState();
  const [openSifat, setOpenSifat] = useState<SifatId | null>(null);
  const reduced = useReducedMotion();

  usePageMeta(
    letter ? `Буква ${letter.name} (${letter.arabic}): махрадж и сыфаты | Таджвид` : 'Буква не найдена',
    letter ? `${letter.name}: ${letter.makhraj} Сыфаты: ${letter.sifatIds.map((s) => sifatById[s].russianName).join(', ')}.` : undefined,
  );

  if (!letter) {
    return (
      <div className="mx-auto max-w-content py-16 text-center">
        <h1 className="mb-4 font-serif text-2xl font-semibold">Такой буквы нет</h1>
        <Link to="/letters" className="btn-primary">
          К алфавиту
        </Link>
      </div>
    );
  }

  const fav = favorites.letters.includes(letter.id);
  const idx = alphabetOrder.indexOf(letter.id);
  const prevLetter = idx > 0 ? alphabetOrder[idx - 1] : null;
  const nextLetter = idx < alphabetOrder.length - 1 ? alphabetOrder[idx + 1] : null;
  const letterVideos = verifiedVideos.filter((v) => v.relatedLetters.includes(letter.id)).slice(0, 2);
  const pose = letter.sifatIds.includes('itbaq')
    ? 'itbaq'
    : letter.sifatIds.includes('istila')
      ? 'raised'
      : 'rest';

  return (
    <article className="mx-auto max-w-3xl">
      {/* Шапка-«паспорт» */}
      <header className="card relative mb-8 p-8">
        <button
          type="button"
          onClick={() => toggleFavoriteLetter(letter.id)}
          aria-label={fav ? 'Убрать из избранного' : 'В избранное'}
          aria-pressed={fav}
          className={cn(
            'absolute right-4 top-4 rounded-soft p-2 transition-colors',
            fav ? 'text-rose-400' : 'text-ink-faint hover:text-rose-400 dark:text-night-faint',
          )}
        >
          <Heart className="h-6 w-6" fill={fav ? 'currentColor' : 'none'} />
        </button>
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          <span className="arabic arabic-display shrink-0 text-sage-800 dark:text-sage-200" lang="ar">
            {letter.arabic}
          </span>
          <div className="text-center sm:text-left">
            <h1 className="font-serif text-3xl font-bold">{letter.name}</h1>
            <p className="text-sm text-ink-soft dark:text-night-soft">
              <span className="arabic text-lg">{letter.arabicLetterName}</span> · {letter.translit}
            </p>
            <p className="mt-2 flex items-center justify-center gap-1.5 text-sm sm:justify-start">
              <MapPin className="h-4 w-4 shrink-0 text-gold-500" aria-hidden="true" />
              <span>
                <strong>{makhrajZones[letter.makhrajZone].title}</strong>{' '}
                <span className="arabic">{makhrajZones[letter.makhrajZone].arabic}</span>
              </span>
            </p>
            <p className="mt-1 text-sm text-ink-soft dark:text-night-soft">{letter.makhraj}</p>
          </div>
        </div>
        {letter.specialNote && (
          <p className="mt-4 rounded-soft bg-sand-100 p-3 text-sm dark:bg-night-raise">{letter.specialNote}</p>
        )}
      </header>

      <div className="space-y-8">
        {/* Сыфаты */}
        <section>
          <h2 className="mb-3 font-serif text-xl font-semibold">Сыфаты буквы</h2>
          <div className="flex flex-wrap gap-2">
            {letter.sifatIds.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={openSifat === s}
                onClick={() => setOpenSifat(openSifat === s ? null : s)}
                className={cn(
                  'rounded-soft border px-3 py-2 text-sm font-medium transition-all',
                  openSifat === s
                    ? 'border-sage-600 bg-sage-600 text-cream-50 dark:border-sage-400 dark:bg-sage-500 dark:text-night-bg'
                    : 'border-cream-300 bg-white hover:border-sage-400 dark:border-night-line dark:bg-night-card',
                )}
              >
                {sifatById[s].russianName}
              </button>
            ))}
          </div>
          <AnimatePresence>
            {openSifat && (
              <motion.div
                key={openSifat}
                initial={reduced ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={reduced ? undefined : { opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="mt-3 rounded-soft border border-sage-200 bg-sage-50 p-4 dark:border-sage-800 dark:bg-night-raise">
                  <p className="mb-1 flex flex-wrap items-baseline gap-x-2">
                    <span className="arabic text-xl">{sifatById[openSifat].arabicName}</span>
                    <strong>{sifatById[openSifat].russianName}</strong>
                    <span className="text-xs text-ink-soft dark:text-night-soft">
                      {sifatById[openSifat].meaning}
                    </span>
                  </p>
                  <p className="text-sm leading-relaxed">{sifatById[openSifat].shortDefinition}</p>
                  <Link to={`/sifat/${openSifat}`} className="btn-ghost mt-2 !px-3 !py-1.5 text-xs">
                    Страница сыфата
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Схема */}
        <section className="card p-5">
          <h2 className="mb-3 font-serif text-xl font-semibold">Схема артикуляции</h2>
          <div className="flex justify-center">
            <MouthDiagram
              tongue={pose}
              point={letter.diagramPoint ?? null}
              airflow={letter.sifatIds.includes('hams') ? 'free' : 'none'}
              title={`Точка махраджа буквы ${letter.name}`}
            />
          </div>
          <p className="mt-2 text-center text-xs text-ink-faint dark:text-night-faint">
            Золотая точка — область махраджа. Схема учебная, упрощённая.
          </p>
        </section>

        {/* Произношение и пример */}
        <section className="max-w-content">
          <h2 className="mb-2 font-serif text-xl font-semibold">Как произносится</h2>
          <p className="text-sm leading-relaxed">{letter.pronunciationNote}</p>
          {letter.example && (
            <div className="card mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 p-4 text-center">
              <span className="arabic arabic-lg" dir="rtl" lang="ar">
                {letter.example.word}
              </span>
              <span className="text-sm text-ink-soft dark:text-night-soft">
                {letter.example.translit} — «{letter.example.translation}»
              </span>
            </div>
          )}
        </section>

        {/* Видео */}
        {letterVideos.length > 0 && (
          <section>
            <h2 className="mb-3 font-serif text-xl font-semibold">Видео с этой буквой</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {letterVideos.map((v) => (
                <VideoCard key={v.id} video={v} />
              ))}
            </div>
          </section>
        )}

        {/* Ссылки */}
        <div className="flex flex-wrap gap-3">
          <Link to={`/course/${lessonBySlug['09-letter-dna'].slug}`} className="btn-primary">
            <BookOpen className="h-4 w-4" />
            Урок «ДНК буквы»
          </Link>
          <Link to={`/compare?a=${letter.id}`} className="btn-secondary">
            <GitCompare className="h-4 w-4" />
            Сравнить с другой буквой
          </Link>
        </div>

        {/* Навигация по алфавиту */}
        <nav className="flex items-center justify-between border-t border-cream-200 pt-4 dark:border-night-line" aria-label="Соседние буквы">
          {prevLetter ? (
            <Link to={`/letters/${prevLetter}`} className="btn-ghost">
              <ArrowLeft className="h-4 w-4" />
              <span className="arabic text-xl">{letterWithSifatById[prevLetter].arabic}</span>
              {letterWithSifatById[prevLetter].name}
            </Link>
          ) : (
            <span />
          )}
          {nextLetter ? (
            <Link to={`/letters/${nextLetter}`} className="btn-ghost">
              {letterWithSifatById[nextLetter].name}
              <span className="arabic text-xl">{letterWithSifatById[nextLetter].arabic}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </div>
    </article>
  );
}
