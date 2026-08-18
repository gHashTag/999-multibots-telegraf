import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { StudentProgress, BeeLevel, Achievement, BeeState } from './types';

interface GameStore {
  progress: StudentProgress;
  beeState: BeeState;
  
  // Actions
  addHoney: (amount: number) => void;
  completeLesson: (lessonId: string) => void;
  unlockAchievement: (achievement: Achievement) => void;
  updateStreak: () => void;
  setBeeState: (state: BeeState) => void;
  getLevel: () => BeeLevel;
  getLevelProgress: () => { current: number; next: number; percentage: number };
}

const getBeeLevel = (honey: number): BeeLevel => {
  if (honey >= 501) return 'queen';
  if (honey >= 301) return 'forager';
  if (honey >= 151) return 'guard';
  if (honey >= 51) return 'worker';
  return 'larva';
};

const getLevelThresholds = (level: BeeLevel): { current: number; next: number } => {
  const thresholds = {
    larva: { current: 0, next: 51 },
    worker: { current: 51, next: 151 },
    guard: { current: 151, next: 301 },
    forager: { current: 301, next: 501 },
    queen: { current: 501, next: 1000 },
  };
  return thresholds[level];
};

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      progress: {
        userId: 'student-1',
        level: 1,
        honey: 0,
        streak: 0,
        lastActive: new Date(),
        completedLessons: [],
        achievements: [],
        currentWorld: 'world-1',
        currentLesson: 'lesson-1-1',
      },
      beeState: {
        mood: 'happy',
        animation: 'idle',
      },

      addHoney: (amount: number) => {
        set((state) => {
          const newHoney = state.progress.honey + amount;
          const oldLevel = getBeeLevel(state.progress.honey);
          const newLevel = getBeeLevel(newHoney);
          
          // Level up animation
          if (oldLevel !== newLevel) {
            setTimeout(() => {
              get().setBeeState({ mood: 'strong', animation: 'levelup' });
            }, 500);
          }

          return {
            progress: {
              ...state.progress,
              honey: newHoney,
              level: newLevel === 'larva' ? 1 : 
                     newLevel === 'worker' ? 2 :
                     newLevel === 'guard' ? 3 :
                     newLevel === 'forager' ? 4 : 5,
            },
          };
        });
      },

      completeLesson: (lessonId: string) => {
        set((state) => {
          if (state.progress.completedLessons.includes(lessonId)) {
            return state;
          }

          return {
            progress: {
              ...state.progress,
              completedLessons: [...state.progress.completedLessons, lessonId],
            },
          };
        });
        
        get().setBeeState({ mood: 'celebrating', animation: 'complete' });
      },

      unlockAchievement: (achievement: Achievement) => {
        set((state) => ({
          progress: {
            ...state.progress,
            achievements: [...state.progress.achievements, achievement],
          },
        }));
      },

      updateStreak: () => {
        set((state) => {
          const now = new Date();
          const lastActive = new Date(state.progress.lastActive);
          const daysDiff = Math.floor(
            (now.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24)
          );

          let newStreak = state.progress.streak;
          if (daysDiff === 1) {
            newStreak += 1;
          } else if (daysDiff > 1) {
            newStreak = 1;
          }

          return {
            progress: {
              ...state.progress,
              streak: newStreak,
              lastActive: now,
            },
          };
        });
      },

      setBeeState: (state: BeeState) => {
        set({ beeState: state });
      },

      getLevel: () => {
        return getBeeLevel(get().progress.honey);
      },

      getLevelProgress: () => {
        const honey = get().progress.honey;
        const level = getBeeLevel(honey);
        const { current, next } = getLevelThresholds(level);
        const percentage = ((honey - current) / (next - current)) * 100;
        
        return { current, next, percentage };
      },
    }),
    {
      name: 'vibee-learn-storage',
    }
  )
);
