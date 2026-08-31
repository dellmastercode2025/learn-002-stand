import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeftRight, BookOpen, Hand, Heart } from 'lucide-react';
import { sifatById } from '@/data/sifat';
import { lessonBySlug } from '@/data/lessons';
import { videosForSifat } from '@/data/videos';
import { quranExamples } from '@/data/quran-examples';
import { useAppState } from '@/lib/app-state';
import { usePageMeta } from '@/lib/use-page-meta';
import { LetterChips } from '@/components/lesson/LetterChips';
import { VideoSection } from '@/components/video/VideoCard';
import { QuranExampleCard } from '@/components/lesson/QuranExampleCard';
import type { SifatId } from '@/types';
import { cn } from '@/lib/utils';

export default function SifatDetailPage() {
  const { sifatId } = useParams<{ sifatId: string }>();
  const sifat = sifatId && sifatId in sifatById ? sifatById[sifatId as SifatId] : undefined;
  const { favorites, toggleFavoriteSifat } = useAppState();

  usePageMeta(
    sifat ? `${sifat.russianName} (${sifat.arabicName}) — сыфат букв | Таджвид` : 'Сыфат не найден',
    sifat?.shortDefinition,
  );

  if (!sifat) {
    return (
      <div className="mx-auto max-w-content py-16 text-center">
        <h1 className="mb-4 font-serif text-2xl font-semibold">Такого сыфата нет</h1>
        <Link to="/map" className="btn-primary">
          К карте сыфатов
        </Link>
      </div>
    );
  }

  const fav = favorites.sifat.includes(sifat.id);
  const lesson = lessonBySlug[sifat.lessonSlug];
  const relatedExamples = quranExamples
    .filter((e) => e.highlights.some((h) => h.sifatIds.includes(sifat.id)))
    .slice(0, 2);

  return (
    <article className="mx-auto max-w-3xl">
      <header className="card relative mb-8 overflow-hidden p-8 text-center">
        <button
          type="button"
          onClick={() => toggleFavoriteSifat(sifat.id)}
          aria-label={fav ? 'Убрать из избранного' : 'В избранное'}
          aria-pressed={fav}
          className={cn(
            'absolute right-4 top-4 rounded-soft p-2 transition-colors',
            fav ? 'text-rose-400' : 'text-ink-faint hover:text-rose-400 dark:text-night-faint',
          )}
        >
          <Heart className="h-6 w-6" fill={fav ? 'currentColor' : 'none'} />
        </button>
        <p className="arabic arabic-display text-sage-800 dark:text-sage-200" lang="ar">
          {sifat.arabicName}
        </p>
        <p className="text-sm text-ink-soft dark:text-night-soft">{sifat.translit}</p>
        <h1 className="mt-1 font-serif text-3xl font-bold">{sifat.russianName}</h1>
        <p className="mt-1 italic text-gold-600 dark:text-gold-300">{sifat.meaning}</p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <span className="badge-sage">
            {sifat.category === 'opposed' ? 'имеет противоположность' : 'без противоположности'}
          </span>
          {sifat.oppositeIds?.map((o) => (
            <Link key={o} to={`/sifat/${o}`} className="badge-gold hover:underline">
              <ArrowLeftRight className="h-3 w-3" />
              {sifatById[o].russianName}
            </Link>
          ))}
        </div>
      </header>

      <div className="space-y-8">
        <section className="max-w-content">
          <h2 className="mb-2 font-serif text-xl font-semibold">Определение</h2>
          <p className="leading-relaxed">{sifat.shortDefinition}</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft dark:text-night-soft">
            <strong>Что происходит со звуком:</strong> {sifat.whatHappens}
          </p>
          {sifat.conditionNote && (
            <p className="mt-3 rounded-soft bg-sand-100 p-3 text-sm dark:bg-night-raise">{sifat.conditionNote}</p>
          )}
        </section>

        <section>
          <h2 className="mb-2 font-serif text-xl font-semibold">Буквы</h2>
          {sifat.mnemonic && (
            <p className="mb-2">
              Мнемоника: <span className="arabic arabic-lg text-gold-600 dark:text-gold-300">{sifat.mnemonic}</span>{' '}
              <span className="text-sm text-ink-soft dark:text-night-soft">({sifat.mnemonicTranslit})</span>
            </p>
          )}
          <LetterChips letterIds={sifat.letters} />
        </section>

        <section className="card p-5">
          <h2 className="mb-2 flex items-center gap-2 font-serif text-xl font-semibold">
            <Hand className="h-5 w-5 text-gold-500" aria-hidden="true" />
            Почувствуй сам
          </h2>
          <p className="text-sm leading-relaxed">{sifat.feel}</p>
        </section>

        <section className="rounded-card border border-rose-300/60 bg-rose-100/40 p-5 dark:border-rose-400/40 dark:bg-night-raise">
          <h2 className="mb-2 flex items-center gap-2 font-serif text-xl font-semibold">
            <AlertTriangle className="h-5 w-5 text-rose-400" aria-hidden="true" />
            Типичная ошибка
          </h2>
          <p className="text-sm leading-relaxed">{sifat.commonMistake}</p>
        </section>

        <VideoSection videos={videosForSifat(sifat.id)} />

        {relatedExamples.length > 0 && (
          <section>
            <h2 className="mb-3 font-serif text-xl font-semibold">В словах Корана</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {relatedExamples.map((e) => (
                <QuranExampleCard key={e.id} example={e} />
              ))}
            </div>
          </section>
        )}

        <div className="flex flex-wrap gap-3">
          {lesson && (
            <Link to={`/course/${lesson.slug}`} className="btn-primary">
              <BookOpen className="h-4 w-4" />
              Урок {lesson.number}: {lesson.title}
            </Link>
          )}
          <Link to="/practice" className="btn-secondary">
            Потренироваться
          </Link>
          <Link to="/map" className="btn-ghost">
            К карте сыфатов
          </Link>
        </div>
      </div>
    </article>
  );
}
