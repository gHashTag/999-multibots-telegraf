import { useState, useEffect, useCallback, useRef } from 'react';

interface CachedVideo {
  id: string;
  src: string;
  hlsSrc?: string;
  poster?: string;
  thumbnail?: string;
  duration?: number;
  title?: string;
  cachedAt: number;
  expiresAt: number;
}

interface VideoCacheOptions {
  /**
   * IndexedDB database name
   */
  dbName?: string;

  /**
   * Cache TTL in milliseconds (default: 24 hours)
   */
  cacheTTL?: number;

  /**
   * Max videos to keep in cache (default: 50)
   */
  maxCachedVideos?: number;

  /**
   * Whether to preload cached videos on mount
   */
  preloadOnMount?: boolean;
}

interface VideoCacheState {
  cachedVideos: CachedVideo[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: number | null;
}

const DB_VERSION = 1;
const STORE_NAME = 'video-cache';

/**
 * useVideoCache - Stale-While-Revalidate video caching
 *
 * Shows cached videos from previous session while fresh ones load.
 * Uses IndexedDB for persistent storage across sessions.
 *
 * Pattern: Stale-While-Revalidate
 * 1. Immediately show cached videos (stale)
 * 2. Fetch fresh videos in background (revalidate)
 * 3. Update UI when fresh data arrives
 *
 * @example
 * const { cachedVideos, cacheVideos, getCachedOrFetch } = useVideoCache();
 *
 * // On app load - show cached immediately
 * const videosToShow = cachedVideos.length > 0 ? cachedVideos : [];
 *
 * // Fetch fresh in background
 * useEffect(() => {
 *   fetchFreshVideos().then(fresh => {
 *     cacheVideos(fresh);
 *     setVideos(fresh);
 *   });
 * }, []);
 */
export function useVideoCache(options: VideoCacheOptions = {}) {
  const {
    dbName = 'vibee-video-cache',
    cacheTTL = 24 * 60 * 60 * 1000, // 24 hours
    maxCachedVideos = 50,
    preloadOnMount = true,
  } = options;

  const dbRef = useRef<IDBDatabase | null>(null);

  const [state, setState] = useState<VideoCacheState>({
    cachedVideos: [],
    isLoading: true,
    error: null,
    lastUpdated: null,
  });

  // Initialize IndexedDB
  const initDB = useCallback((): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      if (dbRef.current) {
        resolve(dbRef.current);
        return;
      }

      const request = indexedDB.open(dbName, DB_VERSION);

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB'));
      };

      request.onsuccess = () => {
        dbRef.current = request.result;
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('cachedAt', 'cachedAt', { unique: false });
          store.createIndex('expiresAt', 'expiresAt', { unique: false });
        }
      };
    });
  }, [dbName]);

  // Load cached videos from IndexedDB
  const loadCachedVideos = useCallback(async (): Promise<CachedVideo[]> => {
    try {
      const db = await initDB();
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = store.getAll();

        request.onsuccess = () => {
          const now = Date.now();
          // Filter out expired videos
          const validVideos = (request.result as CachedVideo[])
            .filter((v) => v.expiresAt > now)
            .sort((a, b) => b.cachedAt - a.cachedAt)
            .slice(0, maxCachedVideos);

          resolve(validVideos);
        };

        request.onerror = () => {
          reject(new Error('Failed to load cached videos'));
        };
      });
    } catch (error) {
      console.error('Cache load error:', error);
      return [];
    }
  }, [initDB, maxCachedVideos]);

  // Save videos to cache
  const cacheVideos = useCallback(
    async (videos: Omit<CachedVideo, 'cachedAt' | 'expiresAt'>[]): Promise<void> => {
      try {
        const db = await initDB();
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const now = Date.now();

        for (const video of videos) {
          const cachedVideo: CachedVideo = {
            ...video,
            cachedAt: now,
            expiresAt: now + cacheTTL,
          };
          store.put(cachedVideo);
        }

        // Cleanup old entries if over limit
        const countRequest = store.count();
        countRequest.onsuccess = () => {
          if (countRequest.result > maxCachedVideos) {
            const index = store.index('cachedAt');
            const deleteCount = countRequest.result - maxCachedVideos;
            let deleted = 0;

            index.openCursor().onsuccess = (event) => {
              const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
              if (cursor && deleted < deleteCount) {
                store.delete(cursor.primaryKey);
                deleted++;
                cursor.continue();
              }
            };
          }
        };

        // Update state
        const updatedVideos = await loadCachedVideos();
        setState((prev) => ({
          ...prev,
          cachedVideos: updatedVideos,
          lastUpdated: now,
        }));
      } catch (error) {
        console.error('Cache save error:', error);
        setState((prev) => ({
          ...prev,
          error: 'Failed to cache videos',
        }));
      }
    },
    [initDB, cacheTTL, maxCachedVideos, loadCachedVideos]
  );

  // Get single cached video
  const getCachedVideo = useCallback(
    async (id: string): Promise<CachedVideo | null> => {
      try {
        const db = await initDB();
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);

        return new Promise((resolve) => {
          const request = store.get(id);
          request.onsuccess = () => {
            const video = request.result as CachedVideo | undefined;
            if (video && video.expiresAt > Date.now()) {
              resolve(video);
            } else {
              resolve(null);
            }
          };
          request.onerror = () => resolve(null);
        });
      } catch {
        return null;
      }
    },
    [initDB]
  );

  // Stale-While-Revalidate pattern
  const getCachedOrFetch = useCallback(
    async (
      fetchFn: () => Promise<Omit<CachedVideo, 'cachedAt' | 'expiresAt'>[]>,
      options: { forceRefresh?: boolean } = {}
    ): Promise<{ videos: CachedVideo[]; fromCache: boolean }> => {
      const { forceRefresh = false } = options;

      // Step 1: Return cached immediately (stale)
      if (!forceRefresh && state.cachedVideos.length > 0) {
        // Step 2: Revalidate in background
        fetchFn()
          .then((freshVideos) => {
            cacheVideos(freshVideos);
          })
          .catch(console.error);

        return {
          videos: state.cachedVideos,
          fromCache: true,
        };
      }

      // No cache - fetch fresh
      try {
        const freshVideos = await fetchFn();
        await cacheVideos(freshVideos);
        // Return the newly cached videos
        const updated = await loadCachedVideos();
        return {
          videos: updated,
          fromCache: false,
        };
      } catch (error) {
        // Fallback to stale cache on network error
        if (state.cachedVideos.length > 0) {
          return {
            videos: state.cachedVideos,
            fromCache: true,
          };
        }
        throw error;
      }
    },
    [state.cachedVideos, cacheVideos, loadCachedVideos]
  );

  // Clear expired videos
  const clearExpired = useCallback(async (): Promise<number> => {
    try {
      const db = await initDB();
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('expiresAt');
      const now = Date.now();
      let clearedCount = 0;

      return new Promise((resolve) => {
        const range = IDBKeyRange.upperBound(now);
        index.openCursor(range).onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            store.delete(cursor.primaryKey);
            clearedCount++;
            cursor.continue();
          } else {
            resolve(clearedCount);
          }
        };
      });
    } catch {
      return 0;
    }
  }, [initDB]);

  // Clear all cache
  const clearCache = useCallback(async (): Promise<void> => {
    try {
      const db = await initDB();
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.clear();

      setState((prev) => ({
        ...prev,
        cachedVideos: [],
        lastUpdated: null,
      }));
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  }, [initDB]);

  // Load cached videos on mount
  useEffect(() => {
    if (!preloadOnMount) return;

    loadCachedVideos()
      .then((videos) => {
        setState({
          cachedVideos: videos,
          isLoading: false,
          error: null,
          lastUpdated: videos.length > 0 ? videos[0].cachedAt : null,
        });
      })
      .catch((error) => {
        setState({
          cachedVideos: [],
          isLoading: false,
          error: error.message,
          lastUpdated: null,
        });
      });
  }, [loadCachedVideos, preloadOnMount]);

  // Cleanup expired on mount
  useEffect(() => {
    clearExpired();
  }, [clearExpired]);

  return {
    // State
    cachedVideos: state.cachedVideos,
    isLoading: state.isLoading,
    error: state.error,
    lastUpdated: state.lastUpdated,
    hasCachedVideos: state.cachedVideos.length > 0,

    // Actions
    cacheVideos,
    getCachedVideo,
    getCachedOrFetch,
    clearExpired,
    clearCache,

    // Stats
    stats: {
      cachedCount: state.cachedVideos.length,
      maxAllowed: maxCachedVideos,
      cacheTTL,
    },
  };
}

export default useVideoCache;
