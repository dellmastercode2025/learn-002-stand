import { Link } from 'react-router-dom';
import { usePageMeta } from '@/lib/use-page-meta';

export default function NotFoundPage() {
  usePageMeta('Страница не найдена | Сыфаты в таджвиде');
  return (
    <div className="mx-auto max-w-content py-20 text-center">
      <p className="arabic mb-4 text-6xl text-sage-300 dark:text-sage-700" aria-hidden="true">
        ؟
      </p>
      <h1 className="mb-2 font-serif text-3xl font-bold">Страница не найдена</h1>
      <p className="mb-8 text-sm text-ink-soft dark:text-night-soft">
        Такого адреса нет. Зато есть 12 уроков, алфавит и карта сыфатов.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link to="/" className="btn-primary">
          На главную
        </Link>
        <Link to="/course" className="btn-secondary">
          К курсу
        </Link>
      </div>
    </div>
  );
}
