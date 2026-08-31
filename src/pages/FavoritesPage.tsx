import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { letterById } from '@/data/letters';
import { quranExampleById } from '@/data/quran-examples';
import { useAppState } from '@/lib/app-state';
import { usePageMeta } from '@/lib/use-page-meta';
import { SifatCard } from '@/components/lesson/SifatCard';
import { QuranExampleCard } from '@/components/lesson/QuranExampleCard';

export default function FavoritesPage() {
  usePageMeta(
    'Избранное | Сыфаты в таджвиде',
    'Сохранённые буквы, сыфаты и примеры — всё, что ты отметил сердечком.',
  );
  const { favorites } = useAppState();
  const isEmpty =
    favorites.letters.length === 0 && favorites.sifat.length === 0 && favorites.examples.length === 0;

  return (
    <div>
      <h1 className="mb-2 font-serif text-3xl font-bold">Избранное</h1>
      <p className="mb-8 max-w-lg text-sm text-ink-soft dark:text-night-soft">
        Нажимай ♡ на буквах, сыфатах и примерах — они соберутся здесь для повторения.
      </p>

      {isEmpty ? (
        <div className="card p-10 text-center">
          <Heart className="mx-auto mb-3 h-10 w-10 text-rose-300" aria-hidden="true" />
          <p className="mb-2 font-serif text-xl font-semibold">Пока пусто</p>
          <p className="mx-auto mb-6 max-w-sm text-sm text-ink-soft dark:text-night-soft">
            Открой любую букву или сыфат и нажми на сердечко — элемент появится в этом списке.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/letters" className="btn-primary">
              К алфавиту
            </Link>
            <Link to="/map" className="btn-secondary">
              К карте сыфатов
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-10">
          {favorites.letters.length > 0 && (
            <section>
              <h2 className="mb-3 font-serif text-xl font-semibold">Буквы</h2>
              <ul className="flex flex-wrap gap-2" dir="rtl">
                {favorites.letters.map((id) => (
                  <li key={id}>
                    <Link
                      to={`/letters/${id}`}
                      className="arabic grid h-16 w-16 place-items-center rounded-card border border-cream-300 bg-white pb-1 text-3xl shadow-card transition-all hover:-translate-y-0.5 hover:border-sage-400 dark:border-night-line dark:bg-night-card"
                      title={letterById[id].name}
                    >
                      {letterById[id].arabic}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {favorites.sifat.length > 0 && (
            <section>
              <h2 className="mb-3 font-serif text-xl font-semibold">Сыфаты</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {favorites.sifat.map((id) => (
                  <SifatCard key={id} sifatId={id} />
                ))}
              </div>
            </section>
          )}

          {favorites.examples.length > 0 && (
            <section>
              <h2 className="mb-3 font-serif text-xl font-semibold">Примеры</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {favorites.examples
                  .filter((id) => id in quranExampleById)
                  .map((id) => (
                    <QuranExampleCard key={id} example={quranExampleById[id]} />
                  ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
