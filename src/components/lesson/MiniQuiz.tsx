import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, ChevronRight, X } from 'lucide-react';
import type { MiniQuizQuestion } from '@/types';
import { cn, shuffle } from '@/lib/utils';

interface MiniQuizProps {
  questions: MiniQuizQuestion[];
  onFinish?: (correct: number, total: number) => void;
}

/** Мини-тест в конце урока: по одному вопросу, с объяснением после ответа */
export function MiniQuiz({ questions, onFinish }: MiniQuizProps) {
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [done, setDone] = useState(false);
  const reduced = useReducedMotion();

  const base = questions[index];
  // Перемешиваем варианты, чтобы правильный ответ не стоял всегда первым
  const q = useMemo(() => {
    const order = shuffle(base.options.map((_, i) => i));
    return {
      ...base,
      options: order.map((i) => base.options[i]),
      correctIndex: order.indexOf(base.correctIndex),
    };
  }, [base]);
  const answered = chosen !== null;

  function choose(i: number) {
    if (answered) return;
    setChosen(i);
    if (i === q.correctIndex) setCorrectCount((c) => c + 1);
  }

  function next() {
    if (index < questions.length - 1) {
      setIndex(index + 1);
      setChosen(null);
    } else {
      setDone(true);
      onFinish?.(correctCount, questions.length);
    }
  }

  if (done) {
    return (
      <div className="rounded-soft bg-sage-50 p-6 text-center dark:bg-night-raise">
        <p className="mb-1 font-serif text-xl font-semibold">
          {correctCount} из {questions.length}
        </p>
        <p className="text-sm text-ink-soft dark:text-night-soft">
          {correctCount === questions.length
            ? 'Отлично! Всё верно.'
            : 'Хороший результат. Ошибки — повод перечитать урок, это нормально.'}
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint dark:text-night-faint">
        Вопрос {index + 1} из {questions.length}
      </p>
      <p className="mb-2 font-semibold">{q.question}</p>
      {q.arabic && (
        <p className="arabic arabic-lg mb-3 text-center text-sage-800 dark:text-sage-200" dir="rtl">
          {q.arabic}
        </p>
      )}
      <div className="space-y-2" role="group" aria-label="Варианты ответа">
        {q.options.map((opt, i) => {
          const isCorrect = i === q.correctIndex;
          const isChosen = i === chosen;
          return (
            <button
              key={i}
              type="button"
              disabled={answered}
              onClick={() => choose(i)}
              className={cn(
                'flex w-full items-center gap-3 rounded-soft border px-4 py-3 text-left text-sm transition-colors',
                !answered &&
                  'border-cream-300 bg-white hover:border-sage-400 dark:border-night-line dark:bg-night-card dark:hover:border-sage-500',
                answered && isCorrect &&
                  'border-sage-500 bg-sage-50 font-semibold dark:border-sage-400 dark:bg-sage-900/40',
                answered && isChosen && !isCorrect &&
                  'border-rose-300 bg-rose-100/60 dark:border-rose-400/60 dark:bg-rose-300/10',
                answered && !isChosen && !isCorrect && 'border-cream-200 opacity-60 dark:border-night-line',
              )}
            >
              {answered && isCorrect && <Check className="h-4 w-4 shrink-0 text-sage-600 dark:text-sage-300" />}
              {answered && isChosen && !isCorrect && <X className="h-4 w-4 shrink-0 text-rose-400" />}
              <span>
                {opt.text}
                {opt.arabic && <span className="arabic mr-2 text-lg"> {opt.arabic}</span>}
              </span>
            </button>
          );
        })}
      </div>
      {answered && (
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 rounded-soft bg-cream-100 p-4 text-sm leading-relaxed dark:bg-night-raise"
        >
          <p className="mb-1 font-semibold">
            {chosen === q.correctIndex ? 'Верно!' : 'Не совсем.'} Почему так:
          </p>
          <p className="text-ink-soft dark:text-night-soft">{q.explanation}</p>
          <button type="button" className="btn-primary mt-3" onClick={next}>
            {index < questions.length - 1 ? 'Дальше' : 'Завершить'}
            <ChevronRight className="h-4 w-4" />
          </button>
        </motion.div>
      )}
    </div>
  );
}
