/** Поиск по справочнику: сыфаты, буквы, термины */
import { sifatList } from '@/data/sifat';
import { letters } from '@/data/letters';

export interface SearchResult {
  type: 'sifat' | 'letter';
  title: string;
  arabic: string;
  subtitle: string;
  href: string;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[ё]/g, 'е').replace(/[‘’ʻ'ʼ`]/g, '').trim();
}

/** Убирает огласовки для сравнения арабского текста */
function stripDiacritics(s: string): string {
  return s.replace(/[\u064B-\u065F\u0670\u0640]/gu, '');
}

export function searchAll(query: string): SearchResult[] {
  const q = norm(query);
  const qAr = stripDiacritics(query.trim());
  if (q.length === 0) return [];
  const results: SearchResult[] = [];

  for (const s of sifatList) {
    const haystack = [s.russianName, s.translit, s.meaning, s.shortDefinition].map(norm);
    const arMatch = qAr.length > 0 && stripDiacritics(s.arabicName).includes(qAr);
    if (arMatch || haystack.some((h) => h.includes(q))) {
      results.push({
        type: 'sifat',
        title: s.russianName,
        arabic: s.arabicName,
        subtitle: s.meaning,
        href: `/sifat/${s.id}`,
      });
    }
  }

  for (const l of letters) {
    const haystack = [l.name, l.translit, l.arabicLetterName].map(norm);
    const arMatch =
      qAr.length > 0 &&
      (l.arabic === qAr || stripDiacritics(l.arabicLetterName).includes(qAr));
    if (arMatch || haystack.some((h) => h.includes(q))) {
      results.push({
        type: 'letter',
        title: `Буква ${l.name}`,
        arabic: l.arabic,
        subtitle: l.makhraj,
        href: `/letters/${l.id}`,
      });
    }
  }

  return results.slice(0, 12);
}
