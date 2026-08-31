import { motion, useReducedMotion } from 'framer-motion';

export type TonguePose = 'rest' | 'raised' | 'itbaq';
export type Airflow = 'none' | 'free' | 'blocked';

interface MouthDiagramProps {
  tongue?: TonguePose;
  airflow?: Airflow;
  /** Точка махраджа для подсветки */
  point?: { x: number; y: number } | null;
  /** Подсветить зазор/контакт языка с нёбом */
  showGap?: boolean;
  className?: string;
  title?: string;
}

const tonguePaths: Record<TonguePose, string> = {
  // Язык в покое: лежит внизу
  rest: 'M72 128 C95 120 130 128 158 128 C180 128 194 138 196 158 C186 168 150 162 120 158 C98 155 80 148 74 140 Z',
  // Исти‘ля: задняя часть поднята к нёбу
  raised: 'M74 126 C95 120 125 118 150 104 C168 94 184 96 192 108 C196 130 190 150 194 160 C182 168 148 160 118 156 C96 152 80 146 74 138 Z',
  // Итбак: средне-задняя часть «накрывает» нёбо
  itbaq: 'M70 118 C92 100 120 92 150 88 C172 86 188 94 194 108 C198 130 190 150 194 160 C182 168 148 160 118 156 C96 152 78 144 70 132 Z',
};

/**
 * Упрощённая учебная схема ротовой полости (вид сбоку, лицо влево).
 * Педагогическая схема, не претендующая на медицинскую точность.
 */
export function MouthDiagram({
  tongue = 'rest',
  airflow = 'none',
  point = null,
  showGap = false,
  className,
  title = 'Схема ротовой полости',
}: MouthDiagramProps) {
  const reduced = useReducedMotion();

  return (
    <svg
      viewBox="0 0 320 260"
      role="img"
      aria-label={title}
      className={className ?? 'w-full max-w-md'}
    >
      {/* Контур: верхняя челюсть, нёбо, глотка */}
      <path
        d="M30 96 L58 96 C66 92 72 88 78 86 C104 76 140 72 158 76 C180 80 192 86 196 96 C200 104 202 110 200 116 L202 118 C206 130 214 160 220 190 L226 232"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        className="text-sage-700 dark:text-sage-300"
      />
      {/* Маленький «язычок» (увула) */}
      <path
        d="M198 108 C196 116 192 120 188 122"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="text-sage-600 dark:text-sage-400"
      />
      {/* Нижняя челюсть и передняя стенка горла */}
      <path
        d="M30 140 L56 140 C68 146 84 152 100 156 C130 164 160 166 180 172 C196 178 202 196 204 214 L206 232"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        className="text-sage-700 dark:text-sage-300"
      />
      {/* Губы */}
      <ellipse cx="32" cy="96" rx="5" ry="7" className="fill-rose-300 dark:fill-rose-400" />
      <ellipse cx="32" cy="140" rx="5" ry="7" className="fill-rose-300 dark:fill-rose-400" />
      {/* Зубы */}
      <rect x="54" y="94" width="9" height="16" rx="2" className="fill-cream-100 stroke-sand-400" strokeWidth="1.5" />
      <rect x="52" y="128" width="9" height="14" rx="2" className="fill-cream-100 stroke-sand-400" strokeWidth="1.5" />

      {/* Язык */}
      <motion.path
        d={tonguePaths[tongue]}
        className="fill-rose-200 stroke-rose-400 dark:fill-rose-300/40 dark:stroke-rose-300"
        strokeWidth="2"
        initial={false}
        animate={{ d: tonguePaths[tongue] }}
        transition={reduced ? { duration: 0 } : { duration: 0.6, ease: 'easeInOut' }}
      />

      {/* Зазор или контакт языка с нёбом */}
      {showGap && tongue !== 'itbaq' && (
        <g aria-hidden="true">
          <path
            d="M100 84 C126 76 148 74 162 78"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            className="text-gold-500"
          />
          <path
            d="M100 116 C126 112 148 112 160 116"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            className="text-gold-500"
          />
          <text x="118" y="103" fontSize="10" className="fill-gold-600 dark:fill-gold-300 font-sans">
            пространство
          </text>
        </g>
      )}
      {showGap && tongue === 'itbaq' && (
        <text x="104" y="80" fontSize="10" className="fill-gold-600 dark:fill-gold-300 font-sans" aria-hidden="true">
          язык прижат к нёбу
        </text>
      )}

      {/* Поток воздуха */}
      {airflow === 'free' && (
        <g aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <motion.circle
              key={i}
              r="4"
              className="fill-emeraldsoft-400/70"
              initial={{ cx: 195, cy: 120, opacity: 0 }}
              animate={
                reduced
                  ? { cx: 60, cy: 118, opacity: 0.7 }
                  : { cx: [195, 140, 90, 10], cy: [120, 118, 116, 114], opacity: [0, 0.8, 0.8, 0] }
              }
              transition={
                reduced
                  ? { duration: 0 }
                  : { duration: 1.6, repeat: Infinity, delay: i * 0.5, ease: 'linear' }
              }
            />
          ))}
          <path
            d="M200 120 C150 118 90 116 20 114"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="2 6"
            className="text-emeraldsoft-400/60"
          />
        </g>
      )}
      {airflow === 'blocked' && (
        <g aria-hidden="true">
          <motion.circle
            r="4"
            className="fill-emeraldsoft-400/70"
            initial={{ cx: 210, cy: 150, opacity: 0 }}
            animate={
              reduced
                ? { cx: 195, cy: 130, opacity: 0.7 }
                : { cx: [212, 200, 195], cy: [160, 140, 128], opacity: [0, 0.8, 0] }
            }
            transition={reduced ? { duration: 0 } : { duration: 1.2, repeat: Infinity, ease: 'easeOut' }}
          />
          <line
            x1="188"
            y1="102"
            x2="188"
            y2="134"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            className="text-rose-400"
          />
          <text x="196" y="150" fontSize="10" className="fill-rose-400 font-sans">
            воздух заперт
          </text>
        </g>
      )}

      {/* Точка махраджа */}
      {point && (
        <g>
          {!reduced && (
            <motion.circle
              cx={point.x}
              cy={point.y}
              className="fill-gold-400/40"
              initial={{ r: 6 }}
              animate={{ r: [6, 14, 6], opacity: [0.6, 0.15, 0.6] }}
              transition={{ duration: 1.8, repeat: Infinity }}
            />
          )}
          <circle cx={point.x} cy={point.y} r="6" className="fill-gold-500 stroke-white dark:stroke-night-bg" strokeWidth="2" />
        </g>
      )}

      {/* Подписи зон */}
      <text x="8" y="86" fontSize="10" className="fill-ink-faint dark:fill-night-faint font-sans">губы</text>
      <text x="120" y="62" fontSize="10" className="fill-ink-faint dark:fill-night-faint font-sans">нёбо</text>
      <text x="232" y="190" fontSize="10" className="fill-ink-faint dark:fill-night-faint font-sans">горло</text>
      <text x="120" y="185" fontSize="10" className="fill-ink-faint dark:fill-night-faint font-sans">язык</text>
    </svg>
  );
}
