// ===============================
// Platform-agnostic Storage Adapters
// Works for both Web (localStorage) and React Native (AsyncStorage)
// SINGLE SOURCE OF TRUTH for storage patterns
// ===============================

import { atomWithStorage, createJSONStorage } from 'jotai/utils'
import { STORAGE_KEYS, type StorageKeyName, type StorageValueTypes } from './keys'

// ===============================
// Storage Adapter Interface
// ===============================
export interface StorageAdapter {
  getItem: (key: string) => string | null | Promise<string | null>
  setItem: (key: string, value: string) => void | Promise<void>
  removeItem: (key: string) => void | Promise<void>
}

// ===============================
// Platform Detection
// ===============================
export const isReactNative =
  typeof navigator !== 'undefined' && navigator.product === 'ReactNative'

export const isBrowser =
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'

export const isSSR = !isBrowser && !isReactNative

// ===============================
// No-op Storage (for SSR or testing)
// ===============================
export const noopStorage: StorageAdapter = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
}

// ===============================
// Browser localStorage Adapter
// ===============================
export const browserStorage: StorageAdapter = isBrowser
  ? {
      getItem: (key) => window.localStorage.getItem(key),
      setItem: (key, value) => window.localStorage.setItem(key, value),
      removeItem: (key) => window.localStorage.removeItem(key),
    }
  : noopStorage

// ===============================
// Async Storage Wrapper (for React Native)
// Must be injected at runtime since AsyncStorage is RN-only
// ===============================
let asyncStorageAdapter: StorageAdapter | null = null

export function setAsyncStorageAdapter(adapter: StorageAdapter): void {
  asyncStorageAdapter = adapter
}

export function getAsyncStorageAdapter(): StorageAdapter {
  if (!asyncStorageAdapter) {
    console.warn('[vibee-atoms] AsyncStorage adapter not set. Using noopStorage.')
    return noopStorage
  }
  return asyncStorageAdapter
}

// ===============================
// Platform-Agnostic Storage Factory
// ===============================

/**
 * Get the appropriate storage adapter for the current platform
 */
export function getPlatformStorage(): StorageAdapter {
  if (isReactNative) {
    return getAsyncStorageAdapter()
  }
  if (isBrowser) {
    return browserStorage
  }
  return noopStorage
}

/**
 * Create a Jotai-compatible storage for the current platform
 * Use this with atomWithStorage for cross-platform persistence
 *
 * @example Web (automatic)
 * ```typescript
 * import { createPlatformJotaiStorage, STORAGE_KEYS } from '@vibee/atoms'
 *
 * const storage = createPlatformJotaiStorage()
 * export const volumeAtom = atomWithStorage(STORAGE_KEYS.volume, 1, storage)
 * ```
 *
 * @example React Native (requires setup)
 * ```typescript
 * // In app entry point (App.tsx):
 * import AsyncStorage from '@react-native-async-storage/async-storage'
 * import { setAsyncStorageAdapter } from '@vibee/atoms'
 *
 * setAsyncStorageAdapter({
 *   getItem: AsyncStorage.getItem,
 *   setItem: AsyncStorage.setItem,
 *   removeItem: AsyncStorage.removeItem,
 * })
 *
 * // Then in atoms:
 * const storage = createPlatformJotaiStorage()
 * export const volumeAtom = atomWithStorage(STORAGE_KEYS.volume, 1, storage)
 * ```
 */
export function createPlatformJotaiStorage<T = unknown>() {
  const adapter = getPlatformStorage()

  return createJSONStorage<T>(() => ({
    getItem: (key: string) => {
      const result = adapter.getItem(key)
      // Handle both sync (localStorage) and async (AsyncStorage)
      if (result instanceof Promise) {
        return result
      }
      return result
    },
    setItem: (key: string, value: string) => {
      return adapter.setItem(key, value)
    },
    removeItem: (key: string) => {
      return adapter.removeItem(key)
    },
  }))
}

/**
 * Create a typed atom with storage, using centralized STORAGE_KEYS
 *
 * @example
 * ```typescript
 * import { createStorageAtom } from '@vibee/atoms'
 *
 * // Type-safe key and default value
 * export const volumeAtom = createStorageAtom('volume', 1)
 * export const themeAtom = createStorageAtom('theme', 'dark')
 * ```
 */
export function createStorageAtom<K extends StorageKeyName>(
  key: K,
  defaultValue: K extends keyof StorageValueTypes ? StorageValueTypes[K] : unknown
) {
  const storage = createPlatformJotaiStorage<typeof defaultValue>()
  return atomWithStorage(STORAGE_KEYS[key], defaultValue, storage)
}

/**
 * Create a storage atom with custom storage adapter
 * Use this when you need platform-specific behavior
 *
 * @example
 * ```typescript
 * import AsyncStorage from '@react-native-async-storage/async-storage'
 *
 * const mobileStorage = {
 *   getItem: AsyncStorage.getItem,
 *   setItem: AsyncStorage.setItem,
 *   removeItem: AsyncStorage.removeItem,
 * }
 *
 * export const volumeAtom = createStorageAtomWithAdapter('volume', 1, mobileStorage)
 * ```
 */
export function createStorageAtomWithAdapter<K extends StorageKeyName, T>(
  key: K,
  defaultValue: T,
  adapter: StorageAdapter
) {
  const storage = createJSONStorage<T>(() => ({
    getItem: (k) => {
      const result = adapter.getItem(k)
      return result instanceof Promise ? result : result
    },
    setItem: (k, v) => adapter.setItem(k, v),
    removeItem: (k) => adapter.removeItem(k),
  }))

  return atomWithStorage(STORAGE_KEYS[key], defaultValue, storage)
}

// ===============================
// Storage Utilities
// ===============================

/**
 * Clear all VIBEE storage keys
 * Useful for logout or reset functionality
 */
export async function clearAllStorage(adapter?: StorageAdapter): Promise<void> {
  const storage = adapter ?? getPlatformStorage()
  const keys = Object.values(STORAGE_KEYS)

  for (const key of keys) {
    await storage.removeItem(key)
  }
}

/**
 * Clear storage keys by category
 */
export async function clearStorageByPrefix(
  prefix: string,
  adapter?: StorageAdapter
): Promise<void> {
  const storage = adapter ?? getPlatformStorage()
  const keys = Object.values(STORAGE_KEYS).filter((key) => key.startsWith(prefix))

  for (const key of keys) {
    await storage.removeItem(key)
  }
}

/**
 * Export all storage data (for backup/debug)
 */
export async function exportStorageData(
  adapter?: StorageAdapter
): Promise<Record<string, string | null>> {
  const storage = adapter ?? getPlatformStorage()
  const keys = Object.values(STORAGE_KEYS)
  const data: Record<string, string | null> = {}

  for (const key of keys) {
    const value = await storage.getItem(key)
    if (value !== null) {
      data[key] = value
    }
  }

  return data
}

/**
 * Import storage data (for restore/migration)
 */
export async function importStorageData(
  data: Record<string, string>,
  adapter?: StorageAdapter
): Promise<void> {
  const storage = adapter ?? getPlatformStorage()

  for (const [key, value] of Object.entries(data)) {
    if (Object.values(STORAGE_KEYS).includes(key as (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS])) {
      await storage.setItem(key, value)
    }
  }
}
