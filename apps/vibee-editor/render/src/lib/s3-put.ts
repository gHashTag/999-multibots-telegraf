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

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

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
