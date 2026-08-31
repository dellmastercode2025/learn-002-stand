import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { searchAll } from '@/lib/search';

export function SearchBox() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const results = useMemo(() => searchAll(query), [query]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function go(href: string) {
    setOpen(false);
    setQuery('');
    navigate(href);
  }

  return (
    <div ref={boxRef} className="relative w-full max-w-xs">
      <label className="sr-only" htmlFor="site-search">
        Поиск: хамс, همس или س
      </label>
      <div className="flex items-center gap-2 rounded-soft border border-cream-300 bg-white px-3 py-1.5 dark:border-night-line dark:bg-night-card">
        <Search className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />
        <input
          id="site-search"
          type="search"
          value={query}
          placeholder="хамс, همس или س…"
          className="w-full bg-transparent text-sm outline-none placeholder:text-ink-faint dark:placeholder:text-night-faint"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        {query && (
          <button
            type="button"
            aria-label="Очистить поиск"
            onClick={() => setQuery('')}
            className="text-ink-faint hover:text-ink dark:hover:text-night-text"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {open && query.trim().length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-96 overflow-y-auto rounded-card border border-cream-200 bg-white p-2 shadow-lift dark:border-night-line dark:bg-night-card">
          {results.length === 0 ? (
            <p className="px-3 py-4 text-sm text-ink-soft dark:text-night-soft">
              Ничего не нашлось. Попробуй «хамс», «калькаля» или букву ص.
            </p>
          ) : (
            <ul>
              {results.map((r) => (
                <li key={r.href}>
                  <button
                    type="button"
                    onClick={() => go(r.href)}
                    className="flex w-full items-center gap-3 rounded-soft px-3 py-2 text-left hover:bg-cream-100 dark:hover:bg-night-raise"
                  >
                    <span className="arabic w-10 shrink-0 text-center text-xl text-sage-700 dark:text-sage-300">
                      {r.arabic}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{r.title}</span>
                      <span className="block truncate text-xs text-ink-soft dark:text-night-soft">
                        {r.subtitle}
                      </span>
                    </span>
                    <span className="badge-sage ml-auto shrink-0">
                      {r.type === 'sifat' ? 'сыфат' : 'буква'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
