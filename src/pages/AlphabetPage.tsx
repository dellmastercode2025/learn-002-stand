import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { alphabetOrder, letterWithSifatById, makhrajZones } from '@/data/letters';
import { usePageMeta } from '@/lib/use-page-meta';
import { useAppState } from '@/lib/app-state';
import { Heart } from 'lucide-react';

export default function AlphabetPage() {
  usePageMeta(
    'Арабский алфавит: махрадж и сыфаты каждой буквы | Таджвид',
    '29 букв арабского алфавита: интерактивные карточки с махраджем и полным набором сыфатов.',
  );
  const { favorites } = useAppState();
  const reduced = useReducedMotion();

  return (
    <div>
      <h1 className="mb-2 font-serif text-3xl font-bold">Арабский алфавит</h1>
      <p className="mb-8 max-w-lg text-sm text-ink-soft dark:text-night-soft">
        Нажми на букву, чтобы открыть её «паспорт»: махрадж, все сыфаты, схему и примеры. В курсе
        принят счёт «Мукаддимы»: 29 букв — хамза и алиф считаются отдельно.
      </p>
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6" dir="rtl">
        {alphabetOrder.map((id, i) => {
          const l = letterWithSifatById[id];
          const fav = favorites.letters.includes(id);
          return (
            <motion.li
              key={id}
              initial={reduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduced ? 0 : Math.min(i * 0.02, 0.4), duration: 0.3 }}
            >
              <Link
                to={`/letters/${id}`}
                className="card card-hover relative flex flex-col items-center p-4 text-center"
              >
                {fav && (
                  <Heart
                    className="absolute left-2 top-2 h-3.5 w-3.5 text-rose-400"
                    fill="currentColor"
                    aria-label="В избранном"
                  />
                )}
                <span className="arabic pb-1 text-5xl leading-tight text-sage-800 dark:text-sage-200">
                  {l.arabic}
                </span>
                <span className="mt-1 text-sm font-semibold" dir="ltr">
                  {l.name}
                </span>
                <span className="text-[11px] text-ink-faint dark:text-night-faint" dir="ltr">
                  {makhrajZones[l.makhrajZone].title}
                </span>
              </Link>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
