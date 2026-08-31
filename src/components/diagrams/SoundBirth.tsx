import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Pause, Play } from 'lucide-react';
import { letterWithSifatById } from '@/data/letters';
import { sifatById } from '@/data/sifat';
import type { LetterId } from '@/types';
import { cn } from '@/lib/utils';
import { MouthDiagram, type Airflow, type TonguePose } from './MouthDiagram';

const availableLetters: LetterId[] = ['sad', 'qaf', 'ba', 'sin', 'tta', 'ra', 'kaf', 'dal', 'shin', 'ayn'];

/** Компонент «Как рождается звук»: пошаговая анимация артикуляции буквы */
export function SoundBirth() {
  const [letterId, setLetterId] = useState<LetterId>('sad');
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [slow, setSlow] = useState(false);
  const reduced = useReducedMotion();

  const letter = letterWithSifatById[letterId];

  const pose: TonguePose = letter.sifatIds.includes('itbaq')
    ? 'itbaq'
    : letter.sifatIds.includes('istila')
      ? 'raised'
      : 'rest';
  const air: Airflow = letter.sifatIds.includes('hams') ? 'free' : 'blocked';

  const steps = useMemo(
    () => [
      {
        title: '1. Положение языка',
        text: letter.sifatIds.includes('itbaq')
          ? 'Язык поднимается и «накрывает» нёбо (итбак).'
          : letter.sifatIds.includes('istila')
            ? 'Задняя часть языка поднимается к нёбу (исти‘ля).'
            : 'Язык остаётся в низком, спокойном положении (истифаль).',
      },
      { title: '2. Точка махраджа', text: letter.makhraj },
      {
        title: '3. Дыхание и звук',
        text: letter.sifatIds.includes('hams')
          ? 'Поток воздуха свободно выходит вместе со звуком (хамс).'
          : 'Дыхание задерживается — звук плотный и звонкий (джахр).',
      },
      {
        title: '4. Сыфаты буквы',
        text: letter.sifatIds.map((s) => sifatById[s].russianName).join(', '),
      },
      {
        title: '5. Результат',
        text: letter.pronunciationNote,
      },
    ],
    [letter],
  );

  // Автовоспроизведение
  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(
      () => {
        setStep((s) => {
          if (s >= steps.length - 1) {
            setPlaying(false);
            return s;
          }
          return s + 1;
        });
      },
      slow ? 4000 : 2200,
    );
    return () => clearInterval(interval);
  }, [playing, slow, steps.length]);

  function selectLetter(id: LetterId) {
    setLetterId(id);
    setStep(0);
    setPlaying(false);
  }

  const showPoint = step >= 1;
  const showAir = step >= 2;

  return (
    <div className="card p-5">
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Выбор буквы">
        {availableLetters.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={letterId === id}
            onClick={() => selectLetter(id)}
            className={cn(
              'arabic grid h-11 w-11 place-items-center rounded-soft border pb-1 text-xl transition-all',
              letterId === id
                ? 'scale-105 border-sage-600 bg-sage-100 text-sage-800 dark:border-sage-400 dark:bg-sage-900 dark:text-sage-200'
                : 'border-cream-300 bg-white hover:border-sage-300 dark:border-night-line dark:bg-night-card',
            )}
          >
            {letterWithSifatById[id].arabic}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <div className="shrink-0 md:w-1/2">
          <MouthDiagram
            tongue={step >= 0 ? pose : 'rest'}
            point={showPoint ? (letter.diagramPoint ?? null) : null}
            airflow={showAir ? air : 'none'}
            title={`Артикуляция буквы ${letter.name}`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex items-center gap-3">
            <span className="arabic text-4xl text-sage-700 dark:text-sage-300">{letter.arabic}</span>
            <div>
              <p className="font-serif text-lg font-semibold">{letter.name}</p>
              <p className="text-xs text-ink-soft dark:text-night-soft">{letter.arabicLetterName} · {letter.translit}</p>
            </div>
          </div>

          {/* Шаги */}
          <ol className="mb-4 space-y-1.5">
            {steps.map((s, i) => (
              <li key={s.title}>
                <button
                  type="button"
                  onClick={() => {
                    setStep(i);
                    setPlaying(false);
                  }}
                  aria-current={i === step ? 'step' : undefined}
                  className={cn(
                    'w-full rounded-soft px-3 py-2 text-left text-sm transition-colors',
                    i === step
                      ? 'bg-sage-100 font-semibold text-sage-900 dark:bg-sage-900 dark:text-sage-100'
                      : i < step
                        ? 'text-ink-soft dark:text-night-soft'
                        : 'text-ink-faint dark:text-night-faint',
                  )}
                >
                  <span className="block">{s.title}</span>
                  <AnimatePresence initial={false}>
                    {i === step && (
                      <motion.span
                        className="mt-0.5 block font-normal text-ink-soft dark:text-night-soft"
                        initial={reduced ? false : { opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={reduced ? undefined : { opacity: 0, height: 0 }}
                      >
                        {s.text}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              </li>
            ))}
          </ol>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                if (step >= steps.length - 1) setStep(0);
                setPlaying((p) => !p);
              }}
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {playing ? 'Пауза' : 'Воспроизвести'}
            </button>
            <div className="flex overflow-hidden rounded-soft border border-cream-300 text-sm dark:border-night-line" role="group" aria-label="Скорость">
              <button
                type="button"
                aria-pressed={slow}
                onClick={() => setSlow(true)}
                className={cn('px-3 py-1.5', slow ? 'bg-sage-600 font-semibold text-cream-50 dark:bg-sage-500 dark:text-night-bg' : 'bg-white dark:bg-night-card')}
              >
                медленно
              </button>
              <button
                type="button"
                aria-pressed={!slow}
                onClick={() => setSlow(false)}
                className={cn('px-3 py-1.5', !slow ? 'bg-sage-600 font-semibold text-cream-50 dark:bg-sage-500 dark:text-night-bg' : 'bg-white dark:bg-night-card')}
              >
                обычно
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
