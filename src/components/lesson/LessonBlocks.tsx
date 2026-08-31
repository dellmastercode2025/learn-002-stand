import { AlertTriangle, CheckCircle2, Hand, Lightbulb, ListChecks, Quote } from 'lucide-react';
import type { DiagramKind, LessonBlock } from '@/types';
import { sifatById } from '@/data/sifat';
import { videosForTopic } from '@/data/videos';
import { quranExampleById } from '@/data/quran-examples';
import { AirflowHamsJahr } from '@/components/diagrams/AirflowHamsJahr';
import { FlowScale } from '@/components/diagrams/FlowScale';
import { TongueElevation } from '@/components/diagrams/TongueElevation';
import { ItbaqInfitah } from '@/components/diagrams/ItbaqInfitah';
import { SifatTree } from '@/components/diagrams/SifatTree';
import { SoundBirth } from '@/components/diagrams/SoundBirth';
import { MouthDiagram } from '@/components/diagrams/MouthDiagram';
import { VideoSection } from '@/components/video/VideoCard';
import { LetterChips } from './LetterChips';
import { SifatCard } from './SifatCard';
import { QuranExampleCard } from './QuranExampleCard';

function Diagram({ kind }: { kind: DiagramKind }) {
  switch (kind) {
    case 'airflow-hams-jahr':
      return <AirflowHamsJahr />;
    case 'flow-scale':
      return <FlowScale />;
    case 'tongue-elevation':
      return <TongueElevation />;
    case 'itbaq-infitah':
      return <ItbaqInfitah />;
    case 'sifat-tree':
      return <SifatTree />;
    case 'sound-birth':
      return <SoundBirth />;
    case 'mouth-side':
    case 'makhraj-map':
      return (
        <div className="card flex justify-center p-5">
          <MouthDiagram tongue="rest" />
        </div>
      );
  }
}

const calloutStyle = {
  info: 'border-sage-300 bg-sage-50 dark:border-sage-700 dark:bg-night-raise',
  warn: 'border-rose-300 bg-rose-100/50 dark:border-rose-400/50 dark:bg-night-raise',
  tip: 'border-gold-300 bg-sand-100/70 dark:border-gold-500/40 dark:bg-night-raise',
};

/** Рендерит структурированные блоки урока */
export function LessonBlocks({ blocks }: { blocks: LessonBlock[] }) {
  return (
    <div className="space-y-8">
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'goal':
            return (
              <section key={i} className="rounded-card border border-sage-200 bg-sage-50/70 p-5 dark:border-sage-800 dark:bg-night-raise">
                <h2 className="mb-3 flex items-center gap-2 font-serif text-xl font-semibold">
                  <ListChecks className="h-5 w-5 text-sage-600 dark:text-sage-300" aria-hidden="true" />
                  Что сегодня поймём
                </h2>
                <ul className="space-y-1.5">
                  {block.items.map((item, j) => (
                    <li key={j} className="flex gap-2 text-sm">
                      <span className="mt-0.5 text-sage-500" aria-hidden="true">◆</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            );

          case 'text':
            return (
              <section key={i} className="prose-lesson max-w-content">
                {block.title && <h2 className="mb-3 font-serif text-2xl font-semibold">{block.title}</h2>}
                {block.paragraphs.map((p, j) => (
                  <p key={j}>{p}</p>
                ))}
              </section>
            );

          case 'experiment':
            return (
              <section key={i} className="card p-5">
                <h2 className="mb-3 flex items-center gap-2 font-serif text-xl font-semibold">
                  <Hand className="h-5 w-5 text-gold-500" aria-hidden="true" />
                  {block.title}
                </h2>
                <ol className="mb-3 space-y-2">
                  {block.steps.map((s, j) => (
                    <li key={j} className="flex gap-3 text-sm leading-relaxed">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sage-100 text-xs font-bold text-sage-800 dark:bg-sage-900 dark:text-sage-200">
                        {j + 1}
                      </span>
                      {s}
                    </li>
                  ))}
                </ol>
                {block.conclusion && (
                  <p className="rounded-soft bg-sage-50 p-3 text-sm font-medium dark:bg-night-raise">
                    {block.conclusion}
                  </p>
                )}
              </section>
            );

          case 'term':
            return (
              <section key={i} className="card border-r-4 border-r-gold-400 p-6 text-center">
                <p className="arabic arabic-xl mb-1 text-sage-800 dark:text-sage-200" lang="ar">
                  {block.arabic}
                </p>
                <p className="mb-1 text-sm text-ink-soft dark:text-night-soft">{block.translit}</p>
                <p className="mb-1 font-serif text-2xl font-semibold">{block.russian}</p>
                <p className="mb-3 text-sm italic text-gold-600 dark:text-gold-300">{block.meaning}</p>
                <p className="mx-auto max-w-lg text-sm leading-relaxed">{block.definition}</p>
              </section>
            );

          case 'analogy':
            return (
              <section key={i} className="rounded-card bg-gradient-to-br from-sage-50 to-sand-100 p-6 dark:from-night-raise dark:to-night-card">
                <h2 className="mb-2 flex items-center gap-2 font-serif text-xl font-semibold">
                  <Quote className="h-5 w-5 text-sage-500" aria-hidden="true" />
                  {block.title}
                </h2>
                <p className="mb-2 leading-relaxed">{block.text}</p>
                {block.note && <p className="text-xs italic text-ink-soft dark:text-night-soft">{block.note}</p>}
              </section>
            );

          case 'letters': {
            const s = sifatById[block.sifatId];
            return (
              <section key={i}>
                <h2 className="mb-1 font-serif text-xl font-semibold">{block.title ?? `Буквы: ${s.russianName}`}</h2>
                {s.mnemonic && (
                  <p className="arabic arabic-lg mb-2 text-gold-600 dark:text-gold-300" dir="rtl" lang="ar">
                    {s.mnemonic}
                  </p>
                )}
                <div className="mb-2">
                  <LetterChips letterIds={s.letters} />
                </div>
                {block.note && <p className="max-w-content text-sm text-ink-soft dark:text-night-soft">{block.note}</p>}
              </section>
            );
          }

          case 'letterGrid':
            return (
              <section key={i}>
                {block.title && <h2 className="mb-3 font-serif text-xl font-semibold">{block.title}</h2>}
                <LetterChips letterIds={block.letterIds} big />
                {block.note && (
                  <p className="mt-2 max-w-content text-sm text-ink-soft dark:text-night-soft">{block.note}</p>
                )}
              </section>
            );

          case 'diagram':
            return (
              <section key={i}>
                <Diagram kind={block.diagram} />
                {block.caption && (
                  <p className="mt-2 text-center text-xs text-ink-faint dark:text-night-faint">{block.caption}</p>
                )}
              </section>
            );

          case 'video':
            return (
              <section key={i}>
                <VideoSection videos={videosForTopic(block.topic)} title={block.title} />
              </section>
            );

          case 'mistake':
            return (
              <section key={i} className="rounded-card border border-rose-300/60 bg-rose-100/40 p-5 dark:border-rose-400/40 dark:bg-night-raise">
                <h2 className="mb-2 flex items-center gap-2 font-serif text-xl font-semibold">
                  <AlertTriangle className="h-5 w-5 text-rose-400" aria-hidden="true" />
                  {block.title ?? 'Типичная ошибка'}
                </h2>
                <p className="max-w-content text-sm leading-relaxed">{block.text}</p>
              </section>
            );

          case 'tryit':
            return (
              <section key={i} className="card p-5">
                <h2 className="mb-3 flex items-center gap-2 font-serif text-xl font-semibold">
                  <Hand className="h-5 w-5 text-sage-600 dark:text-sage-300" aria-hidden="true" />
                  {block.title ?? 'Попробуй сам'}
                </h2>
                <ol className="space-y-2">
                  {block.steps.map((s, j) => (
                    <li key={j} className="flex gap-3 text-sm leading-relaxed">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gold-300/40 text-xs font-bold text-gold-600 dark:bg-gold-500/20 dark:text-gold-300">
                        {j + 1}
                      </span>
                      {s}
                    </li>
                  ))}
                </ol>
              </section>
            );

          case 'compareTable':
            return (
              <section key={i}>
                {block.title && <h2 className="mb-3 font-serif text-xl font-semibold">{block.title}</h2>}
                <div className="scroll-x card p-1">
                  <table className="w-full min-w-[480px] text-sm">
                    <tbody>
                      {block.rows.map((row, j) => (
                        <tr key={j} className={j > 0 ? 'border-t border-cream-200 dark:border-night-line' : ''}>
                          <th className="w-32 py-2.5 pl-4 pr-3 text-left align-top text-xs font-semibold uppercase tracking-wide text-ink-faint dark:text-night-faint">
                            {row.label}
                          </th>
                          <td className="py-2.5 pr-3 align-top">{row.left}</td>
                          <td className="py-2.5 pr-4 align-top">{row.right}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );

          case 'summary':
            return (
              <section key={i} className="rounded-card border border-sage-300 bg-sage-50 p-5 dark:border-sage-700 dark:bg-night-raise">
                <h2 className="mb-3 flex items-center gap-2 font-serif text-xl font-semibold">
                  <CheckCircle2 className="h-5 w-5 text-sage-600 dark:text-sage-300" aria-hidden="true" />
                  Что нужно запомнить
                </h2>
                <ul className="space-y-1.5">
                  {block.items.map((item, j) => (
                    <li key={j} className="flex gap-2 text-sm leading-relaxed">
                      <span className="mt-0.5 text-sage-500" aria-hidden="true">✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            );

          case 'sifatCards':
            return (
              <section key={i}>
                {block.title && <h2 className="mb-3 font-serif text-xl font-semibold">{block.title}</h2>}
                <div className="grid gap-4 md:grid-cols-2">
                  {block.sifatIds.map((s) => (
                    <SifatCard key={s} sifatId={s} />
                  ))}
                </div>
              </section>
            );

          case 'quranExamples':
            return (
              <section key={i}>
                {block.title && <h2 className="mb-3 font-serif text-xl font-semibold">{block.title}</h2>}
                <div className="grid gap-4 lg:grid-cols-2">
                  {block.exampleIds.map((id) => {
                    const ex = quranExampleById[id];
                    return ex ? <QuranExampleCard key={id} example={ex} /> : null;
                  })}
                </div>
              </section>
            );

          case 'callout':
            return (
              <section key={i} className={`rounded-card border p-5 ${calloutStyle[block.tone]}`}>
                <h2 className="mb-2 flex items-center gap-2 font-serif text-lg font-semibold">
                  <Lightbulb className="h-5 w-5 text-gold-500" aria-hidden="true" />
                  {block.title ?? 'Обрати внимание'}
                </h2>
                <p className="max-w-content text-sm leading-relaxed">{block.text}</p>
              </section>
            );
        }
      })}
    </div>
  );
}
