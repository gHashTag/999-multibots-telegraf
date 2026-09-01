/**
 * useBRollCache - IndexedDB-based B-Roll video caching
 *
 * Based on DeLoad (Oct 2025) - Demand-Driven Short-Video Preloading
 * Stores video blobs in IndexedDB for instant playback on repeat visits.
 *
 * Features:
 * - 7-day TTL for B-roll videos (longer than feed videos)
 * - Blob URL serving for instant playback
 * - LRU eviction when cache is full
 * - Progress tracking during download
 */

import { useState, useEffect, useCallback, useRef } from 'react'

interface CachedBRoll {
  id: string
  url: string
  blob: Blob
  size: number
  cachedAt: number
  expiresAt: number
  lastAccessed: number
}

interface BRollCacheState {
  cachedUrls: Set<string>
  blobUrls: Map<string, string>
  isLoading: boolean
  progress: Map<string, number>
  totalSize: number
}

interface BRollCacheOptions {
  cacheTTL?: number // Default: 7 days
  maxCachedVideos?: number // Default: 25
  maxTotalSize?: number // Default: 500MB
}

const DB_NAME = 'vibee-broll-cache'
const DB_VERSION = 1
const STORE_NAME = 'broll-blobs'

export function useBRollCache(options: BRollCacheOptions = {}) {
  const {
    cacheTTL = 7 * 24 * 60 * 60 * 1000, // 7 days
    maxCachedVideos = 25,
    maxTotalSize = 500 * 1024 * 1024, // 500MB
  } = options

  const dbRef = useRef<IDBDatabase | null>(null)
  const blobUrlsRef = useRef<Map<string, string>>(new Map())

  const [state, setState] = useState<BRollCacheState>({
    cachedUrls: new Set(),
    blobUrls: new Map(),
    isLoading: true,
    progress: new Map(),
    totalSize: 0,
  })

  // Initialize IndexedDB
  const initDB = useCallback((): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      if (dbRef.current) {
        resolve(dbRef.current)
        return
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () =>
        reject(new Error('Failed to open B-Roll cache DB'))

      request.onsuccess = () => {
        dbRef.current = request.result
        resolve(request.result)
      }

      request.onupgradeneeded = event => {
        const db = (event.target as IDBOpenDBRequest).result

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
          store.createIndex('url', 'url', { unique: true })
          store.createIndex('cachedAt', 'cachedAt', { unique: false })
          store.createIndex('lastAccessed', 'lastAccessed', { unique: false })
          store.createIndex('expiresAt', 'expiresAt', { unique: false })
        }
      }
    })
  }, [])

  // Generate cache ID from URL
  const getCacheId = (url: string): string => {
    // Use URL path as ID (remove query params)
    const urlObj = new URL(url, window.location.origin)
    return urlObj.pathname.replace(/\//g, '_')
  }

  // Check if URL is cached
  const isCached = useCallback(
    (url: string): boolean => {
      return state.cachedUrls.has(url)
    },
    [state.cachedUrls]
  )

  // Get blob URL for cached video (instant playback)
  const getBlobUrl = useCallback((url: string): string | null => {
    return blobUrlsRef.current.get(url) || null
  }, [])

  // Load cached entries on mount
  const loadCachedEntries = useCallback(async () => {
    try {
      const db = await initDB()
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)

      return new Promise<void>(resolve => {
        const request = store.getAll()

        request.onsuccess = () => {
          const now = Date.now()
          const entries = (request.result as CachedBRoll[]).filter(
            entry => entry.expiresAt > now
          )

          const cachedUrls = new Set<string>()
          const blobUrls = new Map<string, string>()
          let totalSize = 0

          for (const entry of entries) {
            cachedUrls.add(entry.url)
            const blobUrl = URL.createObjectURL(entry.blob)
            blobUrls.set(entry.url, blobUrl)
            blobUrlsRef.current.set(entry.url, blobUrl)
            totalSize += entry.size
          }

          setState(prev => ({
            ...prev,
            cachedUrls,
            blobUrls,
            totalSize,
            isLoading: false,
          }))

          resolve()
        }

        request.onerror = () => {
          setState(prev => ({ ...prev, isLoading: false }))
          resolve()
        }
      })
    } catch {
      setState(prev => ({ ...prev, isLoading: false }))
    }
  }, [initDB])

  // Cache a single video
  const cacheVideo = useCallback(
    async (url: string): Promise<string | null> => {
      if (!url || url.startsWith('blob:') || state.cachedUrls.has(url)) {
        return getBlobUrl(url)
      }

      try {
        // Update progress
        setState(prev => ({
          ...prev,
          progress: new Map(prev.progress).set(url, 0),
        }))

        // Fetch video with progress tracking
        const response = await fetch(url)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)

        const contentLength = parseInt(
          response.headers.get('content-length') || '0',
          10
        )
        const reader = response.body?.getReader()
        if (!reader) throw new Error('No reader')

        const chunks: Uint8Array[] = []
        let receivedLength = 0

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          chunks.push(value)
          receivedLength += value.length

          if (contentLength > 0) {
            const progress = Math.round((receivedLength / contentLength) * 100)
            setState(prev => ({
              ...prev,
              progress: new Map(prev.progress).set(url, progress),
            }))
          }
        }

        const blob = new Blob(
          chunks.map(chunk => new Uint8Array(chunk)),
          {
            type: 'video/mp4',
          }
        )
        const blobUrl = URL.createObjectURL(blob)

        // Store in IndexedDB
        const db = await initDB()
        const transaction = db.transaction(STORE_NAME, 'readwrite')
        const store = transaction.objectStore(STORE_NAME)
        const now = Date.now()

        const entry: CachedBRoll = {
          id: getCacheId(url),
          url,
          blob,
          size: blob.size,
          cachedAt: now,
          expiresAt: now + cacheTTL,
          lastAccessed: now,
        }

        store.put(entry)

        // Update state
        blobUrlsRef.current.set(url, blobUrl)
        setState(prev => ({
          ...prev,
          cachedUrls: new Set([...prev.cachedUrls, url]),
          blobUrls: new Map(prev.blobUrls).set(url, blobUrl),
          totalSize: prev.totalSize + blob.size,
          progress: new Map([...prev.progress].filter(([k]) => k !== url)),
        }))

        // Enforce limits
        await enforceLimits()

        return blobUrl
      } catch (error) {
        console.warn('[BRollCache] Failed to cache:', url, error)
        setState(prev => ({
          ...prev,
          progress: new Map([...prev.progress].filter(([k]) => k !== url)),
        }))
        return null
      }
    },
    [state.cachedUrls, getBlobUrl, initDB, cacheTTL]
  )

  // Cache multiple videos
  const cacheVideos = useCallback(
    async (urls: string[]): Promise<void> => {
      const uncachedUrls = urls.filter(
        url => url && !url.startsWith('blob:') && !state.cachedUrls.has(url)
      )

      // Cache in parallel with concurrency limit of 2
      const concurrencyLimit = 2
      for (let i = 0; i < uncachedUrls.length; i += concurrencyLimit) {
        const batch = uncachedUrls.slice(i, i + concurrencyLimit)
        await Promise.all(batch.map(cacheVideo))
      }
    },
    [state.cachedUrls, cacheVideo]
  )

  // Enforce cache limits (LRU eviction)
  const enforceLimits = useCallback(async () => {
    try {
      const db = await initDB()
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)

      return new Promise<void>(resolve => {
        const request = store.getAll()

        request.onsuccess = () => {
          const entries = (request.result as CachedBRoll[]).sort(
            (a, b) => a.lastAccessed - b.lastAccessed
          ) // LRU order

          let totalSize = entries.reduce((sum, e) => sum + e.size, 0)
          let count = entries.length

          // Remove oldest entries if over limit
          for (const entry of entries) {
            if (count <= maxCachedVideos && totalSize <= maxTotalSize) break

            store.delete(entry.id)
            totalSize -= entry.size
            count--

            // Revoke blob URL
            const blobUrl = blobUrlsRef.current.get(entry.url)
            if (blobUrl) {
              URL.revokeObjectURL(blobUrl)
              blobUrlsRef.current.delete(entry.url)
            }
          }

          resolve()
        }

        request.onerror = () => resolve()
      })
    } catch {}
  }, [initDB, maxCachedVideos, maxTotalSize])

  // Get video URL (blob if cached, original otherwise)
  const getVideoUrl = useCallback(
    (url: string): string => {
      const blobUrl = getBlobUrl(url)
      return blobUrl || url
    },
    [getBlobUrl]
  )

  // Update last accessed time
  const touchEntry = useCallback(
    async (url: string) => {
      try {
        const db = await initDB()
        const transaction = db.transaction(STORE_NAME, 'readwrite')
        const store = transaction.objectStore(STORE_NAME)
        const index = store.index('url')

        const request = index.get(url)
        request.onsuccess = () => {
          const entry = request.result as CachedBRoll | undefined
          if (entry) {
            entry.lastAccessed = Date.now()
            store.put(entry)
          }
        }
      } catch {}
    },
    [initDB]
  )

  // Clear expired entries
  const clearExpired = useCallback(async (): Promise<number> => {
    try {
      const db = await initDB()
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const index = store.index('expiresAt')
      const now = Date.now()
      let cleared = 0

      return new Promise(resolve => {
        const range = IDBKeyRange.upperBound(now)
        index.openCursor(range).onsuccess = event => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
          if (cursor) {
            const entry = cursor.value as CachedBRoll
            const blobUrl = blobUrlsRef.current.get(entry.url)
            if (blobUrl) {
              URL.revokeObjectURL(blobUrl)
              blobUrlsRef.current.delete(entry.url)
            }
            store.delete(cursor.primaryKey)
            cleared++
            cursor.continue()
          } else {
            resolve(cleared)
          }
        }
      })
    } catch {
      return 0
    }
  }, [initDB])

  // Clear all cache
  const clearCache = useCallback(async () => {
    try {
      // Revoke all blob URLs
      for (const blobUrl of blobUrlsRef.current.values()) {
        URL.revokeObjectURL(blobUrl)
      }
      blobUrlsRef.current.clear()

      const db = await initDB()
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      store.clear()

      setState({
        cachedUrls: new Set(),
        blobUrls: new Map(),
        isLoading: false,
        progress: new Map(),
        totalSize: 0,
      })
    } catch {}
  }, [initDB])

  // Load cache on mount
  useEffect(() => {
    loadCachedEntries()
  }, [loadCachedEntries])

  // Clear expired on mount
  useEffect(() => {
    clearExpired()
  }, [clearExpired])

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      for (const blobUrl of blobUrlsRef.current.values()) {
        URL.revokeObjectURL(blobUrl)
      }
    }
  }, [])

  return {
    // State
    isLoading: state.isLoading,
    cachedCount: state.cachedUrls.size,
    totalSize: state.totalSize,
    progress: state.progress,

    // Checks
    isCached,
    getBlobUrl,
    getVideoUrl,

    // Actions
    cacheVideo,
    cacheVideos,
    touchEntry,
    clearExpired,
    clearCache,

    // Stats
    stats: {
      cachedCount: state.cachedUrls.size,
      maxAllowed: maxCachedVideos,
      totalSize: state.totalSize,
      maxTotalSize,
      cacheTTL,
    },
  }
}

export default useBRollCache
