import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, ChevronRight, RotateCcw, X } from 'lucide-react';
import type {
  ClassifyQuestion,
  MatchQuestion,
  MultiChoiceQuestion,
  QuizQuestion,
  SingleChoiceQuestion,
  OddOneOutQuestion,
  SifatId,
} from '@/types';
import { cn, shuffle } from '@/lib/utils';
import { useAppState } from '@/lib/app-state';

// ─── Одиночный выбор (single / truefalse / odd-one-out) ───────────────

function SingleView({
  q,
  onAnswer,
}: {
  q: SingleChoiceQuestion | OddOneOutQuestion;
  onAnswer: (ok: boolean) => void;
}) {
  const [chosen, setChosen] = useState<number | null>(null);
  const answered = chosen !== null;

  return (
    <div>
      {q.arabic && (
        <p className="arabic arabic-lg mb-4 text-center text-sage-800 dark:text-sage-200" dir="rtl">
          {q.arabic}
        </p>
      )}
      <div className="space-y-2">
        {q.options.map((opt, i) => {
          const isCorrect = i === q.correctIndex;
          const isChosen = i === chosen;
          return (
            <button
              key={i}
              type="button"
              disabled={answered}
              onClick={() => {
                setChosen(i);
                onAnswer(i === q.correctIndex);
              }}
              className={cn(
                'flex w-full items-center gap-3 rounded-soft border px-4 py-3 text-left text-sm transition-colors',
                !answered && 'border-cream-300 bg-white hover:border-sage-400 dark:border-night-line dark:bg-night-card dark:hover:border-sage-500',
                answered && isCorrect && 'border-sage-500 bg-sage-50 font-semibold dark:border-sage-400 dark:bg-sage-900/40',
                answered && isChosen && !isCorrect && 'border-rose-300 bg-rose-100/60 dark:border-rose-400/60 dark:bg-rose-300/10',
                answered && !isChosen && !isCorrect && 'opacity-60',
              )}
            >
              {answered && isCorrect && <Check className="h-4 w-4 shrink-0 text-sage-600 dark:text-sage-300" />}
              {answered && isChosen && !isCorrect && <X className="h-4 w-4 shrink-0 text-rose-400" />}
              {opt.arabic && <span className="arabic text-xl">{opt.arabic}</span>}
              <span>{opt.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Множественный выбор ──────────────────────────────────────────────

function MultiView({ q, onAnswer }: { q: MultiChoiceQuestion; onAnswer: (ok: boolean) => void }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [answered, setAnswered] = useState(false);

  function toggleOption(i: number) {
    if (answered) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function confirm() {
    setAnswered(true);
    const correct = new Set(q.correctIndices);
    const ok = selected.size === correct.size && [...selected].every((i) => correct.has(i));
    onAnswer(ok);
  }

  return (
    <div>
      {q.arabic && (
        <p className="arabic arabic-lg mb-4 text-center text-sage-800 dark:text-sage-200" dir="rtl">
          {q.arabic}
        </p>
      )}
      <div className="space-y-2">
        {q.options.map((opt, i) => {
          const isCorrect = q.correctIndices.includes(i);
          const isChosen = selected.has(i);
          return (
            <button
              key={i}
              type="button"
              disabled={answered}
              aria-pressed={isChosen}
              onClick={() => toggleOption(i)}
              className={cn(
                'flex w-full items-center gap-3 rounded-soft border px-4 py-3 text-left text-sm transition-colors',
                !answered && isChosen && 'border-sage-500 bg-sage-50 dark:border-sage-400 dark:bg-sage-900/40',
                !answered && !isChosen && 'border-cream-300 bg-white hover:border-sage-400 dark:border-night-line dark:bg-night-card',
                answered && isCorrect && 'border-sage-500 bg-sage-50 font-semibold dark:border-sage-400 dark:bg-sage-900/40',
                answered && isChosen && !isCorrect && 'border-rose-300 bg-rose-100/60 dark:border-rose-400/60 dark:bg-rose-300/10',
                answered && !isChosen && !isCorrect && 'opacity-60',
              )}
            >
              <span
                className={cn(
                  'grid h-5 w-5 shrink-0 place-items-center rounded border',
                  isChosen ? 'border-sage-600 bg-sage-600 text-cream-50' : 'border-cream-300 dark:border-night-line',
                )}
                aria-hidden="true"
              >
                {isChosen && <Check className="h-3.5 w-3.5" />}
              </span>
              {opt.arabic && <span className="arabic text-xl">{opt.arabic}</span>}
              <span>{opt.text}</span>
              {answered && isCorrect && !isChosen && (
                <span className="ml-auto text-xs text-sage-600 dark:text-sage-300">нужно было отметить</span>
              )}
            </button>
          );
        })}
      </div>
      {!answered && (
        <button type="button" className="btn-primary mt-4" onClick={confirm} disabled={selected.size === 0}>
          Проверить
        </button>
      )}
    </div>
  );
}

// ─── Сопоставление пар ────────────────────────────────────────────────

function MatchView({ q, onAnswer }: { q: MatchQuestion; onAnswer: (ok: boolean) => void }) {
  const rights = useMemo(() => shuffle(q.pairs.map((p, i) => ({ text: p.right, idx: i }))), [q]);
  const [links, setLinks] = useState<Record<number, number>>({});
  const [activeLeft, setActiveLeft] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);

  function chooseRight(rightIdx: number) {
    if (answered || activeLeft === null) return;
    setLinks((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) if (next[+k] === rightIdx) delete next[+k];
      next[activeLeft] = rightIdx;
      return next;
    });
    setActiveLeft(null);
  }

  function confirm() {
    setAnswered(true);
    const ok = q.pairs.every((_, i) => links[i] === i);
    onAnswer(ok);
  }

  const allLinked = Object.keys(links).length === q.pairs.length;

  return (
    <div>
      <p className="mb-3 text-xs text-ink-faint dark:text-night-faint">
        Нажми на элемент слева, затем на его пару справа.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          {q.pairs.map((p, i) => (
            <button
              key={i}
              type="button"
              disabled={answered}
              aria-pressed={activeLeft === i}
              onClick={() => setActiveLeft(activeLeft === i ? null : i)}
              className={cn(
                'flex w-full items-center gap-2 rounded-soft border px-3 py-2.5 text-left text-sm transition-colors',
                activeLeft === i
                  ? 'border-sage-600 bg-sage-100 dark:border-sage-400 dark:bg-sage-900/50'
                  : 'border-cream-300 bg-white dark:border-night-line dark:bg-night-card',
                answered && links[i] === i && 'border-sage-500 bg-sage-50 dark:bg-sage-900/40',
                answered && links[i] !== i && 'border-rose-300 bg-rose-100/60 dark:bg-rose-300/10',
              )}
            >
              {p.leftArabic && <span className="arabic text-xl">{p.leftArabic}</span>}
              <span>{p.left}</span>
              {links[i] !== undefined && (
                <span className="ml-auto rounded bg-cream-200 px-1.5 text-xs dark:bg-night-raise">
                  {rights.findIndex((r) => r.idx === links[i]) + 1}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {rights.map((r, pos) => {
            const linkedLeft = Object.entries(links).find(([, v]) => v === r.idx)?.[0];
            return (
              <button
                key={r.idx}
                type="button"
                disabled={answered || activeLeft === null}
                onClick={() => chooseRight(r.idx)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-soft border px-3 py-2.5 text-left text-sm transition-colors',
                  activeLeft !== null && !answered
                    ? 'border-gold-400 bg-sand-100/60 dark:border-gold-500/50 dark:bg-night-raise'
                    : 'border-cream-300 bg-white dark:border-night-line dark:bg-night-card',
                  linkedLeft !== undefined && !answered && 'border-sage-400 dark:border-sage-500',
                  answered && linkedLeft !== undefined && +linkedLeft === r.idx && 'border-sage-500 bg-sage-50 dark:bg-sage-900/40',
                  answered && linkedLeft !== undefined && +linkedLeft !== r.idx && 'border-rose-300 bg-rose-100/60 dark:bg-rose-300/10',
                )}
              >
                <span className="rounded bg-cream-200 px-1.5 text-xs dark:bg-night-raise" aria-hidden="true">
                  {pos + 1}
                </span>
                <span>{r.text}</span>
              </button>
            );
          })}
        </div>
      </div>
      {!answered && (
        <button type="button" className="btn-primary mt-4" onClick={confirm} disabled={!allLinked}>
          Проверить
        </button>
      )}
    </div>
  );
}

// ─── Классификация (drag-and-drop + нажатия) ─────────────────────────

function ClassifyView({ q, onAnswer }: { q: ClassifyQuestion; onAnswer: (ok: boolean) => void }) {
  const [placement, setPlacement] = useState<Record<string, string>>({});
  const [activeItem, setActiveItem] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);

  const unplaced = q.items.filter((it) => !placement[it.letterId]);

  function place(letterId: string, categoryId: string) {
    if (answered) return;
    setPlacement((prev) => ({ ...prev, [letterId]: categoryId }));
    setActiveItem(null);
  }

  function unplace(letterId: string) {
    if (answered) return;
    setPlacement((prev) => {
      const next = { ...prev };
      delete next[letterId];
      return next;
    });
  }

  function confirm() {
    setAnswered(true);
    const ok = q.items.every((it) => placement[it.letterId] === it.categoryId);
    onAnswer(ok);
  }

  return (
    <div>
      <p className="mb-3 text-xs text-ink-faint dark:text-night-faint">
        Перетащи букву на полочку — или нажми на букву, а затем на полочку.
      </p>
      {/* Пул букв */}
      <div
        className="mb-4 flex min-h-[64px] flex-wrap items-center gap-2 rounded-soft border border-dashed border-cream-300 p-3 dark:border-night-line"
        dir="rtl"
        aria-label="Буквы для распределения"
      >
        {unplaced.length === 0 && (
          <span className="text-xs text-ink-faint dark:text-night-faint" dir="ltr">
            Все буквы разложены — нажми «Проверить»
          </span>
        )}
        {unplaced.map((it) => (
          <button
            key={it.letterId}
            type="button"
            draggable={!answered}
            aria-pressed={activeItem === it.letterId}
            onDragStart={(e) => e.dataTransfer.setData('text/plain', it.letterId)}
            onClick={() => setActiveItem(activeItem === it.letterId ? null : it.letterId)}
            className={cn(
              'arabic grid h-12 w-12 cursor-grab place-items-center rounded-soft border pb-1 text-2xl transition-all',
              activeItem === it.letterId
                ? 'scale-110 border-sage-600 bg-sage-100 dark:border-sage-400 dark:bg-sage-900/50'
                : 'border-cream-300 bg-white hover:border-sage-400 dark:border-night-line dark:bg-night-card',
            )}
          >
            {it.arabic}
          </button>
        ))}
      </div>
      {/* Полки */}
      <div className={cn('grid gap-3', q.categories.length > 2 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
        {q.categories.map((cat) => {
          const itemsHere = q.items.filter((it) => placement[it.letterId] === cat.id);
          return (
            <div
              key={cat.id}
              role="group"
              aria-label={`Полочка: ${cat.label}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text/plain');
                if (id) place(id, cat.id);
              }}
              onClick={() => activeItem && place(activeItem, cat.id)}
              className={cn(
                'min-h-[110px] rounded-soft border-2 p-3 transition-colors',
                activeItem
                  ? 'cursor-pointer border-gold-400 bg-sand-100/50 dark:border-gold-500/60 dark:bg-night-raise'
                  : 'border-cream-300 bg-cream-100/60 dark:border-night-line dark:bg-night-raise',
              )}
            >
              <p className="mb-2 text-center text-sm font-bold">{cat.label}</p>
              <div className="flex flex-wrap justify-center gap-1.5" dir="rtl">
                {itemsHere.map((it) => {
                  const ok = it.categoryId === cat.id;
                  return (
                    <button
                      key={it.letterId}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        unplace(it.letterId);
                      }}
                      title={answered ? undefined : 'Вернуть в пул'}
                      className={cn(
                        'arabic grid h-11 w-11 place-items-center rounded-soft border pb-1 text-xl',
                        !answered && 'border-sage-300 bg-white dark:border-sage-700 dark:bg-night-card',
                        answered && ok && 'border-sage-500 bg-sage-50 dark:bg-sage-900/40',
                        answered && !ok && 'border-rose-300 bg-rose-100/70 dark:bg-rose-300/10',
                      )}
                    >
                      {it.arabic}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {!answered && (
        <button
          type="button"
          className="btn-primary mt-4"
          onClick={confirm}
          disabled={unplaced.length > 0}
        >
          Проверить
        </button>
      )}
    </div>
  );
}

// ─── Основной раннер ──────────────────────────────────────────────────

interface QuizRunnerProps {
  questions: QuizQuestion[];
  quizId: string;
  title?: string;
  onRestart?: () => void;
}

export function QuizRunner({ questions, quizId, title, onRestart }: QuizRunnerProps) {
  const [index, setIndex] = useState(0);
  const [answeredOk, setAnsweredOk] = useState<boolean | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [done, setDone] = useState(false);
  const { recordQuizResult, recordMistake } = useAppState();
  const reduced = useReducedMotion();

  const q = questions[index];

  function handleAnswer(ok: boolean) {
    setAnsweredOk(ok);
    if (ok) setCorrectCount((c) => c + 1);
    else recordMistake(q.sifatIds as SifatId[]);
  }

  function next() {
    if (index < questions.length - 1) {
      setIndex(index + 1);
      setAnsweredOk(null);
    } else {
      setDone(true);
      recordQuizResult(quizId, correctCount, questions.length);
    }
  }

  if (done) {
    const pct = Math.round((correctCount / questions.length) * 100);
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <p className="arabic mb-2 text-4xl text-sage-600 dark:text-sage-300">{pct >= 80 ? 'أَحْسَنْت' : 'صِفَة'}</p>
        <h2 className="mb-2 font-serif text-2xl font-semibold">
          {correctCount} из {questions.length} ({pct}%)
        </h2>
        <p className="mb-6 text-sm text-ink-soft dark:text-night-soft">
          {pct === 100
            ? 'Безупречно! Система сыфатов разложена по полочкам.'
            : pct >= 80
              ? 'Отличный результат! Загляни в «Повторить», чтобы закрыть оставшиеся пробелы.'
              : pct >= 50
                ? 'Хорошая база. Ошибки записаны — страница «Повторить» подскажет, какие уроки освежить.'
                : 'Не расстраивайся: ошибки уже превратились в персональный план на странице «Повторить».'}
        </p>
        {onRestart && (
          <button type="button" className="btn-primary" onClick={onRestart}>
            <RotateCcw className="h-4 w-4" />
            Пройти ещё раз
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="card mx-auto max-w-2xl p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        {title && <p className="text-sm font-semibold text-ink-soft dark:text-night-soft">{title}</p>}
        <p className="ml-auto text-xs font-semibold uppercase tracking-wide text-ink-faint dark:text-night-faint">
          {index + 1} / {questions.length}
        </p>
      </div>
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-cream-200 dark:bg-night-raise" aria-hidden="true">
        <motion.div
          className="h-full bg-sage-500"
          initial={false}
          animate={{ width: `${((index + (answeredOk !== null ? 1 : 0)) / questions.length) * 100}%` }}
          transition={reduced ? { duration: 0 } : { duration: 0.3 }}
        />
      </div>

      <p className="mb-4 font-semibold leading-snug">{q.prompt}</p>

      {(q.kind === 'single' || q.kind === 'truefalse') && (
        <SingleView key={q.id} q={q} onAnswer={handleAnswer} />
      )}
      {q.kind === 'odd-one-out' && <SingleView key={q.id} q={q} onAnswer={handleAnswer} />}
      {q.kind === 'multi' && <MultiView key={q.id} q={q} onAnswer={handleAnswer} />}
      {q.kind === 'match' && <MatchView key={q.id} q={q} onAnswer={handleAnswer} />}
      {q.kind === 'classify' && <ClassifyView key={q.id} q={q} onAnswer={handleAnswer} />}

      {answeredOk !== null && (
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'mt-4 rounded-soft p-4 text-sm leading-relaxed',
            answeredOk ? 'bg-sage-50 dark:bg-sage-900/30' : 'bg-cream-100 dark:bg-night-raise',
          )}
        >
          <p className="mb-1 font-semibold">{answeredOk ? 'Верно! Почему:' : 'Не совсем. Правильный ответ:'}</p>
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
