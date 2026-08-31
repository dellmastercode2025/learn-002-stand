import { Link } from 'react-router-dom';
import { BookOpen, Dumbbell, Heart } from 'lucide-react';
import { sifatById } from '@/data/sifat';
import { letterById } from '@/data/letters';
import { useAppState } from '@/lib/app-state';
import type { SifatId } from '@/types';
import { cn } from '@/lib/utils';

/** Полная карточка сыфата (урок 8, страница карты) */
export function SifatCard({ sifatId }: { sifatId: SifatId }) {
  const s = sifatById[sifatId];
  const { favorites, toggleFavoriteSifat } = useAppState();
  const fav = favorites.sifat.includes(sifatId);

  return (
    <article className="card card-hover flex flex-col p-5">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="arabic text-2xl text-sage-700 dark:text-sage-300">{s.arabicName}</p>
          <h3 className="font-serif text-lg font-semibold">{s.russianName}</h3>
          <p className="text-xs text-ink-soft dark:text-night-soft">
            {s.translit} · {s.meaning}
          </p>
        </div>
        <button
          type="button"
          onClick={() => toggleFavoriteSifat(sifatId)}
          aria-label={fav ? `Убрать «${s.russianName}» из избранного` : `Добавить «${s.russianName}» в избранное`}
          aria-pressed={fav}
          className={cn(
            'rounded-soft p-2 transition-colors',
            fav ? 'text-rose-400' : 'text-ink-faint hover:text-rose-400 dark:text-night-faint',
          )}
        >
          <Heart className="h-5 w-5" fill={fav ? 'currentColor' : 'none'} />
        </button>
      </div>
      <p className="mb-2 text-sm leading-relaxed">{s.shortDefinition}</p>
      <p className="mb-3 text-xs leading-relaxed text-ink-soft dark:text-night-soft">
        <strong>Что происходит со звуком:</strong> {s.whatHappens}
      </p>
      <p className="arabic mb-3 text-2xl leading-loose text-gold-600 dark:text-gold-300">
        {s.letters.length > 12
          ? `${s.letters.length} букв`
          : s.letters.map((l) => letterById[l].arabic).join(' ')}
      </p>
      {s.conditionNote && (
        <p className="mb-3 rounded-soft bg-sand-100 px-3 py-2 text-xs text-ink-soft dark:bg-night-raise dark:text-night-soft">
          {s.conditionNote}
        </p>
      )}
      <div className="mt-auto flex flex-wrap gap-2 pt-2">
        <Link to={`/sifat/${s.id}`} className="btn-secondary !px-3 !py-1.5 text-xs">
          <BookOpen className="h-3.5 w-3.5" />
          Подробнее
        </Link>
        <Link to="/practice" className="btn-ghost !px-3 !py-1.5 text-xs">
          <Dumbbell className="h-3.5 w-3.5" />
          Практика
        </Link>
      </div>
    </article>
  );
}
