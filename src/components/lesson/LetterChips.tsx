import { Link } from 'react-router-dom';
import { letterById } from '@/data/letters';
import type { LetterId } from '@/types';

/** Кликабельные плитки букв (ведут на страницу буквы) */
export function LetterChips({ letterIds, big = false }: { letterIds: LetterId[]; big?: boolean }) {
  return (
    <ul className="flex flex-wrap gap-2" dir="rtl">
      {letterIds.map((id) => {
        const l = letterById[id];
        return (
          <li key={id}>
            <Link
              to={`/letters/${id}`}
              title={`${l.name}: ${l.makhraj}`}
              className={
                big
                  ? 'arabic grid h-16 w-16 place-items-center rounded-card border border-cream-300 bg-white pb-1 text-3xl text-ink shadow-card transition-all hover:-translate-y-0.5 hover:border-sage-400 hover:shadow-lift dark:border-night-line dark:bg-night-card dark:text-night-text'
                  : 'arabic grid h-12 w-12 place-items-center rounded-soft border border-cream-300 bg-white pb-1 text-2xl text-ink transition-all hover:border-sage-400 hover:text-sage-800 dark:border-night-line dark:bg-night-card dark:text-night-text dark:hover:border-sage-500'
              }
            >
              {l.arabic}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
