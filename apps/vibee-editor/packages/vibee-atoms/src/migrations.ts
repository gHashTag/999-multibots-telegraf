// Storage key migrations for backward compatibility
import { STORAGE_KEYS } from './keys'
import type { StorageAdapter } from './storage'

export interface KeyMigration {
  from: string
  to: string
  transform?: (value: string) => string
}

// Define migrations from old keys to new keys
export const KEY_MIGRATIONS: KeyMigration[] = [
  // Mobile legacy keys -> unified keys
  { from: 'vibee-bg-music', to: STORAGE_KEYS.backgroundMusic },
  { from: 'vibee-vignette', to: STORAGE_KEYS.vignetteStrength },
  { from: 'vibee-circle-bottom', to: STORAGE_KEYS.circleBottom },
  { from: 'vibee-circle-left', to: STORAGE_KEYS.circleLeft },
  { from: 'vibee-language', to: STORAGE_KEYS.language },
]

export type CurrentKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]

// Synchronous migration (for localStorage)
export function migrateStorageKey(
  storage: StorageAdapter,
  migration: KeyMigration
): void {
  const oldValue = storage.getItem(migration.from)
  if (oldValue && typeof oldValue === 'string') {
    const newValue = migration.transform ? migration.transform(oldValue) : oldValue
    storage.setItem(migration.to, newValue)
    storage.removeItem(migration.from)
  }
}

// Async migration (for AsyncStorage)
export async function migrateStorageKeyAsync(
  storage: StorageAdapter,
  migration: KeyMigration
): Promise<void> {
  const oldValue = await storage.getItem(migration.from)
  if (oldValue && typeof oldValue === 'string') {
    const newValue = migration.transform ? migration.transform(oldValue) : oldValue
    await storage.setItem(migration.to, newValue)
    await storage.removeItem(migration.from)
  }
}

// Run all migrations synchronously
export function runAllMigrations(storage: StorageAdapter): void {
  KEY_MIGRATIONS.forEach((migration) => migrateStorageKey(storage, migration))
}

// Run all migrations asynchronously
export async function runAllMigrationsAsync(storage: StorageAdapter): Promise<void> {
  for (const migration of KEY_MIGRATIONS) {
    await migrateStorageKeyAsync(storage, migration)
  }
}

// Create a storage wrapper that auto-migrates
export function createMigratingStorage(storage: StorageAdapter): StorageAdapter {
  // Run migrations on first access
  let migrated = false

  return {
    getItem: (key) => {
      if (!migrated) {
        runAllMigrations(storage)
        migrated = true
      }
      return storage.getItem(key)
    },
    setItem: storage.setItem,
    removeItem: storage.removeItem,
  }
}
