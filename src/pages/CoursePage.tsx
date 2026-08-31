import { usePageMeta } from '@/lib/use-page-meta';
import { LessonPath } from '@/components/course/LessonPath';

export default function CoursePage() {
  usePageMeta(
    'Курс: 12 уроков о сыфатах | Таджвид',
    'Маршрут курса: от понятия сыфата до итоговой практики. 12 уроков со схемами, видео и тренажёрами.',
  );
  return (
    <div className="mx-auto max-w-content">
      <h1 className="mb-2 font-serif text-3xl font-bold">Курс</h1>
      <p className="mb-8 max-w-lg text-ink-soft dark:text-night-soft">
        Двенадцать шагов: сначала почувствовать звук, затем понять систему, в конце — уверенно
        определять свойства любой буквы.
      </p>
      <LessonPath />
    </div>
  );
}
