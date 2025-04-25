import { SyncSessionStore } from 'telegraf/typings/session'

// Простой SessionStore в памяти для тестов
export class MemorySessionStore<T> implements SyncSessionStore<T> {
  private store = new Map<string, { session: T; expires?: number }>()

  get(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry) {
      return undefined
    }
    if (entry.expires && entry.expires < Date.now()) {
      this.delete(key)
      return undefined
    }
    return entry.session
  }

  set(key: string, session: T, ttl?: number): void {
    const expires = ttl ? Date.now() + ttl * 1000 : undefined
    this.store.set(key, { session, expires })
  }

  delete(key: string): void {
    this.store.delete(key)
  }
}
