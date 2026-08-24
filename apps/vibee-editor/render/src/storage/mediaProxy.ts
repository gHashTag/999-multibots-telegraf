import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import {
  GetObjectCommand,
  HeadObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3'

export interface MediaRange {
  start: number
  end: number
  length: number
}

type MediaEnvironment = Record<string, string | undefined>

const DEFAULT_PUBLIC_MEDIA_PREFIXES = ['images/relaunch/']
const SAFE_MEDIA_CONTENT_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
  'audio/aac',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
])

export function publicMediaPrefixes(env: MediaEnvironment): string[] {
  const configured = env.PUBLIC_MEDIA_PREFIXES?.trim()
  const prefixes = configured
    ? configured.split(',').map(prefix => prefix.trim())
    : DEFAULT_PUBLIC_MEDIA_PREFIXES

  if (
    !prefixes.length ||
    prefixes.some(prefix => {
      const segments = prefix.split('/').filter(Boolean)
      return (
        !prefix.endsWith('/') ||
        prefix.startsWith('/') ||
        prefix.includes('//') ||
        prefix.includes('\\') ||
        prefix.includes('\0') ||
        prefix.includes('*') ||
        segments.some(segment => segment === '.' || segment === '..')
      )
    })
  ) {
    throw new Error('PUBLIC_MEDIA_PREFIXES contains an invalid prefix')
  }

  return [...new Set(prefixes)].sort()
}

export function isPublicMediaKey(
  key: string,
  prefixes: readonly string[]
): boolean {
  return prefixes.some(prefix => key.startsWith(prefix))
}

const safeMediaContentType = (value?: string): string | null => {
  const normalized = (value || '').split(';', 1)[0].trim().toLowerCase()
  return SAFE_MEDIA_CONTENT_TYPES.has(normalized) ? normalized : null
}
export function mediaObjectKey(target?: string): string | null {
  const rawPath = (target || '/').split(/[?#]/, 1)[0]
  if (!rawPath.startsWith('/media/')) return null

  let key: string
  try {
    key = decodeURIComponent(rawPath.slice('/media/'.length))
  } catch {
    throw new Error('invalid media key encoding')
  }

  const segments = key.split('/')
  if (
    !key ||
    key.length > 2048 ||
    key.includes('\0') ||
    key.includes('\\') ||
    segments.some(segment => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error('invalid media key')
  }
  return key
}

export function parseMediaRange(
  header: string | undefined,
  size: number
): MediaRange | null {
  if (!header) return null
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new Error('invalid media range size')
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || (!match[1] && !match[2])) {
    throw new Error('invalid media range')
  }

  let start: number
  let end: number
  if (!match[1]) {
    const suffix = Number(match[2])
    if (!Number.isSafeInteger(suffix) || suffix <= 0 || size === 0) {
      throw new Error('unsatisfiable media range')
    }
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(match[1])
    end = match[2] ? Number(match[2]) : size - 1
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      start >= size ||
      end < start
    ) {
      throw new Error('unsatisfiable media range')
    }
    end = Math.min(end, size - 1)
  }

  return { start, end, length: end - start + 1 }
}

const publicHeaders = (
  contentType: string,
  contentLength: number,
  etag?: string,
  range?: MediaRange,
  totalSize?: number
): Record<string, string> => {
  const headers: Record<string, string> = {
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers':
      'Accept-Ranges, Content-Length, Content-Range, Content-Type, ETag',
    'Cache-Control': 'public, max-age=86400',
    'Content-Length': String(contentLength),
    'Content-Type': contentType || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
  }
  if (etag) headers.ETag = etag
  if (range && totalSize !== undefined) {
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${totalSize}`
  }
  return headers
}

/**
 * Stable public read proxy for the explicitly public media bucket. It exposes
 * no S3 credentials or internal endpoint and supports browser video seeking.
 */
export async function serveMediaRequest(
  req: IncomingMessage,
  res: ServerResponse,
  s3: S3Client,
  bucket: string,
  prefixes: readonly string[] = publicMediaPrefixes(process.env)
): Promise<boolean> {
  let key: string | null
  try {
    key = mediaObjectKey(req.url)
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'invalid_media_key' }))
    return true
  }
  if (key === null || (req.method !== 'GET' && req.method !== 'HEAD')) {
    return false
  }
  if (!isPublicMediaKey(key, prefixes)) {
    res.writeHead(404, {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
    })
    res.end(JSON.stringify({ error: 'media_not_found' }))
    return true
  }

  try {
    const head = await s3.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key })
    )
    const size = Number(head.ContentLength ?? 0)
    const contentType = safeMediaContentType(head.ContentType)
    if (!contentType) {
      res.writeHead(415, {
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff',
      })
      if (req.method === 'HEAD') res.end()
      else res.end(JSON.stringify({ error: 'unsupported_media_type' }))
      return true
    }
    let range: MediaRange | null
    try {
      range = parseMediaRange(
        typeof req.headers.range === 'string' ? req.headers.range : undefined,
        size
      )
    } catch {
      res.writeHead(416, {
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes */${size}`,
        'X-Content-Type-Options': 'nosniff',
      })
      res.end()
      return true
    }

    const headers = publicHeaders(
      contentType,
      range?.length ?? size,
      head.ETag,
      range ?? undefined,
      size
    )
    const status = range ? 206 : 200
    if (req.method === 'HEAD') {
      res.writeHead(status, headers)
      res.end()
      return true
    }

    const object = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ...(head.ETag ? { IfMatch: head.ETag } : {}),
        ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}),
      })
    )
    res.writeHead(status, headers)
    const body = object.Body as Readable | undefined
    if (!body || typeof body.pipe !== 'function') {
      throw new Error('media body is not streamable')
    }
    await pipeline(body, res)
    return true
  } catch {
    if (!res.headersSent) {
      res.writeHead(404, {
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff',
      })
      res.end(JSON.stringify({ error: 'media_not_found' }))
    } else {
      res.destroy()
    }
    return true
  }
}
