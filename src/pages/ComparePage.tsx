import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeftRight } from 'lucide-react';
import { alphabetOrder, letterWithSifatById, makhrajZones } from '@/data/letters';
import { oppositionGroups, sifatById, unopposedSifat } from '@/data/sifat';
import { usePageMeta } from '@/lib/use-page-meta';
import { MouthDiagram } from '@/components/diagrams/MouthDiagram';
import type { LetterId } from '@/types';
import { cn } from '@/lib/utils';

const popularPairs: [LetterId, LetterId][] = [
  ['ta', 'tta'],
  ['sin', 'sad'],
  ['kaf', 'qaf'],
  ['dhal', 'zha'],
  ['sin', 'zay'],
  ['hha', 'ha'],
  ['dal', 'dad'],
  ['tha', 'sin'],
];

function isLetterId(v: string | null): v is LetterId {
  return !!v && v in letterWithSifatById;
}

function LetterSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: LetterId;
  onChange: (v: LetterId) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as LetterId)}
        className="rounded-soft border border-cream-300 bg-white px-3 py-2 text-base dark:border-night-line dark:bg-night-card"
      >
        {alphabetOrder.map((id) => (
          <option key={id} value={id}>
            {letterWithSifatById[id].arabic} — {letterWithSifatById[id].name}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function ComparePage() {
  usePageMeta(
    'Сравнение букв: общее и различия | Таджвид',
    'Выбери две арабские буквы — увидишь общее и различия по махраджу, сыфатам и положению языка.',
  );
  const [params, setParams] = useSearchParams();
  const a: LetterId = isLetterId(params.get('a')) ? (params.get('a') as LetterId) : 'ta';
  const b: LetterId = isLetterId(params.get('b')) ? (params.get('b') as LetterId) : 'tta';

  const la = letterWithSifatById[a];
  const lb = letterWithSifatById[b];

  function setPair(na: LetterId, nb: LetterId) {
    setParams({ a: na, b: nb }, { replace: true });
  }

  const rows = useMemo(() => {
    const groupRows = oppositionGroups.map((g) => {
      const sa = g.sifatIds.find((s) => la.sifatIds.includes(s));
      const sb = g.sifatIds.find((s) => lb.sifatIds.includes(s));
      return {
        label: g.title,
        left: sa ? sifatById[sa].russianName : '—',
        right: sb ? sifatById[sb].russianName : '—',
        leftId: sa,
        rightId: sb,
        same: sa === sb,
      };
    });
    const specialA = unopposedSifat.filter((s) => la.sifatIds.includes(s.id));
    const specialB = unopposedSifat.filter((s) => lb.sifatIds.includes(s.id));
    return {
      groupRows,
      special: {
        label: 'Особые приметы',
        left: specialA.length ? specialA.map((s) => s.russianName).join(', ') : '—',
        right: specialB.length ? specialB.map((s) => s.russianName).join(', ') : '—',
        same:
          specialA.map((s) => s.id).join() === specialB.map((s) => s.id).join(),
      },
      makhraj: {
        label: 'Махрадж',
        left: la.makhraj,
        right: lb.makhraj,
        same: la.makhraj === lb.makhraj,
      },
    };
  }, [la, lb]);

  const commonSifat = la.sifatIds.filter((s) => lb.sifatIds.includes(s));
  const onlyA = la.sifatIds.filter((s) => !lb.sifatIds.includes(s));
  const onlyB = lb.sifatIds.filter((s) => !la.sifatIds.includes(s));

  const poseOf = (l: typeof la) =>
    l.sifatIds.includes('itbaq') ? 'itbaq' : l.sifatIds.includes('istila') ? 'raised' : 'rest';

  return (
    <div>
      <h1 className="mb-2 font-serif text-3xl font-bold">Сравни буквы</h1>
      <p className="mb-6 max-w-lg text-sm text-ink-soft dark:text-night-soft">
        Пары-«двойники» различаются одним-двумя свойствами. Найди их — и ухо начнёт слышать разницу.
      </p>

      {/* Быстрые пары */}
      <div className="mb-4 flex flex-wrap gap-2">
        {popularPairs.map(([pa, pb]) => (
          <button
            key={`${pa}-${pb}`}
            type="button"
            onClick={() => setPair(pa, pb)}
            aria-pressed={a === pa && b === pb}
            className={cn(
              'arabic rounded-soft border px-3 py-1.5 text-xl transition-colors',
              a === pa && b === pb
                ? 'border-sage-600 bg-sage-100 dark:border-sage-400 dark:bg-sage-900/50'
                : 'border-cream-300 bg-white hover:border-sage-400 dark:border-night-line dark:bg-night-card',
            )}
          >
            {letterWithSifatById[pa].arabic} / {letterWithSifatById[pb].arabic}
          </button>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <LetterSelect label="Первая буква" value={a} onChange={(v) => setPair(v, b)} />
        <button
          type="button"
          className="btn-secondary !p-2.5"
          aria-label="Поменять буквы местами"
          onClick={() => setPair(b, a)}
        >
          <ArrowLeftRight className="h-4 w-4" />
        </button>
        <LetterSelect label="Вторая буква" value={b} onChange={(v) => setPair(a, v)} />
      </div>

      {/* Схемы */}
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        {[la, lb].map((l) => (
          <div key={l.id} className="card p-4 text-center">
            <p className="arabic mb-1 text-4xl text-sage-800 dark:text-sage-200">{l.arabic}</p>
            <p className="mb-2 font-semibold">{l.name}</p>
            <MouthDiagram
              tongue={poseOf(l)}
              point={l.diagramPoint ?? null}
              title={`Артикуляция ${l.name}`}
              className="mx-auto w-full max-w-xs"
            />
            <p className="mt-1 text-xs text-ink-soft dark:text-night-soft">
              {makhrajZones[l.makhrajZone].title}
            </p>
          </div>
        ))}
      </div>

      {/* Общее и различия */}
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-2 font-serif text-lg font-semibold text-sage-700 dark:text-sage-300">Общее</h2>
          {commonSifat.length === 0 ? (
            <p className="text-sm text-ink-soft dark:text-night-soft">Общих сыфатов нет.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {commonSifat.map((s) => (
                <Link key={s} to={`/sifat/${s}`} className="badge-sage hover:underline">
                  {sifatById[s].russianName}
                </Link>
              ))}
            </div>
          )}
          {rows.makhraj.same && (
            <p className="mt-3 rounded-soft bg-sage-50 p-3 text-sm dark:bg-night-raise">
              Махрадж один и тот же: {la.makhraj}
            </p>
          )}
        </section>
        <section className="card border-2 border-gold-300 p-5 dark:border-gold-500/50">
          <h2 className="mb-2 font-serif text-lg font-semibold text-gold-600 dark:text-gold-300">
            Различия — слушай именно их
          </h2>
          <div className="space-y-2 text-sm">
            <p>
              <span className="arabic text-lg">{la.arabic}</span> —{' '}
              {onlyA.length ? (
                onlyA.map((s, i) => (
                  <span key={s}>
                    {i > 0 && ', '}
                    <Link to={`/sifat/${s}`} className="font-semibold text-gold-600 underline decoration-dotted dark:text-gold-300">
                      {sifatById[s].russianName}
                    </Link>
                  </span>
                ))
              ) : (
                <span className="text-ink-soft dark:text-night-soft">без уникальных сыфатов</span>
              )}
            </p>
            <p>
              <span className="arabic text-lg">{lb.arabic}</span> —{' '}
              {onlyB.length ? (
                onlyB.map((s, i) => (
                  <span key={s}>
                    {i > 0 && ', '}
                    <Link to={`/sifat/${s}`} className="font-semibold text-gold-600 underline decoration-dotted dark:text-gold-300">
                      {sifatById[s].russianName}
                    </Link>
                  </span>
                ))
              ) : (
                <span className="text-ink-soft dark:text-night-soft">без уникальных сыфатов</span>
              )}
            </p>
            {!rows.makhraj.same && (
              <p className="rounded-soft bg-sand-100/70 p-3 dark:bg-night-raise">
                Махраджи разные: у {la.name} — {la.makhraj.toLowerCase()} У {lb.name} —{' '}
                {lb.makhraj.toLowerCase()}
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Таблица по группам */}
      <div className="scroll-x card p-1">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-cream-300 text-left dark:border-night-line">
              <th className="py-2.5 pl-4 pr-3 font-semibold">Свойство</th>
              <th className="py-2.5 pr-3 font-semibold">
                <span className="arabic text-lg">{la.arabic}</span> {la.name}
              </th>
              <th className="py-2.5 pr-4 font-semibold">
                <span className="arabic text-lg">{lb.arabic}</span> {lb.name}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className={cn(!rows.makhraj.same && 'bg-gold-300/15 dark:bg-gold-500/10')}>
              <th className="py-2.5 pl-4 pr-3 text-left align-top text-xs font-semibold uppercase tracking-wide text-ink-faint dark:text-night-faint">
                Махрадж
              </th>
              <td className="py-2.5 pr-3 align-top">{rows.makhraj.left}</td>
              <td className="py-2.5 pr-4 align-top">{rows.makhraj.right}</td>
            </tr>
            {rows.groupRows.map((r) => (
              <tr
                key={r.label}
                className={cn(
                  'border-t border-cream-200 dark:border-night-line',
                  !r.same && 'bg-gold-300/15 font-semibold dark:bg-gold-500/10',
                )}
              >
                <th className="py-2.5 pl-4 pr-3 text-left align-top text-xs font-semibold uppercase tracking-wide text-ink-faint dark:text-night-faint">
                  {r.label}
                </th>
                <td className="py-2.5 pr-3">{r.left}</td>
                <td className="py-2.5 pr-4">{r.right}</td>
              </tr>
            ))}
            <tr
              className={cn(
                'border-t border-cream-200 dark:border-night-line',
                !rows.special.same && 'bg-gold-300/15 font-semibold dark:bg-gold-500/10',
              )}
            >
              <th className="py-2.5 pl-4 pr-3 text-left align-top text-xs font-semibold uppercase tracking-wide text-ink-faint dark:text-night-faint">
                {rows.special.label}
              </th>
              <td className="py-2.5 pr-3">{rows.special.left}</td>
              <td className="py-2.5 pr-4">{rows.special.right}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-faint dark:text-night-faint">
        Золотым подсвечены строки, в которых буквы различаются.
      </p>
    </div>
  );
}
