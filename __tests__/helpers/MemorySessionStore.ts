// Простой SessionStore в памяти для тестов
export class MemorySessionStore<T> {
  private store = new Map<string, { session: T; expires?: number }>()

  async get(key: string): Promise<T | undefined> {
    const entry = this.store.get(key)
    if (!entry) {
      return undefined
    }
    if (entry.expires && entry.expires < Date.now()) {
      await this.delete(key)
      return undefined
    }
    return entry.session
  }

  async set(key: string, session: T, ttl?: number): Promise<void> {
    const expires = ttl ? Date.now() + ttl * 1000 : undefined
    this.store.set(key, { session, expires })
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key)
  }
}
