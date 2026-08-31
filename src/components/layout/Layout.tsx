import { useEffect, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  BookOpen,
  GitCompare,
  Grid3x3,
  Heart,
  Home,
  Info,
  Map,
  Menu,
  Moon,
  RefreshCw,
  Sparkles,
  Sun,
  Trophy,
} from 'lucide-react';
import { useState } from 'react';
import { useAppState } from '@/lib/app-state';
import { cn } from '@/lib/utils';
import { SearchBox } from './SearchBox';
import { WatercolorBackdrop } from './Watercolor';
import { Onboarding } from './Onboarding';

const navItems = [
  { to: '/', label: 'Главная', icon: Home },
  { to: '/course', label: 'Курс', icon: BookOpen },
  { to: '/map', label: 'Карта сыфатов', icon: Map },
  { to: '/letters', label: 'Алфавит', icon: Grid3x3 },
  { to: '/compare', label: 'Сравнение', icon: GitCompare },
  { to: '/practice', label: 'Практика', icon: Sparkles },
  { to: '/quiz', label: 'Тест', icon: Trophy },
  { to: '/review', label: 'Повторить', icon: RefreshCw },
  { to: '/favorites', label: 'Избранное', icon: Heart },
  { to: '/about', label: 'О курсе', icon: Info },
];

const mobileNavItems = navItems.filter((n) =>
  ['/', '/course', '/letters', '/practice'].includes(n.to),
);

function ThemeToggle() {
  const { settings, setTheme } = useAppState();
  const isDark =
    settings.theme === 'dark' ||
    (settings.theme === null &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Включить светлую тему' : 'Включить тёмную тему'}
      className="rounded-soft p-2 text-ink-soft transition-colors hover:bg-cream-200 dark:text-night-soft dark:hover:bg-night-raise"
    >
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { progress } = useAppState();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="paper-texture min-h-screen">
      <WatercolorBackdrop />
      {!progress.onboardingDone && <Onboarding />}

      {/* ── Header (mobile + desktop) ─────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-cream-200 bg-cream-50/90 backdrop-blur dark:border-night-line dark:bg-night-bg/90">
        <div className="mx-auto flex max-w-wide items-center gap-3 px-4 py-2.5">
          <NavLink to="/" className="flex items-center gap-2 font-serif text-lg font-semibold text-sage-800 dark:text-sage-200">
            <span className="arabic grid h-9 w-9 place-items-center rounded-full bg-sage-600 pb-1 text-xl text-cream-50 dark:bg-sage-500 dark:text-night-bg">
              ص
            </span>
            <span className="hidden sm:inline">Сыфаты</span>
          </NavLink>
          <div className="ml-auto flex items-center gap-2">
            <SearchBox />
            <ThemeToggle />
            <button
              type="button"
              className="rounded-soft p-2 text-ink-soft hover:bg-cream-200 dark:text-night-soft dark:hover:bg-night-raise lg:hidden"
              aria-label="Открыть меню"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
        {/* Мобильное выпадающее меню */}
        {menuOpen && (
          <nav className="border-t border-cream-200 bg-cream-50 px-4 py-2 dark:border-night-line dark:bg-night-bg lg:hidden" aria-label="Основная навигация">
            <ul className="grid grid-cols-2 gap-1">
              {navItems.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2 rounded-soft px-3 py-2 text-sm font-medium',
                        isActive
                          ? 'bg-sage-100 text-sage-800 dark:bg-sage-900 dark:text-sage-200'
                          : 'text-ink-soft hover:bg-cream-100 dark:text-night-soft dark:hover:bg-night-raise',
                      )
                    }
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>

      <div className="mx-auto flex max-w-wide">
        {/* ── Sidebar (desktop) ───────────────────────────────────── */}
        <aside className="sticky top-[57px] hidden h-[calc(100vh-57px)] w-56 shrink-0 overflow-y-auto px-3 py-6 lg:block">
          <nav aria-label="Основная навигация">
            <ul className="space-y-1">
              {navItems.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={to === '/'}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-soft px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-sage-100 text-sage-800 dark:bg-sage-900 dark:text-sage-200'
                          : 'text-ink-soft hover:bg-cream-100 hover:text-ink dark:text-night-soft dark:hover:bg-night-raise dark:hover:text-night-text',
                      )
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        {/* ── Content ─────────────────────────────────────────────── */}
        <main className="relative min-w-0 flex-1 px-4 pb-24 pt-6 sm:px-6 lg:pb-12">
          {children}
          <footer className="mt-16 border-t border-cream-200 pt-6 text-center text-xs text-ink-faint dark:border-night-line dark:text-night-faint">
            <p className="mx-auto max-w-content">
              Материал предназначен для облегчения изучения таджвида и не заменяет обучение у
              квалифицированного преподавателя.
            </p>
          </footer>
        </main>
      </div>

      {/* ── Bottom navigation (mobile) ────────────────────────────── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-cream-200 bg-cream-50/95 backdrop-blur dark:border-night-line dark:bg-night-bg/95 lg:hidden"
        aria-label="Быстрая навигация"
      >
        <ul className="mx-auto flex max-w-md items-stretch justify-around">
          {mobileNavItems.map(({ to, label, icon: Icon }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium',
                    isActive
                      ? 'text-sage-700 dark:text-sage-300'
                      : 'text-ink-faint dark:text-night-faint',
                  )
                }
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
