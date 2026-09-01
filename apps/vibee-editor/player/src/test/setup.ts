/**
 * Общая настройка прогона тестов плеера.
 *
 * ПОЧЕМУ ЭТОТ ФАЙЛ ПОЯВИЛСЯ ТОЛЬКО СЕЙЧАС. `vitest.config.ts` ссылается на
 * него строкой `setupFiles: './src/test/setup.ts'` — а самого файла не было
 * ни в рабочем дереве, ни в git. Любой прогон падал на загрузке:
 *
 *   Error: Failed to load url .../src/test/setup.ts. Does the file exist?
 *
 * Падение происходит ДО первого теста, поэтому в плеере не исполнялся ни один
 * assert из шести файлов тестов — включая тесты `errorMessages`, которые
 * описывают ровно тот разбор ошибок, что мы правим рядом.
 *
 * Наполнение намеренно минимальное. Ни `@testing-library/jest-dom`, ни
 * `@testing-library/react` в зависимостях нет (проверено по package.json), и
 * тянуть их сюда ради красоты значило бы менять состав пакета под предлогом
 * «починки настройки». Всё, что нужно этим шести файлам, — окружение jsdom,
 * и оно задано в самом конфиге.
 *
 * Здесь только то, что реально требуется от общей настройки: сброс состояния
 * между тестами, чтобы порядок их запуска не влиял на результат.
 */

import { afterEach, vi } from 'vitest'

// Node 22.22 exposes an experimental global `localStorage` placeholder that
// is undefined unless --localstorage-file is passed. It shadows jsdom's real
// implementation, so legacy storage tests fail before their first assertion.
// The app itself is unchanged; the test global must point at the browser
// object supplied by the configured jsdom environment.
const storageIsUsable =
  typeof globalThis.localStorage !== 'undefined' &&
  typeof globalThis.localStorage?.clear === 'function'

if (!storageIsUsable) {
  const values = new Map<string, string>()
  const memoryStorage = {
    get length() {
      return values.size
    },
    key(index: number) {
      return [...values.keys()][index] ?? null
    },
    getItem(key: string) {
      return values.get(String(key)) ?? null
    },
    setItem(key: string, value: string) {
      const normalized = String(key)
      values.set(normalized, String(value))
      Object.defineProperty(memoryStorage, normalized, {
        configurable: true,
        enumerable: true,
        get: () => values.get(normalized),
      })
    },
    removeItem(key: string) {
      const normalized = String(key)
      values.delete(normalized)
      delete (memoryStorage as Record<string, unknown>)[normalized]
    },
    clear() {
      for (const key of values.keys()) {
        delete (memoryStorage as Record<string, unknown>)[key]
      }
      values.clear()
    },
  } as Storage
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: memoryStorage,
  })
}

afterEach(() => {
  // Моки, заведённые в одном тесте, не должны утекать в следующий: иначе
  // прогон зависит от порядка файлов, а он у vitest не гарантирован.
  vi.restoreAllMocks()
  vi.clearAllTimers()
})
