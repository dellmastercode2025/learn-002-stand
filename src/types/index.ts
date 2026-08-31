// ─── Центральные типы учебного контента ────────────────────────────────

export type SifatId =
  | 'hams'
  | 'jahr'
  | 'shidda'
  | 'tawassut'
  | 'rakhawa'
  | 'istila'
  | 'istifal'
  | 'itbaq'
  | 'infitah'
  | 'idhlaq'
  | 'ismat'
  | 'safir'
  | 'qalqala'
  | 'lin'
  | 'inhiraf'
  | 'takrir'
  | 'tafashshi'
  | 'istitala';

export type LetterId =
  | 'hamza'
  | 'alif'
  | 'ba'
  | 'ta'
  | 'tha'
  | 'jim'
  | 'hha'
  | 'kha'
  | 'dal'
  | 'dhal'
  | 'ra'
  | 'zay'
  | 'sin'
  | 'shin'
  | 'sad'
  | 'dad'
  | 'tta'
  | 'zha'
  | 'ayn'
  | 'ghayn'
  | 'fa'
  | 'qaf'
  | 'kaf'
  | 'lam'
  | 'mim'
  | 'nun'
  | 'ha'
  | 'waw'
  | 'ya';

export type MakhrajZone = 'jawf' | 'halq' | 'lisan' | 'shafatan' | 'khayshum';

/** Группа противоположных сыфатов (для схемы и сравнения) */
export type OppositionGroup = 'breath' | 'flow' | 'elevation' | 'closure' | 'fluency';

export interface Sifat {
  id: SifatId;
  /** Арабское название с харакатами, напр. الهَمْس */
  arabicName: string;
  /** Транслитерация, напр. «аль-хамс» */
  translit: string;
  /** Русское учебное название, напр. «Хамс» */
  russianName: string;
  /** Буквальный перевод, напр. «шёпот, дыхание» */
  meaning: string;
  /** Определение одним-двумя предложениями, без жаргона */
  shortDefinition: string;
  /** Что происходит со звуком — образное описание */
  whatHappens: string;
  /** Эксперимент «почувствуй сам» */
  feel: string;
  /** Типичная ошибка ученика */
  commonMistake: string;
  category: 'opposed' | 'unopposed';
  oppositeIds?: SifatId[];
  group?: OppositionGroup;
  /** Буквы, обладающие сыфатом (source of truth — всё остальное выводится) */
  letters: LetterId[];
  /** Традиционная мнемоническая фраза (из Мукаддимы Ибн аль-Джазари), если есть */
  mnemonic?: string;
  mnemonicTranslit?: string;
  /** Условный сыфат: проявляется не всегда (лин, калькаля) */
  conditionNote?: string;
  /** Слаг урока, в котором сыфат изучается */
  lessonSlug: string;
}

export interface Letter {
  id: LetterId;
  arabic: string;
  /** Русское название буквы, напр. «Каф» */
  name: string;
  arabicLetterName: string;
  translit: string;
  makhrajZone: MakhrajZone;
  /** Короткое описание точки выхода звука */
  makhraj: string;
  /** Заметка о произношении для русскоязычного ученика */
  pronunciationNote: string;
  /** Пример слова с этой буквой (проверенное написание) */
  example?: { word: string; translit: string; translation: string };
  /** Особый статус (алиф — буква мадда, хамза) */
  specialNote?: string;
  /** Приблизительная позиция точки махраджа на SVG-схеме рта (viewBox 0 0 320 260) */
  diagramPoint?: { x: number; y: number };
}

/** Буква со списком её сыфатов (выводится из sifat.letters автоматически) */
export interface LetterWithSifat extends Letter {
  sifatIds: SifatId[];
}

// ─── Уроки ──────────────────────────────────────────────────────────────

export type LessonBlock =
  | { type: 'goal'; items: string[] }
  | { type: 'text'; title?: string; paragraphs: string[] }
  | { type: 'experiment'; title: string; steps: string[]; conclusion?: string }
  | {
      type: 'term';
      arabic: string;
      translit: string;
      russian: string;
      meaning: string;
      definition: string;
    }
  | { type: 'analogy'; title: string; text: string; note?: string }
  | { type: 'letters'; sifatId: SifatId; title?: string; note?: string }
  | { type: 'letterGrid'; letterIds: LetterId[]; title?: string; note?: string }
  | { type: 'diagram'; diagram: DiagramKind; caption?: string }
  | { type: 'video'; topic: string; title?: string }
  | { type: 'mistake'; title?: string; text: string }
  | { type: 'tryit'; title?: string; steps: string[] }
  | { type: 'compareTable'; title?: string; rows: CompareRow[] }
  | { type: 'summary'; items: string[] }
  | { type: 'sifatCards'; sifatIds: SifatId[]; title?: string }
  | { type: 'quranExamples'; exampleIds: string[]; title?: string }
  | { type: 'callout'; tone: 'info' | 'warn' | 'tip'; title?: string; text: string };

export interface CompareRow {
  label: string;
  left: string;
  right: string;
}

export type DiagramKind =
  | 'mouth-side'
  | 'airflow-hams-jahr'
  | 'flow-scale'
  | 'tongue-elevation'
  | 'itbaq-infitah'
  | 'sifat-tree'
  | 'sound-birth'
  | 'makhraj-map';

export interface MiniQuizQuestion {
  id: string;
  question: string;
  /** Арабская буква/слово, показываемое крупно */
  arabic?: string;
  options: { text: string; arabic?: string }[];
  correctIndex: number;
  explanation: string;
}

export interface Lesson {
  number: number;
  slug: string;
  title: string;
  subtitle: string;
  /** Что поймём за урок — короткая фраза для карты курса */
  promise: string;
  sifatIds: SifatId[];
  blocks: LessonBlock[];
  miniQuiz: MiniQuizQuestion[];
  /** SEO */
  metaTitle: string;
  metaDescription: string;
}

// ─── Видео ──────────────────────────────────────────────────────────────

export type VideoLanguage = 'ru' | 'ar' | 'en';

export interface VideoResource {
  id: string;
  /** Тема: id сыфата, 'intro', 'alphabet', 'makharij-throat' и т.п. */
  topic: string;
  title: string;
  teacher: string;
  channelNote?: string;
  language: VideoLanguage;
  /** Есть ли русские субтитры (для ar/en видео) */
  russianSubtitles?: boolean;
  youtubeUrl?: string;
  youtubeVideoId?: string;
  status: 'verified' | 'needs-verification';
  verifiedDate?: string;
  verificationMethod?: string;
  description: string;
  relatedSifat: SifatId[];
  relatedLetters: LetterId[];
}

// ─── Примеры из Корана ─────────────────────────────────────────────────

export interface QuranExample {
  id: string;
  /** Арабское слово или фраза с харакатами */
  arabic: string;
  translit: string;
  translation: string;
  /** Сура:аят (проверено) */
  source: string;
  sourceName: string;
  /** Разбор: буква → какие сыфаты здесь слышны */
  highlights: {
    letter: LetterId;
    /** Порядковый номер базовой (не-огласовочной) буквы в строке arabic, с нуля */
    baseIndex: number;
    sifatIds: SifatId[];
    note: string;
  }[];
}

// ─── Тесты и практика ──────────────────────────────────────────────────

export type QuizKind =
  | 'single'
  | 'multi'
  | 'truefalse'
  | 'match'
  | 'classify'
  | 'odd-one-out';

export interface QuizQuestionBase {
  id: string;
  kind: QuizKind;
  prompt: string;
  explanation: string;
  /** По какому сыфату вопрос — для умного повторения */
  sifatIds: SifatId[];
}

export interface SingleChoiceQuestion extends QuizQuestionBase {
  kind: 'single' | 'truefalse';
  arabic?: string;
  options: { text: string; arabic?: string }[];
  correctIndex: number;
}

export interface MultiChoiceQuestion extends QuizQuestionBase {
  kind: 'multi';
  arabic?: string;
  options: { text: string; arabic?: string }[];
  correctIndices: number[];
}

export interface MatchQuestion extends QuizQuestionBase {
  kind: 'match';
  pairs: { left: string; leftArabic?: string; right: string }[];
}

export interface ClassifyQuestion extends QuizQuestionBase {
  kind: 'classify';
  categories: { id: string; label: string }[];
  items: { arabic: string; letterId: LetterId; categoryId: string }[];
}

export interface OddOneOutQuestion extends QuizQuestionBase {
  kind: 'odd-one-out';
  arabic?: string;
  options: { text: string; arabic?: string }[];
  correctIndex: number;
}

export type QuizQuestion =
  | SingleChoiceQuestion
  | MultiChoiceQuestion
  | MatchQuestion
  | ClassifyQuestion
  | OddOneOutQuestion;

// ─── Прогресс пользователя ─────────────────────────────────────────────

export interface QuizResult {
  date: string;
  correct: number;
  total: number;
}

export interface UserProgress {
  completedLessons: string[];
  lastLessonSlug: string | null;
  quizResults: Record<string, QuizResult>;
  /** Счётчик ошибок по сыфатам — для «умного повторения» */
  mistakes: Partial<Record<SifatId, number>>;
  onboardingDone: boolean;
}

export interface Favorites {
  letters: LetterId[];
  sifat: SifatId[];
  examples: string[];
}

export interface Settings {
  theme: 'light' | 'dark' | null;
  sequentialLock: boolean;
}
