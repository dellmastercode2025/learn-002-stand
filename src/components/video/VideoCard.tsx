import { useState } from 'react';
import { ExternalLink, Play, VideoOff } from 'lucide-react';
import type { VideoResource } from '@/types';

const langLabel: Record<string, string> = { ru: 'RU', ar: 'AR', en: 'EN' };

/**
 * Карточка видео с «фасадом»: сначала только миниатюра,
 * iframe загружается лишь после нажатия. Всегда есть кнопка
 * «Открыть на YouTube».
 */
export function VideoCard({ video }: { video: VideoResource }) {
  const [playing, setPlaying] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [embedFailed, setEmbedFailed] = useState(false);

  if (video.status !== 'verified' || !video.youtubeVideoId || !video.youtubeUrl) {
    return null;
  }

  const thumbnail = `https://i.ytimg.com/vi/${video.youtubeVideoId}/hqdefault.jpg`;

  return (
    <div className="card overflow-hidden">
      <div className="relative aspect-video bg-sage-900/90">
        {playing && !embedFailed ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${video.youtubeVideoId}?autoplay=1&rel=0`}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 h-full w-full"
            onError={() => setEmbedFailed(true)}
          />
        ) : embedFailed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-cream-100">
            <VideoOff className="h-8 w-8" aria-hidden="true" />
            <p className="text-sm">Видео временно недоступно.</p>
            <a href={video.youtubeUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary !px-3 !py-1.5 text-xs">
              Попробовать на YouTube
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        ) : (
          <button
            type="button"
            className="group absolute inset-0 h-full w-full"
            onClick={() => setPlaying(true)}
            aria-label={`Смотреть: ${video.title}`}
          >
            {!thumbFailed ? (
              <img
                src={thumbnail}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
                onError={() => setThumbFailed(true)}
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-sage-700 to-emeraldsoft-800" />
            )}
            <span className="absolute inset-0 grid place-items-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-cream-50/90 text-sage-800 shadow-lift transition-transform group-hover:scale-110">
                <Play className="ml-1 h-6 w-6" fill="currentColor" aria-hidden="true" />
              </span>
            </span>
          </button>
        )}
      </div>
      <div className="p-4">
        <p className="mb-1 text-sm font-semibold leading-snug">{video.title}</p>
        <p className="mb-2 text-xs text-ink-soft dark:text-night-soft">
          {video.teacher}
          {video.channelNote ? ` · ${video.channelNote}` : ''}
        </p>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="badge-sage">Язык: {langLabel[video.language]}</span>
          {video.language !== 'ru' && video.russianSubtitles && (
            <span className="badge-gold">русские субтитры</span>
          )}
          {video.language !== 'ru' && !video.russianSubtitles && (
            <span className="badge-rose">видео не на русском</span>
          )}
        </div>
        <p className="mb-3 text-xs leading-relaxed text-ink-soft dark:text-night-soft">{video.description}</p>
        <div className="flex flex-wrap gap-2">
          {!playing && (
            <button type="button" className="btn-primary !px-3 !py-1.5 text-xs" onClick={() => setPlaying(true)}>
              <Play className="h-3.5 w-3.5" />
              Смотреть объяснение
            </button>
          )}
          <a
            href={video.youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary !px-3 !py-1.5 text-xs"
          >
            Открыть на YouTube
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}

/** Секция «Послушай, как это звучит» для набора видео */
export function VideoSection({ videos, title }: { videos: VideoResource[]; title?: string }) {
  const verified = videos.filter((v) => v.status === 'verified');
  if (verified.length === 0) {
    return (
      <div className="rounded-soft border border-dashed border-cream-300 p-4 text-sm text-ink-soft dark:border-night-line dark:text-night-soft">
        Проверенное видео по этой теме пока не подобрано — пользуйся текстовым объяснением выше.
        Ссылки добавляются только после проверки.
      </div>
    );
  }
  return (
    <section>
      <h3 className="mb-3 font-serif text-xl font-semibold">{title ?? 'Послушай, как это звучит'}</h3>
      <div className="grid gap-4 md:grid-cols-2">
        {verified.map((v) => (
          <VideoCard key={v.id} video={v} />
        ))}
      </div>
    </section>
  );
}
