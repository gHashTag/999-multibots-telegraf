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

// Deterministic storage for Node 22+/jsdom. Node's experimental global
// localStorage can be present but unavailable without --localstorage-file;
// tests must never inherit that host-dependent state.
const memoryStorage = new Map<string, string>()
const testStorage: Storage = {
  get length() {
    return memoryStorage.size
  },
  clear() {
    memoryStorage.clear()
  },
  getItem(key) {
    return memoryStorage.get(String(key)) ?? null
  },
  key(index) {
    return [...memoryStorage.keys()][index] ?? null
  },
  removeItem(key) {
    memoryStorage.delete(String(key))
  },
  setItem(key, value) {
    memoryStorage.set(String(key), String(value))
  },
}

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: testStorage,
})

afterEach(() => {
  // Mocks, timers and storage must not leak into the next test.
  vi.restoreAllMocks()
  vi.clearAllTimers()
  memoryStorage.clear()
})
