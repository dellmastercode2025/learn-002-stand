import { useEffect, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { BookOpen, GitCompare, Grid3x3, Heart, Home, Info, Map, Menu, Moon, RefreshCw, Sparkles, Sun, Trophy } from 'lucide-react';
import { useState } from 'react';
import { useAppState } from '@/lib/app-state';
import { cn } from '@/lib/utils';
import { SearchBox } from './SearchBox';
import { WatercolorBackdrop } from './Watercolor';
import { Onboarding } from './Onboarding';

const navItems = [
  { to: '/', label: 'Главная', icon: Home }, { to: '/course', label: 'Курс', icon: BookOpen },
  { to: '/map', label: 'Карта сыфатов', icon: Map }, { to: '/letters', label: 'Алфавит', icon: Grid3x3 },
  { to: '/compare', label: 'Сравнение', icon: GitCompare }, { to: '/practice', label: 'Практика', icon: Sparkles },
  { to: '/quiz', label: 'Тест', icon: Trophy }, { to: '/review', label: 'Повторить', icon: RefreshCw },
  { to: '/favorites', label: 'Избранное', icon: Heart }, { to: '/about', label: 'О курсе', icon: Info },
];
const mobileNavItems = navItems.filter((n) => ['/', '/course', '/letters', '/practice'].includes(n.to));

function ThemeToggle() {
  const { settings, setTheme } = useAppState();
  const isDark = settings.theme === 'dark' || (settings.theme === null && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  return <button type="button" onClick={() => setTheme(isDark ? 'light' : 'dark')} aria-label={isDark ? 'Включить светлую тему' : 'Включить тёмную тему'} className="rounded-full border border-gold-400/20 bg-cream-50/50 p-2 text-sage-800 transition-colors hover:bg-cream-100 dark:bg-night-card/60 dark:text-sage-200">{isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>;
}

function Brand() {
  return <NavLink to="/" className="group flex items-center gap-3">
    <span className="arabic grid h-11 w-11 place-items-center rounded-[45%_55%_48%_52%] border border-gold-500/40 bg-[#f8f0dc]/85 pb-1 text-2xl text-sage-800 shadow-sm transition-transform group-hover:-rotate-2 dark:bg-night-card dark:text-sage-200">ص</span>
    <span className="leading-tight"><strong className="block font-serif text-lg font-semibold tracking-wide text-sage-900 dark:text-sage-100">Сыфаты</strong><small className="hidden text-[10px] uppercase tracking-[.2em] text-gold-600 sm:block dark:text-gold-300">таджвид · легко и глубоко</small></span>
  </NavLink>;
}

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { progress } = useAppState();
  useEffect(() => { window.scrollTo({ top: 0 }); }, [location.pathname]);

  return <div className="paper-texture min-h-screen">
    <WatercolorBackdrop />
    {!progress.onboardingDone && <Onboarding />}

    <header className="sticky top-0 z-40 border-b border-gold-500/15 bg-[#f7f1e6]/90 shadow-[0_5px_25px_rgba(86,70,45,.035)] backdrop-blur-md dark:bg-night-bg/90">
      <div className="mx-auto flex max-w-wide items-center gap-3 px-4 py-2.5"><Brand /><div className="ml-auto flex items-center gap-2"><SearchBox /><ThemeToggle /><button type="button" className="rounded-full border border-gold-500/15 bg-cream-50/50 p-2 text-sage-800 lg:hidden dark:bg-night-card" aria-label="Открыть меню" aria-expanded={menuOpen} onClick={() => setMenuOpen(v => !v)}><Menu className="h-5 w-5" /></button></div></div>
      {menuOpen && <nav className="border-t border-gold-500/15 bg-[#f8f3e9]/95 px-4 py-3 backdrop-blur dark:bg-night-bg/95 lg:hidden" aria-label="Основная навигация"><ul className="grid grid-cols-2 gap-1">{navItems.map(({to,label,icon:Icon}) => <li key={to}><NavLink to={to} onClick={() => setMenuOpen(false)} className={({isActive}) => cn('flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium', isActive ? 'border border-gold-500/20 bg-white/60 text-sage-900 shadow-sm dark:bg-night-card' : 'text-ink-soft hover:bg-white/40 dark:text-night-soft')}><Icon className="h-4 w-4" />{label}</NavLink></li>)}</ul></nav>}
    </header>

    <div className="mx-auto flex max-w-wide">
      <aside className="sticky top-[65px] hidden h-[calc(100vh-65px)] w-60 shrink-0 overflow-y-auto px-4 py-6 lg:block">
        <div className="book-frame rounded-[24px] border border-gold-500/20 bg-[#edf0e7]/60 px-3 py-5 shadow-[0_15px_40px_rgba(65,83,68,.06)] backdrop-blur-[2px] dark:bg-night-card/55">
          <p className="arabic mb-4 text-center text-3xl text-sage-800/75 dark:text-sage-200/75">تَجْوِيد</p>
          <div className="ornament-rule mb-4"><span className="text-[9px]">✦</span></div>
          <nav aria-label="Основная навигация"><ul className="space-y-1">{navItems.map(({to,label,icon:Icon}) => <li key={to}><NavLink to={to} end={to === '/'} className={({isActive}) => cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all', isActive ? 'border border-gold-500/25 bg-[#fffaf0]/85 text-sage-900 shadow-[0_5px_15px_rgba(83,67,42,.06)] dark:bg-night-raise dark:text-sage-100' : 'text-ink-soft hover:bg-white/45 hover:text-sage-900 dark:text-night-soft dark:hover:bg-night-raise')}><Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-gold-600 dark:text-gold-300' : 'text-sage-700/75 dark:text-sage-300/75')} />{label}</NavLink></li>)}</ul></nav>
          <div className="ornament-rule mt-5"><span className="text-[9px]">✦</span></div>
          <p className="mt-4 text-center font-serif text-[11px] italic leading-relaxed text-ink-faint dark:text-night-faint">Учись постепенно — от ощущения звука к пониманию системы.</p>
        </div>
      </aside>

      <main className="relative min-w-0 flex-1 px-4 pb-24 pt-6 sm:px-6 lg:pb-12 lg:pt-8">{children}<footer className="mx-auto mt-16 max-w-4xl border-t border-gold-500/20 pt-6 text-center text-xs text-ink-faint dark:text-night-faint"><div className="ornament-rule mx-auto mb-4 max-w-[180px]"><span>✦</span></div><p className="mx-auto max-w-content">Материал предназначен для облегчения изучения таджвида и не заменяет обучение у квалифицированного преподавателя.</p></footer></main>
    </div>

    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-gold-500/20 bg-[#f8f3e9]/95 shadow-[0_-5px_25px_rgba(83,67,42,.05)] backdrop-blur-md dark:bg-night-bg/95 lg:hidden" aria-label="Быстрая навигация"><ul className="mx-auto flex max-w-md items-stretch justify-around">{mobileNavItems.map(({to,label,icon:Icon}) => <li key={to} className="flex-1"><NavLink to={to} end={to === '/'} className={({isActive}) => cn('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-sage-800 dark:text-sage-200' : 'text-ink-faint dark:text-night-faint')}><Icon className="h-5 w-5" />{label}</NavLink></li>)}</ul></nav>
  </div>;
}
