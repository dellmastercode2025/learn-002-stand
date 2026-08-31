/** Обёртка над localStorage с защитой от приватных режимов и битых данных */

const PREFIX = 'sifat-course/';

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as T) };
  } catch {
    return fallback;
  }
}

export function saveJSON<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // приватный режим / переполнение — молча пропускаем
  }
}

/** Ключ настроек читается и инлайн-скриптом в index.html — не переименовывать */
export const SETTINGS_KEY = 'settings';
export const PROGRESS_KEY = 'progress';
export const FAVORITES_KEY = 'favorites';
