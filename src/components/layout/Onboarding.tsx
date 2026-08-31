import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '@/lib/app-state';

const screens = [
  {
    arabic: 'صِفَة',
    title: 'Сыфаты кажутся сложными?',
    text: 'Таблицы, арабские термины, десятки букв… Знакомо. Этот курс устроен иначе.',
  },
  {
    arabic: 'س — ص',
    title: 'Сначала — звук, потом — название',
    text: 'Мы сначала почувствуем каждое свойство на собственном произношении, а термин прикрепим потом.',
  },
  {
    arabic: '١٢',
    title: 'Через 12 уроков ты увидишь всю систему целиком',
    text: 'Схемы, тренажёры и проверенные видео помогут превратить «тёмный лес» в понятную карту.',
  },
];

export function Onboarding() {
  const [step, setStep] = useState(0);
  const { finishOnboarding } = useAppState();
  const navigate = useNavigate();
  const reduced = useReducedMotion();

  const s = screens[step];
  const last = step === screens.length - 1;

  function start() {
    finishOnboarding();
    navigate('/course/01-what-is-sifat');
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm dark:bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Знакомство с курсом"
    >
      <div className="card w-full max-w-md overflow-hidden p-8 text-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
          >
            <div className="arabic mx-auto mb-4 text-5xl text-sage-600 dark:text-sage-300">{s.arabic}</div>
            <h2 className="mb-3 font-serif text-2xl font-semibold">{s.title}</h2>
            <p className="mb-8 text-ink-soft dark:text-night-soft">{s.text}</p>
          </motion.div>
        </AnimatePresence>
        <div className="mb-6 flex justify-center gap-2" aria-hidden="true">
          {screens.map((_, i) => (
            <span
              key={i}
              className={
                i === step
                  ? 'h-2 w-6 rounded-full bg-sage-600 transition-all dark:bg-sage-400'
                  : 'h-2 w-2 rounded-full bg-cream-300 transition-all dark:bg-night-line'
              }
            />
          ))}
        </div>
        <div className="flex items-center justify-center gap-3">
          <button type="button" className="btn-ghost" onClick={finishOnboarding}>
            Пропустить
          </button>
          {last ? (
            <button type="button" className="btn-primary" onClick={start}>
              Начать
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={() => setStep(step + 1)}>
              Дальше
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
