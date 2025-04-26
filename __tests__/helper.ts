/**
 * Вспомогательный файл для тестирования
 * Содержит переадресацию модулей и типов для обеспечения совместимости кода
 */

// Экспортируем все типы из 'telegraf/types', чтобы они могли быть использованы как из 'telegraf/typings/core/types/typegram'
export * from 'telegraf/types'

// Имитируем структуру telegraf/typings/scenes
export const SceneContextScene = {}
export const WizardContextWizard = {}

// Создаем тип-хелпер для SessionStore, совместимый со старым SyncSessionStore
export interface SessionStore<T> {
  get: (key: string) => Promise<T | undefined>
  set: (key: string, session: T, ttl?: number) => Promise<void>
  delete: (key: string) => Promise<void>
}

// Объединяем указатели для импортов с корректным типом
export const typingsSession = {
  // Используем интерфейс для определения типа
  SessionStore: {} as unknown as { new <T>(): SessionStore<T> },
}

// Объединяем указатели для импортов
export const typingsScenes = {
  SceneContextScene,
  WizardContextWizard,
}

// Объединяем указатели для импортов
export const typingsCore = {
  types: {
    typegram: {
      // Перенаправляем импорты
    },
  },
}

// Расширение для Vitest, чтобы перехватывать импорты
if (typeof window === 'undefined' && typeof global !== 'undefined') {
  // @ts-ignore
  global.__vitest_telegraf_compat = {
    typingsSession,
    typingsScenes,
    typingsCore,
  }
}
