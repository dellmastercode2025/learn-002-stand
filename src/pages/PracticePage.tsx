import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { genByMode, type PracticeMode } from '@/lib/practice';
import type { QuizQuestion } from '@/types';
import { QuizRunner } from '@/components/quiz/QuizRunner';
import { Flashcards } from '@/components/practice/Flashcards';
import { Shelves } from '@/components/practice/Shelves';
import { usePageMeta } from '@/lib/use-page-meta';

type Screen = 'menu' | PracticeMode | 'flashcards' | 'shelves';

const modes: { id: PracticeMode; title: string; desc: string; arabic: string }[] = [
  { id: 'letter-sifat', title: 'Сыфаты буквы', desc: 'Какие сыфаты имеет эта буква?', arabic: 'ق' },
  { id: 'sifat-letters', title: 'Буквы сыфата', desc: 'Какие буквы относятся к этому сыфату?', arabic: 'فرّ' },
  { id: 'description', title: 'Угадай по описанию', desc: 'Определи сыфат по его определению', arabic: '؟' },
  { id: 'odd-one-out', title: 'Лишняя буква', desc: 'Найди букву, выпадающую из группы', arabic: 'س' },
  { id: 'compare', title: 'Сравни буквы', desc: 'Каким свойством различаются двойники?', arabic: 'ت ط' },
  { id: 'word', title: 'Разбери слово', desc: 'Сыфаты букв в кораническом слове', arabic: 'قُلْ' },
];

function genSet(mode: PracticeMode, n = 6): QuizQuestion[] {
  return Array.from({ length: n }, () => genByMode(mode));
}

export default function PracticePage() {
  usePageMeta(
    'Практика: тренажёры по сыфатам | Таджвид',
    'Шесть режимов практики, флешкарты и игра «Разложи по полочкам» — закрепи систему сыфатов.',
  );
  const [screen, setScreen] = useState<Screen>('menu');
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [round, setRound] = useState(0);

  function openMode(mode: PracticeMode) {
    setQuestions(genSet(mode));
    setScreen(mode);
    setRound((r) => r + 1);
  }

  if (screen === 'menu') {
    return (
      <div>
        <h1 className="mb-2 font-serif text-3xl font-bold">Практика</h1>
        <p className="mb-8 max-w-lg text-sm text-ink-soft dark:text-night-soft">
          Задания собираются из единой базы данных курса, поэтому каждый запуск — новый набор.
          После каждого ответа тренажёр объясняет, почему ответ именно такой.
        </p>

        <h2 className="mb-3 font-serif text-xl font-semibold">Режимы</h2>
        <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => openMode(m.id)}
              className="card card-hover p-5 text-left"
            >
              <span className="arabic mb-2 block text-3xl text-sage-600 dark:text-sage-300" aria-hidden="true">
                {m.arabic}
              </span>
              <span className="block font-serif text-lg font-semibold">{m.title}</span>
              <span className="block text-sm text-ink-soft dark:text-night-soft">{m.desc}</span>
            </button>
          ))}
        </div>

        <h2 className="mb-3 font-serif text-xl font-semibold">Особые тренажёры</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => setScreen('flashcards')} className="card card-hover p-5 text-left">
            <span className="arabic mb-2 block text-3xl text-gold-500" aria-hidden="true">الهَمْس</span>
            <span className="block font-serif text-lg font-semibold">Карточки</span>
            <span className="block text-sm text-ink-soft dark:text-night-soft">
              Флешкарты по всем 17 сыфатам: «знаю / повторить / не знаю»
            </span>
          </button>
          <button type="button" onClick={() => setScreen('shelves')} className="card card-hover p-5 text-left">
            <span className="arabic mb-2 block text-3xl text-gold-500" aria-hidden="true">ق ط ب</span>
            <span className="block font-serif text-lg font-semibold">Разложи по полочкам</span>
            <span className="block text-sm text-ink-soft dark:text-night-soft">
              Перетаскивай буквы на полки: хамс/джахр, шидда/рихва и другие
            </span>
          </button>
        </div>
      </div>
    );
  }

  const backButton = (
    <button type="button" className="btn-ghost mb-4" onClick={() => setScreen('menu')}>
      <ArrowLeft className="h-4 w-4" />
      Все режимы
    </button>
  );

  if (screen === 'flashcards') {
    return (
      <div className="mx-auto max-w-2xl">
        {backButton}
        <h1 className="mb-4 font-serif text-2xl font-bold">Карточки</h1>
        <Flashcards />
      </div>
    );
  }

  if (screen === 'shelves') {
    return (
      <div className="mx-auto max-w-3xl">
        {backButton}
        <h1 className="mb-4 font-serif text-2xl font-bold">Разложи по полочкам</h1>
        <Shelves />
      </div>
    );
  }

  const mode = modes.find((m) => m.id === screen)!;
  return (
    <div className="mx-auto max-w-3xl">
      {backButton}
      <h1 className="mb-4 font-serif text-2xl font-bold">{mode.title}</h1>
      <QuizRunner
        key={round}
        questions={questions}
        quizId={`practice-${mode.id}`}
        title={mode.desc}
        onRestart={() => openMode(mode.id)}
      />
    </div>
  );
}
