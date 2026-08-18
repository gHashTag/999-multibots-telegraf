// Cache Service for Script Generation
// Uses localStorage for client-side caching (Redis for server-side in future)

import { CACHE_TTL } from '@vibee/atoms';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

const CACHE_PREFIX = 'vibee_script_cache_';

export class CacheService {
  /**
   * Generate cache key from input parameters
   */
  static generateKey(input: {
    topic: string;
    niche: string;
    style: string;
    duration: number;
    language: string;
  }): string {
    const normalized = {
      topic: input.topic.toLowerCase().trim(),
      niche: input.niche,
      style: input.style,
      duration: input.duration,
      language: input.language,
    };
    
    const str = JSON.stringify(normalized);
    
    // Simple hash for browser (no crypto module in browser)
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    return CACHE_PREFIX + Math.abs(hash).toString(36);
  }

  /**
   * Get cached data
   */
  static get<T>(key: string): T | null {
    try {
      const item = localStorage.getItem(key);
      if (!item) return null;

      const entry: CacheEntry<T> = JSON.parse(item);
      const now = Date.now();

      // Check if expired
      if (now - entry.timestamp > entry.ttl) {
        localStorage.removeItem(key);
        return null;
      }

      return entry.data;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Set cached data
   */
  static set<T>(key: string, data: T, ttl: number = CACHE_TTL.WEB_LONG): void {
    try {
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        ttl,
      };

      localStorage.setItem(key, JSON.stringify(entry));
    } catch (error) {
      console.error('Cache set error:', error);
      // If localStorage is full, clear old entries
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        this.clearOldEntries();
        // Try again
        try {
          localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now(), ttl }));
        } catch {
          // If still fails, ignore
        }
      }
    }
  }

  /**
   * Delete specific cache entry (alias for clear)
   */
  static delete(key: string): void {
    this.clear(key);
  }

  /**
   * Clear specific cache entry
   */
  static clear(key?: string): void {
    try {
      if (key) {
        localStorage.removeItem(key);
      } else {
        this.clearAll();
      }
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  }

  /**
   * Check if key exists and is not expired
   */
  static has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Clear all cache entries
   */
  static clearAll(): void {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(CACHE_PREFIX)) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.error('Cache clearAll error:', error);
    }
  }

  /**
   * Clear old/expired entries
   */
  static clearOldEntries(): void {
    try {
      const keys = Object.keys(localStorage);
      const now = Date.now();

      keys.forEach(key => {
        if (key.startsWith(CACHE_PREFIX)) {
          try {
            const item = localStorage.getItem(key);
            if (item) {
              const entry: CacheEntry<unknown> = JSON.parse(item);
              if (now - entry.timestamp > entry.ttl) {
                localStorage.removeItem(key);
              }
            }
          } catch {
            // If parsing fails, remove the entry
            localStorage.removeItem(key);
          }
        }
      });
    } catch (error) {
      console.error('Cache clearOldEntries error:', error);
    }
  }

  /**
   * Get cache statistics
   */
  static getStats(): {
    totalEntries: number;
    totalSize: number;
    oldestEntry: number | null;
    newestEntry: number | null;
  } {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX));
    let totalSize = 0;
    let oldestEntry: number | null = null;
    let newestEntry: number | null = null;

    keys.forEach(key => {
      try {
        const item = localStorage.getItem(key);
        if (item) {
          totalSize += item.length;
          const entry: CacheEntry<unknown> = JSON.parse(item);
          
          if (oldestEntry === null || entry.timestamp < oldestEntry) {
            oldestEntry = entry.timestamp;
          }
          if (newestEntry === null || entry.timestamp > newestEntry) {
            newestEntry = entry.timestamp;
          }
        }
      } catch {
        // Ignore parsing errors
      }
    });

    return {
      totalEntries: keys.length,
      totalSize,
      oldestEntry,
      newestEntry,
    };
  }
}

// Auto-cleanup on page load
if (typeof window !== 'undefined') {
  CacheService.clearOldEntries();
}
