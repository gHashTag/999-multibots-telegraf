/**
 * Мок для типов telegraf/typings/scenes.ts
 */

// Экспортируем тип для сессии сцены
export interface SceneSession {
  __scenes: {
    current?: string
    state: Record<string, any>
  }
}
