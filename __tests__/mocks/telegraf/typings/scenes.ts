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

/**
 * Mock для Telegraf scenes exports
 */
export * from './scenes/index'
export * from './scenes/base'
export * from './scenes/context'
export * from './scenes/session'

// Экспортируем дополнительно Stage для прямого импорта
import { Stage } from './scenes/index'
export { Stage }
