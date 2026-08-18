// ===============================
// useLearn Hook - Convenience wrapper for Learn atoms
// ===============================

import { useAtomValue, useSetAtom } from 'jotai';
import {
  learnProgressAtom,
  beeLevelAtom,
  levelProgressAtom,
  addHoneyAtom,
  completeLessonAtom,
  updateStreakAtom,
  resetLearnProgressAtom,
  type BeeLevel,
} from '@/atoms/learn';

export function useLearn() {
  // State
  const progress = useAtomValue(learnProgressAtom);
  const beeLevel = useAtomValue(beeLevelAtom);
  const levelProgress = useAtomValue(levelProgressAtom);

  // Actions
  const addHoney = useSetAtom(addHoneyAtom);
  const completeLesson = useSetAtom(completeLessonAtom);
  const updateStreak = useSetAtom(updateStreakAtom);
  const resetProgress = useSetAtom(resetLearnProgressAtom);

  // Derived helpers
  const isLessonCompleted = (lessonId: string) => {
    return progress?.completedLessons?.includes(lessonId) ?? false;
  };

  return {
    // State
    progress,
    beeLevel,
    levelProgress,

    // Computed
    isLessonCompleted,

    // Actions
    addHoney,
    completeLesson,
    updateStreak,
    resetProgress,
  };
}

// Re-export type for convenience
export type { BeeLevel };
