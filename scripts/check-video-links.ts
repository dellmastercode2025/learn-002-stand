/**
 * Проверка базы видеоссылок: npm run check-videos
 *
 * Скрипт проверяет СТРУКТУРУ данных: корректность URL, совпадение videoId
 * с URL, дубликаты, обязательные поля у verified-записей. Существование
 * удалённого ролика он НЕ гарантирует (для этого нужен сетевой запрос —
 * см. флаг --network, использующий YouTube oEmbed).
 */
import { videos } from '../src/data/videos';

const YT_URL_RE = /^https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})$/;

let errors = 0;
let warnings = 0;

function err(msg: string) {
  errors += 1;
  console.error(`  ✗ ${msg}`);
}

function warn(msg: string) {
  warnings += 1;
  console.warn(`  ! ${msg}`);
}

console.log(`Проверка ${videos.length} записей видео…\n`);

const seenIds = new Set<string>();
const seenVideoIds = new Set<string>();

for (const v of videos) {
  console.log(`— ${v.id} (${v.status})`);
  if (seenIds.has(v.id)) err(`дубликат id записи: ${v.id}`);
  seenIds.add(v.id);

  if (v.status === 'verified') {
    if (!v.youtubeUrl) err('verified-запись без youtubeUrl');
    if (!v.youtubeVideoId) err('verified-запись без youtubeVideoId');
    if (!v.verifiedDate) err('verified-запись без verifiedDate');
    if (!v.verificationMethod) warn('не указан метод проверки');
    if (v.youtubeUrl) {
      const m = v.youtubeUrl.match(YT_URL_RE);
      if (!m) err(`некорректный URL: ${v.youtubeUrl}`);
      else if (v.youtubeVideoId && m[1] !== v.youtubeVideoId) {
        err(`videoId (${v.youtubeVideoId}) не совпадает с URL (${m[1]})`);
      }
    }
    if (v.youtubeVideoId) {
      if (seenVideoIds.has(v.youtubeVideoId)) warn(`дубликат videoId: ${v.youtubeVideoId}`);
      seenVideoIds.add(v.youtubeVideoId);
      if (!/^[A-Za-z0-9_-]{11}$/.test(v.youtubeVideoId)) err(`videoId неверного формата: ${v.youtubeVideoId}`);
    }
  } else {
    if (v.youtubeUrl || v.youtubeVideoId) {
      err('запись needs-verification не должна содержать URL/videoId (она не показывается в UI)');
    }
  }
}

async function networkCheck() {
  console.log('\nСетевая проверка через YouTube oEmbed…');
  for (const v of videos) {
    if (v.status !== 'verified' || !v.youtubeUrl) continue;
    try {
      const res = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(v.youtubeUrl)}&format=json`,
      );
      if (!res.ok) {
        err(`${v.id}: oEmbed вернул ${res.status} — ролик мог быть удалён`);
        continue;
      }
      const data = (await res.json()) as { title?: string; author_name?: string };
      console.log(`  ✓ ${v.id}: «${data.title}» (${data.author_name})`);
    } catch (e) {
      warn(`${v.id}: сетевая ошибка (${(e as Error).message}) — проверь вручную`);
    }
  }
}

const wantNetwork = process.argv.includes('--network');

(async () => {
  if (wantNetwork) await networkCheck();
  console.log(`\nИтог: ошибок — ${errors}, предупреждений — ${warnings}`);
  if (!wantNetwork) {
    console.log('Подсказка: `npm run check-videos -- --network` дополнительно проверит существование роликов.');
  }
  process.exit(errors > 0 ? 1 : 0);
})();
