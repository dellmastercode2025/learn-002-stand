/** Работа с арабским текстом: разбиение на базовые буквы + огласовки */

// Харакаты, танвин, шадда, сукун, надстрочный алиф, коранические знаки, татвиль
const DIACRITIC_RE = /[\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06ED\u0640]/u;

export interface ArabicToken {
  /** Базовая буква с её огласовками (или пробел) */
  text: string;
  /** Порядковый номер базовой буквы (null для пробелов) */
  baseIndex: number | null;
}

/**
 * Разбивает арабскую строку на токены «базовая буква + её огласовки».
 * baseIndex нумерует только базовые буквы — соответствует
 * QuranExample.highlights[].baseIndex.
 */
export function tokenizeArabic(str: string): ArabicToken[] {
  const tokens: ArabicToken[] = [];
  let baseCount = 0;
  for (const ch of str) {
    if (ch === ' ') {
      tokens.push({ text: ch, baseIndex: null });
    } else if (
      DIACRITIC_RE.test(ch) &&
      tokens.length > 0 &&
      tokens[tokens.length - 1].baseIndex !== null
    ) {
      tokens[tokens.length - 1].text += ch;
    } else {
      tokens.push({ text: ch, baseIndex: baseCount });
      baseCount += 1;
    }
  }
  return tokens;
}
