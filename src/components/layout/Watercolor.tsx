/**
 * Декоративный акварельный слой: полупрозрачные пятна, ветви и силуэты
 * исламской архитектуры. Чистый SVG/CSS — без сторонних изображений.
 */
export function WatercolorBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
      <div
        className="watercolor-blot"
        style={{ top: '-6rem', left: '-8rem', width: '26rem', height: '20rem', background: '#cddcc3' }}
      />
      <div
        className="watercolor-blot"
        style={{ top: '20%', right: '-10rem', width: '24rem', height: '22rem', background: '#ecdfc4' }}
      />
      <div
        className="watercolor-blot"
        style={{ bottom: '-8rem', left: '30%', width: '28rem', height: '18rem', background: '#eed4cf', opacity: 0.35 }}
      />
      {/* Ветвь с листьями */}
      <svg
        className="absolute -right-6 top-24 hidden w-56 text-sage-300 opacity-40 dark:text-sage-700 dark:opacity-20 lg:block"
        viewBox="0 0 200 260"
        fill="none"
      >
        <path d="M180 10 C150 80 120 150 60 250" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        {[
          [160, 45, -35], [140, 85, 25], [120, 120, -40], [100, 155, 20], [82, 190, -35], [70, 220, 25],
        ].map(([x, y, r], i) => (
          <ellipse
            key={i}
            cx={x}
            cy={y}
            rx="26"
            ry="10"
            fill="currentColor"
            opacity="0.55"
            transform={`rotate(${r} ${x} ${y})`}
          />
        ))}
      </svg>
      {/* Силуэт купола и минаретов */}
      <svg
        className="absolute bottom-0 left-4 hidden w-72 text-sand-300 opacity-30 dark:text-sand-500 dark:opacity-10 xl:block"
        viewBox="0 0 300 140"
        fill="currentColor"
      >
        <path d="M150 15 C120 45 105 65 105 90 L105 140 L195 140 L195 90 C195 65 180 45 150 15 Z" />
        <rect x="45" y="60" width="14" height="80" rx="4" />
        <path d="M52 40 L45 62 L59 62 Z" />
        <rect x="241" y="60" width="14" height="80" rx="4" />
        <path d="M248 40 L241 62 L255 62 Z" />
        <circle cx="150" cy="10" r="3" />
      </svg>
      {/* Фонарь */}
      <svg
        className="absolute right-10 bottom-16 hidden w-16 text-gold-400 opacity-30 dark:opacity-15 lg:block"
        viewBox="0 0 60 120"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <line x1="30" y1="0" x2="30" y2="18" />
        <path d="M18 30 L42 30 L48 80 C48 92 40 100 30 100 C20 100 12 92 12 80 Z" />
        <path d="M22 22 L38 22 L42 30 L18 30 Z" />
        <ellipse cx="30" cy="62" rx="8" ry="14" fill="currentColor" opacity="0.35" stroke="none" />
        <line x1="30" y1="100" x2="30" y2="110" />
      </svg>
    </div>
  );
}
