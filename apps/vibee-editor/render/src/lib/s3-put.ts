/**
 * ONE PUT TO THE SHELF, SHARED.
 *
 * `render-server.ts` has always had `uploadToS3(buffer, filename, contentType)`
 * as a module-private function -- fine while the server was the only thing
 * that wrote to the bucket. The CRM ingest (`crm-memory-tools.ts`) now needs
 * to put a downloaded Telegram photo or voice note on the same shelf, and it
 * cannot import the server: `render-server.ts` starts listening at import
 * time and already imports the tool registry, so that would be a cycle that
 * boots the server inside a tool.
 *
 * Hence the smallest shared piece: the PutObject and the public URL of the
 * key. The client is built from the same variables, with the same
 * path-style rule, as the one in `render-server.ts` (see the comment there
 * about MinIO and `forcePathStyle`); `src/lib/transcribe.ts` already keeps a
 * second client the same way. The signed-URL half of the server's helper is
 * not needed here and stays where it was.
 *
 * The URL returned is the PROXY one -- `${PUBLIC_URL}/s3/<key>` -- because
 * that is the only origin `media-parts.ts` lets a provider fetch from, and
 * the point of storing media is that a provider can be handed the link.
 */

import { createWriteStream } from 'node:fs'
import { once } from 'node:events'
import { Readable } from 'node:stream'
import { finished } from 'node:stream/promises'
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'

const S3_ENDPOINT =
  process.env.AWS_ENDPOINT_URL_S3 || 'https://fly.storage.tigris.dev'
const S3_BUCKET =
  process.env.BUCKET_NAME || process.env.S3_BUCKET || 'vibee-assets'
const useCustomEndpoint = Boolean(process.env.AWS_ENDPOINT_URL_S3)
const forcePathStyle =
  process.env.S3_FORCE_PATH_STYLE === 'false' ? false : useCustomEndpoint

let client: S3Client | null = null
function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      region: process.env.AWS_REGION || 'auto',
      endpoint: S3_ENDPOINT,
      forcePathStyle,
      credentials: process.env.AWS_ACCESS_KEY_ID
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
          }
        : undefined,
    })
  }
  return client
}

/** The shelf's public origin, the same fallback as everywhere else. */
export function shelfBase(): string {
  return (
    process.env.PUBLIC_URL || 'https://vibee-render-production.up.railway.app'
  ).replace(/\/+$/, '')
}

/** `${PUBLIC_URL}/s3/<key>` -- the proxy URL the provider may be handed. */
export function shelfUrlFor(key: string): string {
  return `${shelfBase()}/s3/${key}`
}

/** The key the server has always used: a timestamp and a sanitised name. */
export function assetKeyFor(filename: string): string {
  const safe =
    String(filename || '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .slice(0, 160) || `file-${Date.now()}`
  return `assets/${Date.now()}-${safe}`
}

/**
 * Put the bytes under `key`. Throws on failure -- the two callers decide what
 * a failed put means (the server answers 500; the ingest skips the file).
 */
export async function s3PutObject(
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  await s3().send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  )
}

/**
 * Read at most `maxBytes` of `key`, straight from the bucket.
 *
 * NOT over `${PUBLIC_URL}/s3/<key>`, and that is the whole reason this exists.
 * Until 2026-09-22 the proxy route branched on the extension: images, audio
 * and `.json` were streamed back, and EVERYTHING ELSE -- including every text
 * document -- fell into the branch that downloaded the object and ran ffmpeg
 * on it to transcode a video, so a `.txt` came back as an ffmpeg failure.
 * The route now serves documents as stored (`src/lib/shelf-route.ts`), but
 * reading by key stays the rule here: a URL is a thing a pasted marker line
 * can aim, a key on our own shelf is not.
 *
 * The cap is a `Range` header rather than a slice afterwards: the object is a
 * file a PERSON attached, so its size is their choice, and a gigabyte would
 * otherwise be pulled into this process in full before anything trimmed it.
 * S3 answers 206 with the partial body and returns a shorter object whole.
 */
export async function s3GetBytes(
  key: string,
  maxBytes: number
): Promise<Buffer> {
  const cap = Math.max(1, Math.floor(maxBytes))
  const got = await s3().send(
    new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Range: `bytes=0-${cap - 1}`,
    })
  )
  const body = got.Body as AsyncIterable<Uint8Array> | undefined
  if (!body) return Buffer.alloc(0)
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of body) {
    chunks.push(Buffer.from(chunk))
    total += chunk.length
    // A server that ignores the range must not become unbounded memory here.
    if (total >= cap) break
  }
  return Buffer.concat(chunks).subarray(0, cap)
}

/**
 * Copy the WHOLE of `key` into a local file, or answer null when it is larger
 * than `maxBytes`. Returns the size written.
 *
 * The twin of `s3GetBytes` for files that are useless cut short: half a PDF or
 * the first 20 MB of an mp4 whose index sits at the end cannot be opened, so a
 * truncated read would be reported as a damaged file instead of a large one.
 * The range asks for ONE byte more than the cap -- receiving it is how "larger
 * than allowed" is known without a second request. Streamed to disk, so a
 * 100 MB video never sits in this process's memory.
 */
export async function s3GetToFile(
  key: string,
  path: string,
  maxBytes: number,
  signal?: AbortSignal
): Promise<number | null> {
  const cap = Math.max(1, Math.floor(maxBytes))
  const got = await s3().send(
    new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Range: `bytes=0-${cap}`,
    }),
    signal ? { abortSignal: signal } : undefined
  )
  const body = got.Body as AsyncIterable<Uint8Array> | undefined
  const out = createWriteStream(path)
  let total = 0
  let tooBig = false
  try {
    if (body) {
      for await (const chunk of body) {
        total += chunk.length
        if (total > cap) {
          tooBig = true
          break
        }
        if (!out.write(chunk)) await once(out, 'drain')
      }
    }
  } finally {
    out.end()
    await finished(out).catch(() => undefined)
  }
  return tooBig ? null : total
}

/** A missing key, in any of the spellings the SDK and S3 clones use. */
export function isMissingObject(e: unknown): boolean {
  const err = e as {
    name?: string
    Code?: string
    $metadata?: { httpStatusCode?: number }
  }
  return (
    err?.name === 'NoSuchKey' ||
    err?.name === 'NotFound' ||
    err?.Code === 'NoSuchKey' ||
    err?.$metadata?.httpStatusCode === 404
  )
}

/**
 * Size and validators of `key`, or null when there is no such object -- the
 * `/s3/` route's `stat` (see `src/lib/shelf-route.ts`).
 */
export async function s3Stat(
  key: string
): Promise<{ size: number; etag?: string; lastModified?: Date } | null> {
  try {
    const h = await s3().send(
      new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key })
    )
    return {
      size: Number(h.ContentLength ?? 0),
      etag: h.ETag,
      lastModified: h.LastModified,
    }
  } catch (e) {
    if (isMissingObject(e)) return null
    throw e
  }
}

/**
 * A stream of `key`, or of the inclusive byte range asked for -- the `/s3/`
 * route's `open`. The range goes to the bucket, so a player seeking to the
 * end of a 100 MB video pulls the end, not the whole file.
 */
export async function s3OpenStream(
  key: string,
  range?: { start: number; end: number }
): Promise<Readable> {
  const got = await s3().send(
    new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}),
    })
  )
  const body = got.Body as Readable | undefined
  return body ?? Readable.from([])
}

/** Bytes in, our own URL out. */
export async function s3PutBytes(
  body: Buffer,
  filename: string,
  contentType: string
): Promise<{ key: string; url: string }> {
  const key = assetKeyFor(filename)
  await s3PutObject(key, body, contentType)
  return { key, url: shelfUrlFor(key) }
}
