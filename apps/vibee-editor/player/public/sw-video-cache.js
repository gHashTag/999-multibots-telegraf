/**
 * Service Worker Video Cache
 *
 * Based on research (2025):
 * - Service Worker provides persistent cache across sessions
 * - Intercepts video requests and serves from cache
 * - Falls back to network if not cached
 * - Caches responses for future use
 *
 * Features:
 * - Video-specific caching strategy
 * - Cache versioning for updates
 * - Automatic cleanup of old caches
 * - Range request support for video seeking
 */

const CACHE_NAME = 'vibee-video-cache-v1'
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000 // 7 days
const MAX_CACHE_SIZE = 200 * 1024 * 1024 // 200 MB limit
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.m4v']
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']
const CACHEABLE_EXTENSIONS = [...VIDEO_EXTENSIONS, ...IMAGE_EXTENSIONS]

// Track access times for LRU eviction
const accessTimes = new Map()

// Install event - cache essential assets
self.addEventListener('install', event => {
  console.log('[SW] Installing Video Cache Service Worker')
  self.skipWaiting()
})

// Activate event - cleanup old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activating Video Cache Service Worker')

  event.waitUntil(
    caches
      .keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(
              name =>
                name.startsWith('vibee-video-cache-') && name !== CACHE_NAME
            )
            .map(name => {
              console.log('[SW] Deleting old cache:', name)
              return caches.delete(name)
            })
        )
      })
      .then(() => self.clients.claim())
  )
})

// Fetch event - intercept video requests
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  const pathname = url.pathname

  // Only cache video and image files
  const isCacheable = CACHEABLE_EXTENSIONS.some(ext => pathname.endsWith(ext))
  if (!isCacheable) return

  // Skip HEAD requests — Cache API doesn't support them
  if (event.request.method === 'HEAD') return

  // Check if this is a range request (video seeking)
  const rangeHeader = event.request.headers.get('range')

  if (rangeHeader) {
    // Handle range requests specially
    event.respondWith(handleRangeRequest(event.request, rangeHeader))
  } else {
    // Standard cache-first strategy for full requests
    event.respondWith(handleCacheFirst(event.request))
  }
})

/**
 * Cache-first strategy for full video requests
 */
async function handleCacheFirst(request) {
  const cache = await caches.open(CACHE_NAME)

  // Try cache first
  const cachedResponse = await cache.match(request)
  if (cachedResponse) {
    // Update access time for LRU
    accessTimes.set(request.url, Date.now())
    console.log('[SW] Cache hit:', request.url)
    return cachedResponse
  }

  // Check if this is a Telegram image URL - proxy it through our API
  let fetchUrl = request.url
  if (
    request.url.includes('t.me/i/userpic/') ||
    request.url.includes('telegram.me')
  ) {
    // Прокси картинок Telegram.
    //
    // Был зашит vibee-api-server.fly.dev — площадка, с которой проект ушёл на
    // Railway; хост не отвечает (HTTP 000). То есть аватары авторов не
    // грузились вовсе, а service worker молча отдавал сетевой отказ.
    //
    // Живой прокси — тот же /proxy/image на рендер-сервере: им уже
    // пользуется сам рендер, подставляя аватары в ленту.
    //
    // Адрес литералом, а не из переменной: это файл из public/, Vite его не
    // обрабатывает и подстановки на сборке здесь не будет. Значение то же,
    // что стоит умолчанием у рендера (SELF_URL).
    fetchUrl =
      'https://vibee-render-production.up.railway.app/proxy/image?url=' +
      encodeURIComponent(request.url)
  }

  // Fetch from network
  console.log('[SW] Cache miss, fetching:', fetchUrl)
  try {
    const networkResponse = await fetch(fetchUrl)

    // Only cache successful responses
    if (networkResponse.ok) {
      // Clone response before caching
      const responseToCache = networkResponse.clone()

      // Track access time
      accessTimes.set(request.url, Date.now())

      // Cache in background and enforce quota
      cache
        .put(request, responseToCache)
        .then(() => {
          // Enforce quota after caching
          enforceQuota()
        })
        .catch(err => {
          console.warn('[SW] Failed to cache:', request.url, err)
        })
    } else {
      // Return empty/transparent image for failed avatar loads
      if (request.url.includes('userpic') || request.url.includes('avatar')) {
        const emptyGif =
          'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
        return new Response('', {
          status: 200,
          headers: { 'Content-Type': 'image/gif' },
        })
      }
    }

    return networkResponse
  } catch (error) {
    console.error('[SW] Fetch failed:', request.url, error)
    // Return empty response for avatar images on error
    if (request.url.includes('userpic') || request.url.includes('avatar')) {
      return new Response('', {
        status: 200,
        headers: { 'Content-Type': 'image/gif' },
      })
    }
    throw error
  }
}

/**
 * Handle range requests for video seeking
 * Serves partial content from cached full response
 */
async function handleRangeRequest(request, rangeHeader) {
  const cache = await caches.open(CACHE_NAME)

  // Try to get full video from cache
  const cachedResponse = await cache.match(request.url, { ignoreSearch: true })

  if (cachedResponse) {
    // Update access time for LRU
    accessTimes.set(request.url, Date.now())
    // Parse range header: "bytes=start-end"
    const rangeMatch = rangeHeader.match(/bytes=(\d+)-(\d*)/)
    if (!rangeMatch) {
      return cachedResponse
    }

    const start = parseInt(rangeMatch[1], 10)
    const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : undefined

    // Get the full blob
    const blob = await cachedResponse.blob()
    const totalSize = blob.size

    // Calculate actual end position
    const actualEnd =
      end !== undefined ? Math.min(end, totalSize - 1) : totalSize - 1

    // Slice the blob
    const slicedBlob = blob.slice(start, actualEnd + 1)

    // Create partial response
    return new Response(slicedBlob, {
      status: 206,
      statusText: 'Partial Content',
      headers: {
        'Content-Type':
          cachedResponse.headers.get('Content-Type') || 'video/mp4',
        'Content-Length': slicedBlob.size.toString(),
        'Content-Range': `bytes ${start}-${actualEnd}/${totalSize}`,
        'Accept-Ranges': 'bytes',
      },
    })
  }

  // Not cached - fetch from network with range header
  try {
    const networkResponse = await fetch(request)

    // If network returns full response, cache it for future range requests
    if (networkResponse.ok && !networkResponse.headers.get('content-range')) {
      const responseToCache = networkResponse.clone()
      cache.put(request.url, responseToCache).catch(() => {})
    }

    return networkResponse
  } catch (error) {
    console.error('[SW] Range fetch failed:', request.url, error)
    throw error
  }
}

/**
 * Message handler for cache management
 */
self.addEventListener('message', event => {
  const { type, payload } = event.data || {}

  switch (type) {
    case 'CLEAR_CACHE':
      caches.delete(CACHE_NAME).then(() => {
        console.log('[SW] Cache cleared')
        event.ports[0]?.postMessage({ success: true })
      })
      break

    case 'GET_CACHE_SIZE':
      getCacheSize().then(size => {
        event.ports[0]?.postMessage({ size })
      })
      break

    case 'PRECACHE_VIDEO':
      if (payload?.url) {
        precacheVideo(payload.url).then(success => {
          event.ports[0]?.postMessage({ success })
        })
      }
      break

    default:
      break
  }
})

/**
 * Get total cache size
 */
async function getCacheSize() {
  try {
    const cache = await caches.open(CACHE_NAME)
    const keys = await cache.keys()

    let totalSize = 0
    for (const request of keys) {
      const response = await cache.match(request)
      if (response) {
        const blob = await response.clone().blob()
        totalSize += blob.size
      }
    }

    return totalSize
  } catch {
    return 0
  }
}

/**
 * Enforce cache quota with LRU eviction
 * Removes oldest entries when cache exceeds MAX_CACHE_SIZE
 */
async function enforceQuota() {
  try {
    const cache = await caches.open(CACHE_NAME)
    const keys = await cache.keys()

    let totalSize = 0
    const entries = []

    for (const request of keys) {
      const response = await cache.match(request)
      if (response) {
        const blob = await response.clone().blob()
        const url = request.url
        entries.push({
          request,
          url,
          size: blob.size,
          accessTime: accessTimes.get(url) || 0,
        })
        totalSize += blob.size
      }
    }

    // LRU eviction if over limit
    if (totalSize > MAX_CACHE_SIZE) {
      console.log(
        `[SW] Cache over limit: ${(totalSize / 1024 / 1024).toFixed(1)}MB > ${MAX_CACHE_SIZE / 1024 / 1024}MB`
      )

      // Sort by access time (oldest first)
      entries.sort((a, b) => a.accessTime - b.accessTime)

      // Remove oldest until under 80% of limit
      const targetSize = MAX_CACHE_SIZE * 0.8
      while (totalSize > targetSize && entries.length > 0) {
        const oldest = entries.shift()
        await cache.delete(oldest.request)
        accessTimes.delete(oldest.url)
        totalSize -= oldest.size
        console.log(
          `[SW] Evicted: ${oldest.url} (${(oldest.size / 1024 / 1024).toFixed(1)}MB)`
        )
      }

      console.log(
        `[SW] Cache after eviction: ${(totalSize / 1024 / 1024).toFixed(1)}MB`
      )
    }
  } catch (error) {
    console.error('[SW] Quota enforcement failed:', error)
  }
}

/**
 * Precache a video URL
 */
async function precacheVideo(url) {
  try {
    const cache = await caches.open(CACHE_NAME)

    // Check if already cached
    const existing = await cache.match(url)
    if (existing) {
      console.log('[SW] Already cached:', url)
      return true
    }

    // Fetch and cache
    const response = await fetch(url)
    if (response.ok) {
      await cache.put(url, response)
      console.log('[SW] Precached:', url)
      return true
    }

    return false
  } catch (error) {
    console.error('[SW] Precache failed:', url, error)
    return false
  }
}
