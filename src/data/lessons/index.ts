import type { Lesson } from '@/types';
import { lesson01 } from './lesson01';
import { lesson02 } from './lesson02';
import { lesson03 } from './lesson03';
import { lesson04 } from './lesson04';
import { lesson05 } from './lesson05';
import { lesson06 } from './lesson06';
import { lesson07 } from './lesson07';
import { lesson08 } from './lesson08';
import { lesson09 } from './lesson09';
import { lesson10 } from './lesson10';
import { lesson11 } from './lesson11';
import { lesson12 } from './lesson12';

export const lessons: Lesson[] = [
  lesson01,
  lesson02,
  lesson03,
  lesson04,
  lesson05,
  lesson06,
  lesson07,
  lesson08,
  lesson09,
  lesson10,
  lesson11,
  lesson12,
];

export const lessonBySlug: Record<string, Lesson> = Object.fromEntries(
  lessons.map((l) => [l.slug, l]),
);

export function getNextLesson(slug: string): Lesson | null {
  const idx = lessons.findIndex((l) => l.slug === slug);
  return idx >= 0 && idx < lessons.length - 1 ? lessons[idx + 1] : null;
}

export function getPrevLesson(slug: string): Lesson | null {
  const idx = lessons.findIndex((l) => l.slug === slug);
  return idx > 0 ? lessons[idx - 1] : null;
}
