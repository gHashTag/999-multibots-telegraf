// ===============================
// Learn Atoms - Education Game State with Jotai
// ===============================

import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { STORAGE_KEYS } from '@vibee/atoms';

// ===============================
// Types
// ===============================

export type BeeLevel = 'larva' | 'worker' | 'guard' | 'forager' | 'queen';

export interface LearnProgress {
  level: number;
  honey: number;
  streak: number;
  lastActive: string; // ISO date string
  completedLessons: string[];
}

// ===============================
// Constants
// ===============================

const LEVEL_THRESHOLDS = {
  larva: { current: 0, next: 51 },
  worker: { current: 51, next: 151 },
  guard: { current: 151, next: 301 },
  forager: { current: 301, next: 501 },
  queen: { current: 501, next: 1000 },
} as const;

const DEFAULT_PROGRESS: LearnProgress = {
  level: 1,
  honey: 0,
  streak: 0,
  lastActive: new Date().toISOString(),
  completedLessons: [],
};

// ===============================
// Helper Functions
// ===============================

export function getBeeLevel(honey: number): BeeLevel {
  if (honey >= 501) return 'queen';
  if (honey >= 301) return 'forager';
  if (honey >= 151) return 'guard';
  if (honey >= 51) return 'worker';
  return 'larva';
}

export function getLevelFromBeeLevel(beeLevel: BeeLevel): number {
  const levels: Record<BeeLevel, number> = {
    larva: 1,
    worker: 2,
    guard: 3,
    forager: 4,
    queen: 5,
  };
  return levels[beeLevel];
}

export function getLevelThresholds(level: BeeLevel) {
  return LEVEL_THRESHOLDS[level];
}

// ===============================
// State Atoms (Persisted)
// ===============================

export const learnProgressAtom = atomWithStorage<LearnProgress>(
  STORAGE_KEYS.learnProgress,
  DEFAULT_PROGRESS
);

// ===============================
// Derived Atoms (Computed)
// ===============================

// Current bee level based on honey
export const beeLevelAtom = atom((get) => {
  const progress = get(learnProgressAtom);
  return getBeeLevel(progress.honey);
});

// Level progress percentage
export const levelProgressAtom = atom((get) => {
  const progress = get(learnProgressAtom);
  const level = getBeeLevel(progress.honey);
  const { current, next } = LEVEL_THRESHOLDS[level];
  const percentage = Math.min(100, Math.max(0, ((progress.honey - current) / (next - current)) * 100));

  return { current, next, percentage };
});

// Check if lesson is completed
export const isLessonCompletedAtom = atom((get) => (lessonId: string) => {
  const progress = get(learnProgressAtom);
  return progress.completedLessons.includes(lessonId);
});

// ===============================
// Action Atoms (Mutations)
// ===============================

// Add honey and update level
export const addHoneyAtom = atom(
  null,
  (get, set, amount: number) => {
    const progress = get(learnProgressAtom);
    const newHoney = progress.honey + amount;
    const newLevel = getBeeLevel(newHoney);

    set(learnProgressAtom, {
      ...progress,
      honey: newHoney,
      level: getLevelFromBeeLevel(newLevel),
    });
  }
);

// Complete a lesson
export const completeLessonAtom = atom(
  null,
  (get, set, lessonId: string) => {
    const progress = get(learnProgressAtom);

    // Don't add duplicates
    if (progress.completedLessons.includes(lessonId)) {
      return;
    }

    set(learnProgressAtom, {
      ...progress,
      completedLessons: [...progress.completedLessons, lessonId],
    });
  }
);

// Update streak on daily visit
export const updateStreakAtom = atom(
  null,
  (get, set) => {
    const progress = get(learnProgressAtom);
    const now = new Date();
    const lastActive = new Date(progress.lastActive);

    // Calculate days difference
    const daysDiff = Math.floor(
      (now.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24)
    );

    let newStreak = progress.streak;
    if (daysDiff === 1) {
      // Consecutive day - increase streak
      newStreak += 1;
    } else if (daysDiff > 1) {
      // Streak broken - reset to 1
      newStreak = 1;
    }
    // If daysDiff === 0, same day - don't change streak

    set(learnProgressAtom, {
      ...progress,
      streak: newStreak,
      lastActive: now.toISOString(),
    });
  }
);

// Reset all progress
export const resetLearnProgressAtom = atom(
  null,
  (_get, set) => {
    set(learnProgressAtom, DEFAULT_PROGRESS);
  }
);
