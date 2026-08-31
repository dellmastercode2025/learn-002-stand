import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import { genFinalQuiz } from '@/lib/practice';
import type { QuizQuestion } from '@/types';
import { QuizRunner } from '@/components/quiz/QuizRunner';
import { useAppState } from '@/lib/app-state';
import { usePageMeta } from '@/lib/use-page-meta';

export default function QuizPage() {
  usePageMeta(
    'Итоговый тест по сыфатам | Таджвид',
    'Большой смешанный тест: сыфаты букв, буквы сыфатов, сравнение, классификация. Результат сохраняется в прогрессе.',
  );
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [round, setRound] = useState(0);
  const { progress } = useAppState();
  const lastResult = progress.quizResults['final'];

  function start() {
    setQuestions(genFinalQuiz());
    setRound((r) => r + 1);
  }

  if (!questions) {
    return (
      <div className="mx-auto max-w-lg pt-10 text-center">
        <Trophy className="mx-auto mb-4 h-12 w-12 text-gold-400" aria-hidden="true" />
        <h1 className="mb-3 font-serif text-3xl font-bold">Итоговый тест</h1>
        <p className="mb-2 text-sm text-ink-soft dark:text-night-soft">
          14 заданий всех типов: выбор, множественный выбор, «лишняя буква», сравнение и «разложи по
          полочкам». Вопросы каждый раз новые — они собираются из данных курса.
        </p>
        <p className="mb-6 text-sm text-ink-soft dark:text-night-soft">
          Ошибки не страшны: они попадут в «Повторить» и превратятся в план занятий.
        </p>
        {lastResult && (
          <p className="mb-6 rounded-soft bg-sage-50 p-3 text-sm dark:bg-night-raise">
            Прошлый результат: <strong>{lastResult.correct} из {lastResult.total}</strong> (
            {new Date(lastResult.date).toLocaleDateString('ru-RU')})
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-3">
          <button type="button" className="btn-primary !px-7 !py-3" onClick={start}>
            Начать тест
          </button>
          <Link to="/practice" className="btn-secondary !px-7 !py-3">
            Сначала потренироваться
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-4 text-center font-serif text-2xl font-bold">Итоговый тест</h1>
      <QuizRunner key={round} questions={questions} quizId="final" onRestart={start} />
    </div>
  );
}
