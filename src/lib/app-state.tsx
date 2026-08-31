import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Favorites, LetterId, Settings, SifatId, UserProgress } from '@/types';
import { lessons } from '@/data/lessons';
import { FAVORITES_KEY, PROGRESS_KEY, SETTINGS_KEY, loadJSON, saveJSON } from './storage';

const defaultProgress: UserProgress = {
  completedLessons: [],
  lastLessonSlug: null,
  quizResults: {},
  mistakes: {},
  onboardingDone: false,
};

const defaultFavorites: Favorites = { letters: [], sifat: [], examples: [] };

const defaultSettings: Settings = { theme: null, sequentialLock: true };

interface AppState {
  progress: UserProgress;
  favorites: Favorites;
  settings: Settings;
  completeLesson: (slug: string) => void;
  setLastLesson: (slug: string) => void;
  recordQuizResult: (quizId: string, correct: number, total: number) => void;
  recordMistake: (sifatIds: SifatId[]) => void;
  clearMistakes: () => void;
  finishOnboarding: () => void;
  resetProgress: () => void;
  toggleFavoriteLetter: (id: LetterId) => void;
  toggleFavoriteSifat: (id: SifatId) => void;
  toggleFavoriteExample: (id: string) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setSequentialLock: (lock: boolean) => void;
  isLessonUnlocked: (slug: string, lessonNumber: number) => boolean;
}

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<UserProgress>(() =>
    loadJSON(PROGRESS_KEY, defaultProgress),
  );
  const [favorites, setFavorites] = useState<Favorites>(() =>
    loadJSON(FAVORITES_KEY, defaultFavorites),
  );
  const [settings, setSettings] = useState<Settings>(() => loadJSON(SETTINGS_KEY, defaultSettings));

  useEffect(() => saveJSON(PROGRESS_KEY, progress), [progress]);
  useEffect(() => saveJSON(FAVORITES_KEY, favorites), [favorites]);
  useEffect(() => saveJSON(SETTINGS_KEY, settings), [settings]);

  useEffect(() => {
    const root = document.documentElement;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = settings.theme === 'dark' || (settings.theme === null && prefersDark);
    root.classList.toggle('dark', dark);
  }, [settings.theme]);

  const completeLesson = useCallback((slug: string) => {
    setProgress((p) =>
      p.completedLessons.includes(slug)
        ? p
        : { ...p, completedLessons: [...p.completedLessons, slug] },
    );
  }, []);

  const setLastLesson = useCallback((slug: string) => {
    setProgress((p) => (p.lastLessonSlug === slug ? p : { ...p, lastLessonSlug: slug }));
  }, []);

  const recordQuizResult = useCallback((quizId: string, correct: number, total: number) => {
    setProgress((p) => ({
      ...p,
      quizResults: {
        ...p.quizResults,
        [quizId]: { date: new Date().toISOString(), correct, total },
      },
    }));
  }, []);

  const recordMistake = useCallback((sifatIds: SifatId[]) => {
    if (sifatIds.length === 0) return;
    setProgress((p) => {
      const mistakes = { ...p.mistakes };
      for (const id of sifatIds) mistakes[id] = (mistakes[id] ?? 0) + 1;
      return { ...p, mistakes };
    });
  }, []);

  const clearMistakes = useCallback(() => {
    setProgress((p) => ({ ...p, mistakes: {} }));
  }, []);

  const finishOnboarding = useCallback(() => {
    setProgress((p) => ({ ...p, onboardingDone: true }));
  }, []);

  const resetProgress = useCallback(() => {
    setProgress({ ...defaultProgress, onboardingDone: true });
  }, []);

  const toggleFavoriteLetter = useCallback((id: LetterId) => {
    setFavorites((f) => ({
      ...f,
      letters: f.letters.includes(id) ? f.letters.filter((x) => x !== id) : [...f.letters, id],
    }));
  }, []);

  const toggleFavoriteSifat = useCallback((id: SifatId) => {
    setFavorites((f) => ({
      ...f,
      sifat: f.sifat.includes(id) ? f.sifat.filter((x) => x !== id) : [...f.sifat, id],
    }));
  }, []);

  const toggleFavoriteExample = useCallback((id: string) => {
    setFavorites((f) => ({
      ...f,
      examples: f.examples.includes(id) ? f.examples.filter((x) => x !== id) : [...f.examples, id],
    }));
  }, []);

  const setTheme = useCallback((theme: 'light' | 'dark') => {
    setSettings((s) => ({ ...s, theme }));
  }, []);

  const setSequentialLock = useCallback((sequentialLock: boolean) => {
    setSettings((s) => ({ ...s, sequentialLock }));
  }, []);

  const isLessonUnlocked = useCallback(
    (slug: string, lessonNumber: number) => {
      void slug;
      if (!settings.sequentialLock) return true;
      if (lessonNumber <= 1) return true;
      const prev = lessons[lessonNumber - 2];
      return prev ? progress.completedLessons.includes(prev.slug) : true;
    },
    [settings.sequentialLock, progress.completedLessons],
  );

  const value = useMemo<AppState>(
    () => ({
      progress,
      favorites,
      settings,
      completeLesson,
      setLastLesson,
      recordQuizResult,
      recordMistake,
      clearMistakes,
      finishOnboarding,
      resetProgress,
      toggleFavoriteLetter,
      toggleFavoriteSifat,
      toggleFavoriteExample,
      setTheme,
      setSequentialLock,
      isLessonUnlocked,
    }),
    [
      progress,
      favorites,
      settings,
      completeLesson,
      setLastLesson,
      recordQuizResult,
      recordMistake,
      clearMistakes,
      finishOnboarding,
      resetProgress,
      toggleFavoriteLetter,
      toggleFavoriteSifat,
      toggleFavoriteExample,
      setTheme,
      setSequentialLock,
      isLessonUnlocked,
    ],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
