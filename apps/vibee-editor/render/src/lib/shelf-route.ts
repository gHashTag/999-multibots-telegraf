/**
 * THE SHELF SERVES WHAT WAS STORED.
 *
 * `GET /s3/<key>` is the public face of the media shelf: the player, the
 * renders, the providers and the send path all hand out links of this shape.
 * Until 2026-09-22 the route in `render-server.ts` split the world in two by
 * extension -- images, audio and `.json` were streamed back, and EVERYTHING
 * ELSE was downloaded, run through `ffmpeg -crf 23` and served from a cache.
 * Measured on production the same day:
 *
 *   - a 46 322 402-byte mp4 stored whole in the bucket came back from
 *     `/s3/` as 16 009 894 bytes: a re-encode, even to a person who asked
 *     for the file "as a document, without compression";
 *   - a `.zip` answered 500 `{"error":"Failed to process video"}` -- and so
 *     did every pdf, docx, xlsx, txt, csv and md on the shelf, because ffmpeg
 *     cannot make a video out of them;
 *   - `HEAD` answered 404, because only `GET` was routed.
 *
 * What this module does instead:
 *
 *   - anything that is not a video is served BYTE-IDENTICAL, streamed from
 *     the bucket, with a Content-Type chosen by the extension (an unknown
 *     extension is `application/octet-stream`, never ffmpeg), a
 *     Content-Length, `Range` (206/416) and `HEAD`;
 *   - a video is served as stored when it already plays in every browser
 *     (H.264 8-bit 4:2:0 + AAC/MP3 in an .mp4, not rotated -- ffprobe decides
 *     once and the verdict is kept on disk). Anything else -- the iPhone's
 *     HEVC `.mov` above all -- still gets the H.264 copy, because the player's
 *     `<video>`, Remotion's Chrome and the providers need something they can
 *     decode;
 *   - `?original=1` always answers the stored bytes, video or not.
 *
 * A document served from our own origin with its real type opens a door the
 * 500 used to keep shut: an `.html` or `.svg` a person uploaded would run
 * script on the render's origin. Those types go out under a sandboxing CSP,
 * and every response carries `nosniff`.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { execFile } from 'node:child_process'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, mkdtemp, rename, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

/* ── what a key is, by its extension ────────────────────────────────────── */

const TYPES: Readonly<Record<string, string>> = {
  // images
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  heic: 'image/heic',
  heif: 'image/heif',
  avif: 'image/avif',
  ico: 'image/x-icon',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  // audio. `.webm` is audio on this shelf: the mini app's voice recorder is
  // its only source (see the note in ChatAssets.tsx).
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  webm: 'audio/webm',
  // video
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  '3gp': 'video/3gpp',
  mpg: 'video/mpeg',
  mpeg: 'video/mpeg',
  wmv: 'video/x-ms-wmv',
  flv: 'video/x-flv',
  // documents
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  rtf: 'application/rtf',
  epub: 'application/epub+zip',
  // text
  txt: 'text/plain; charset=utf-8',
  log: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  markdown: 'text/markdown; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  tsv: 'text/tab-separated-values; charset=utf-8',
  json: 'application/json; charset=utf-8',
  yaml: 'application/yaml; charset=utf-8',
  yml: 'application/yaml; charset=utf-8',
  srt: 'application/x-subrip; charset=utf-8',
  vtt: 'text/vtt; charset=utf-8',
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  // archives
  zip: 'application/zip',
  '7z': 'application/x-7z-compressed',
  rar: 'application/vnd.rar',
  gz: 'application/gzip',
  tgz: 'application/gzip',
  tar: 'application/x-tar',
  bz2: 'application/x-bzip2',
  xz: 'application/x-xz',
}

/** The extensions that may need a playable copy. Everything else is bytes. */
const VIDEO_EXTENSIONS: ReadonlySet<string> = new Set([
  'mp4',
  'm4v',
  'mov',
  'mkv',
  'avi',
  '3gp',
  'mpg',
  'mpeg',
  'wmv',
  'flv',
])

/**
 * Types a browser would run script in when the link is opened directly. They
 * are served with their real type -- a person who uploaded a page gets a page
 * back -- but in a sandbox with no script and an opaque origin, so a file on
 * the shelf cannot act as the render server.
 */
const ACTIVE_TYPES: ReadonlySet<string> = new Set([
  'text/html',
  'image/svg+xml',
  'application/xml',
  'text/xml',
  'application/xhtml+xml',
])
const SANDBOX_CSP =
  "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'"

/** Stored under a timestamped key, a shelf object never changes. */
const IMMUTABLE = 'public, max-age=31536000'
/**
 * A video's default representation (as stored or the H.264 copy) is a
 * decision this code makes, and a decision can change with a deploy.
 */
const DECIDED = 'public, max-age=3600'

/** The lower-case extension of the key's last segment, without the dot. */
export function shelfExtension(key: string): string {
  const last = String(key).split('/').pop() ?? ''
  const dot = last.lastIndexOf('.')
  return dot > 0 ? last.slice(dot + 1).toLowerCase() : ''
}

/** Content-Type by extension; an unknown one is plain bytes. */
export function shelfContentType(key: string): string {
  return TYPES[shelfExtension(key)] ?? 'application/octet-stream'
}

/** A key whose default representation may be an H.264 copy. */
export function isShelfVideo(key: string): boolean {
  return VIDEO_EXTENSIONS.has(shelfExtension(key))
}

/** `?original=1` (or `true`): the stored bytes, whatever they are. */
export function wantsOriginal(query: URLSearchParams): boolean {
  const v = (query.get('original') ?? '').toLowerCase()
  return v === '1' || v === 'true'
}

/* ── ranges ──────────────────────────────────────────────────────────────── */

export type ByteRange = { start: number; end: number }

/**
 * One byte range out of a `Range` header, per RFC 9110 §14.
 *
 * `null` means "serve the whole thing": no header, a header this does not
 * understand, several ranges, or first > last -- all of which a server may
 * ignore. `'unsatisfiable'` is the 416 case: a start past the end, or a
 * zero-length suffix.
 */
export function parseByteRange(
  header: string | undefined,
  size: number
): ByteRange | 'unsatisfiable' | null {
  if (!header) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m) return null
  const [, first, last] = m
  if (first === '' && last === '') return null
  if (first === '') {
    const suffix = Number(last)
    if (!Number.isSafeInteger(suffix)) return null
    if (suffix === 0 || size === 0) return 'unsatisfiable'
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }
  const start = Number(first)
  const end = last === '' ? size - 1 : Number(last)
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null
  if (last !== '' && end < start) return null
  if (start >= size) return 'unsatisfiable'
  return { start, end: Math.min(end, size - 1) }
}

/* ── one way to answer with bytes ────────────────────────────────────────── */

export interface BodySource {
  size: number
  type: string
  cacheControl: string
  etag?: string
  lastModified?: Date
  /** Opened only for GET, and only after the status is known. */
  open: (range?: ByteRange) => Promise<Readable> | Readable
}

function headerOf(req: IncomingMessage, name: string): string | undefined {
  const v = req.headers[name]
  return Array.isArray(v) ? v[0] : v
}

/**
 * Status, headers and body for one representation -- the S3 object or the
 * local H.264 copy go through the same door, so HEAD, Range and the headers
 * cannot drift apart between them.
 *
 * The body is STREAMED: nothing here holds a file in memory, and a client
 * that hangs up tears down the source stream with it (that is `pipeline`).
 */
export async function sendBody(
  req: IncomingMessage,
  res: ServerResponse,
  src: BodySource
): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': src.type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': src.cacheControl,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers':
      'Content-Length, Content-Range, Accept-Ranges',
    'X-Content-Type-Options': 'nosniff',
  }
  if (ACTIVE_TYPES.has(src.type.split(';')[0].trim())) {
    headers['Content-Security-Policy'] = SANDBOX_CSP
  }
  if (src.etag) headers.ETag = src.etag
  if (src.lastModified)
    headers['Last-Modified'] = src.lastModified.toUTCString()

  const range = parseByteRange(headerOf(req, 'range'), src.size)
  if (range === 'unsatisfiable') {
    res.writeHead(416, {
      ...headers,
      'Content-Range': `bytes */${src.size}`,
      'Content-Length': '0',
    })
    res.end()
    return
  }
  const status = range ? 206 : 200
  headers['Content-Length'] = String(
    range ? range.end - range.start + 1 : src.size
  )
  if (range) {
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${src.size}`
  }
  if (req.method === 'HEAD') {
    res.writeHead(status, headers)
    res.end()
    return
  }
  // Opened BEFORE the head is written: a source that fails to open can still
  // be answered with an error status instead of a truncated 200.
  const body = await src.open(range ?? undefined)
  res.writeHead(status, headers)
  try {
    await pipeline(body, res)
  } catch (e) {
    // The client left, or the source broke mid-stream. The head is gone, so
    // there is no status left to change; pipeline has destroyed both ends.
    const code = (e as { code?: string })?.code
    if (code !== 'ERR_STREAM_PREMATURE_CLOSE') {
      console.warn(
        `[shelf] stream broke after the head: ${String(e).slice(0, 160)}`
      )
    }
  }
}

/* ── the route ───────────────────────────────────────────────────────────── */

export interface ShelfMeta {
  size: number
  etag?: string
  lastModified?: Date
}

/** The bucket, as the route needs it. `stat` answers null for a missing key. */
export interface ShelfStore {
  stat(key: string): Promise<ShelfMeta | null>
  open(key: string, range?: ByteRange): Promise<Readable>
}

export type Playable = { kind: 'original' } | { kind: 'file'; path: string }

/** Decides what a video's default representation is. */
export interface ShelfVideo {
  playable(key: string): Promise<Playable>
}

/** The key a video outlet could not find in the bucket. */
export class ShelfMissing extends Error {
  constructor(key: string) {
    super(`not on the shelf: ${key}`)
    this.name = 'ShelfMissing'
  }
}

/** The bucket's own word for a missing key, as the S3 SDK raises it. */
function isNoSuchKey(e: unknown): boolean {
  const name = (e as { name?: string })?.name
  return name === 'NoSuchKey' || name === 'NotFound'
}

function answerJson(res: ServerResponse, status: number, body: object): void {
  if (res.headersSent) {
    res.destroy()
    return
  }
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(JSON.stringify(body))
}

/**
 * `GET` or `HEAD` `/s3/<key>[?original=1]`.
 *
 * The key is everything after `/s3/` up to the query, percent-decoded -- the
 * same reading the old route did, deliberately without URL normalisation: a
 * bucket key is a flat string, and `..` in it names an object, not a parent.
 */
export async function serveShelfRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: { store: ShelfStore; video?: ShelfVideo }
): Promise<void> {
  const raw = req.url ?? ''
  const q = raw.indexOf('?')
  const pathPart = q === -1 ? raw : raw.slice(0, q)
  const query = new URLSearchParams(q === -1 ? '' : raw.slice(q + 1))
  if (!pathPart.startsWith('/s3/')) {
    answerJson(res, 404, { error: 'File not found' })
    return
  }
  let key: string
  try {
    key = decodeURIComponent(pathPart.slice('/s3/'.length))
  } catch {
    answerJson(res, 400, { error: 'bad key' })
    return
  }
  if (!key || key.includes('\0')) {
    answerJson(res, 400, { error: 'bad key' })
    return
  }

  const original = wantsOriginal(query)
  const video = isShelfVideo(key)
  try {
    if (video && !original && deps.video) {
      const playable = await deps.video.playable(key)
      if (playable.kind === 'file') {
        const st = await stat(playable.path)
        await sendBody(req, res, {
          size: st.size,
          type: 'video/mp4',
          cacheControl: DECIDED,
          open: r =>
            createReadStream(
              playable.path,
              r ? { start: r.start, end: r.end } : {}
            ),
        })
        return
      }
    }
    const meta = await deps.store.stat(key)
    if (!meta) {
      answerJson(res, 404, { error: 'File not found' })
      return
    }
    await sendBody(req, res, {
      size: meta.size,
      type: shelfContentType(key),
      cacheControl: video && !original ? DECIDED : IMMUTABLE,
      etag: meta.etag,
      lastModified: meta.lastModified,
      open: r => deps.store.open(key, r),
    })
  } catch (e) {
    // An object deleted between the stat and the read is still "not on the
    // shelf": the bucket says NoSuchKey on the GET, and that is a 404.
    if (e instanceof ShelfMissing || isNoSuchKey(e)) {
      answerJson(res, 404, { error: 'File not found' })
      return
    }
    console.error(`[shelf] ${key}: ${String(e).slice(0, 200)}`)
    answerJson(res, 502, { error: 'The shelf could not be read' })
  }
}

/* ── the video decision ──────────────────────────────────────────────────── */

export interface ProbeStream {
  codec_type?: string
  codec_name?: string
  pix_fmt?: string
  tags?: Record<string, string>
  side_data_list?: Array<{ rotation?: number | string }>
  disposition?: { attached_pic?: number }
}
export interface ProbeResult {
  format?: { format_name?: string; tags?: Record<string, string> }
  streams?: ProbeStream[]
}

function rotated(s: ProbeStream): boolean {
  const tag = Number(s.tags?.rotate ?? 0)
  if (Number.isFinite(tag) && tag % 360 !== 0) return true
  return (s.side_data_list ?? []).some(d => {
    const r = Number(d.rotation ?? 0)
    return Number.isFinite(r) && r % 360 !== 0
  })
}

/**
 * Does the stored file already play everywhere the shelf's links go?
 *
 * The bar is the browser's, because the player's `<video>` and Remotion's
 * Chrome are the strictest readers of these links: H.264 in 8-bit 4:2:0 (a
 * High 10 or 4:2:2 stream is still "h264" and still black in Chrome), AAC or
 * MP3 sound, one picture track, an ISO mp4 rather than a QuickTime file
 * wearing the name, and no rotation flag (the transcode bakes rotation into
 * the pixels; a player that ignores the flag shows a sideways person).
 * Anything short of that keeps the H.264 copy it always had.
 */
export function playsAsStored(key: string, probe: ProbeResult): boolean {
  const ext = shelfExtension(key)
  if (ext !== 'mp4' && ext !== 'm4v') return false
  const formats = String(probe.format?.format_name ?? '').split(',')
  if (!formats.includes('mp4')) return false
  const brand = String(probe.format?.tags?.major_brand ?? '').trim()
  if (brand === 'qt') return false
  const streams = probe.streams ?? []
  const pictures = streams.filter(
    s => s.codec_type === 'video' && !s.disposition?.attached_pic
  )
  const sounds = streams.filter(s => s.codec_type === 'audio')
  if (pictures.length !== 1 || sounds.length > 1) return false
  const v = pictures[0]
  if (v.codec_name !== 'h264') return false
  if (v.pix_fmt !== 'yuv420p' && v.pix_fmt !== 'yuvj420p') return false
  if (rotated(v)) return false
  if (sounds.length && !['aac', 'mp3'].includes(String(sounds[0].codec_name)))
    return false
  return true
}

/** What the outlet needs from the outside world; tests pass fakes. */
export interface VideoTools {
  cacheDir: string
  /**
   * Copy the stored object to `dest`. 'missing' when the key is not there,
   * 'too-big' when it is larger than this server will transcode.
   */
  download(key: string, dest: string): Promise<'ok' | 'missing' | 'too-big'>
  /** ffprobe's JSON for the file, or null when it cannot be read as media. */
  probe(file: string): Promise<ProbeResult | null>
  transcode(src: string, dest: string): Promise<void>
  /** How many transcodes may run at once (default 2). */
  parallel?: number
}

/** A small FIFO semaphore: at most `n` jobs at a time, the slot handed over. */
function limiter(n: number) {
  let active = 0
  const waiting: Array<() => void> = []
  return async <T>(job: () => Promise<T>): Promise<T> => {
    if (active < n) active++
    else await new Promise<void>(r => waiting.push(r))
    try {
      return await job()
    } finally {
      const next = waiting.shift()
      if (next) next()
      else active--
    }
  }
}

/** The cache file for a key: readable, bounded, and unique per key. */
export function h264CacheName(key: string): string {
  const readable = key
    .replace(/\//g, '-')
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .slice(-100)
  const tag = createHash('sha256').update(key).digest('hex').slice(0, 12)
  return `${readable}-${tag}-h264.mp4`
}

/**
 * The outlet behind a video's default link.
 *
 * On disk, per key, at most one of: `<name>` -- the H.264 copy -- or
 * `<name>.original` -- a marker that the stored bytes already play. Either
 * answers every later request without touching the bucket twice. The first
 * request downloads, probes once and, only if needed, transcodes; requests
 * that arrive meanwhile wait for that same work instead of starting their own
 * (a `<video>` element opens two or three ranged requests at once, and the
 * old code let each of them run ffmpeg on the same file).
 *
 * The copy is written under a temporary name and renamed into place, so no
 * request ever serves a half-written file. When the probe or the transcode
 * fails, the answer is the stored bytes -- not a 500 -- and nothing is
 * remembered, so the next request tries again.
 */
export function createShelfVideo(tools: VideoTools): ShelfVideo {
  const inflight = new Map<string, Promise<Playable>>()
  const gate = limiter(Math.max(1, tools.parallel ?? 2))

  async function decide(key: string): Promise<Playable> {
    const copy = join(tools.cacheDir, h264CacheName(key))
    const marker = `${copy}.original`
    if (existsSync(copy)) return { kind: 'file', path: copy }
    if (existsSync(marker)) return { kind: 'original' }

    await mkdir(tools.cacheDir, { recursive: true })
    // The download is scratch: outside the cache, which only ever holds
    // finished copies and markers.
    const work = await mkdtemp(join(tmpdir(), 'shelf-video-'))
    try {
      const ext = shelfExtension(key)
      const source = join(work, ext ? `source.${ext}` : 'source')
      const got = await tools.download(key, source)
      if (got === 'missing') throw new ShelfMissing(key)
      if (got === 'too-big') {
        console.warn(`[shelf] ${key}: too big to transcode, serving as stored`)
        return { kind: 'original' }
      }
      const probe = await tools.probe(source)
      if (!probe) {
        console.warn(
          `[shelf] ${key}: ffprobe could not read it, serving as stored`
        )
        return { kind: 'original' }
      }
      if (playsAsStored(key, probe)) {
        await writeFile(marker, '')
        console.log(`[shelf] ${key}: plays as stored, no transcode`)
        return { kind: 'original' }
      }
      const part = `${copy}.part-${randomBytes(4).toString('hex')}`
      try {
        await gate(() => tools.transcode(source, part))
        await rename(part, copy)
      } catch (e) {
        await rm(part, { force: true }).catch(() => undefined)
        console.warn(
          `[shelf] ${key}: transcode failed, serving as stored: ${String(e).slice(0, 160)}`
        )
        return { kind: 'original' }
      }
      console.log(`[shelf] ${key}: H.264 copy made`)
      return { kind: 'file', path: copy }
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  return {
    playable(key: string): Promise<Playable> {
      const running = inflight.get(key)
      if (running) return running
      const p = decide(key).finally(() => inflight.delete(key))
      inflight.set(key, p)
      return p
    },
  }
}

/* ── the real ffprobe and ffmpeg ─────────────────────────────────────────── */

function run(
  cmd: string,
  args: string[],
  timeoutMs: number
): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => (err ? reject(err) : resolve({ stdout: String(stdout) }))
    )
  })
}

/**
 * Paths reach ffmpeg only if they are absolute: an absolute path cannot start
 * with `-`, so no value here can become an option. Every path the outlet
 * builds is absolute; this makes that a rule rather than a habit.
 */
function absolute(p: string): string {
  if (!isAbsolute(p)) throw new Error(`not an absolute path: ${p.slice(0, 60)}`)
  return p
}

/** ffprobe's streams and format as JSON, or null when it cannot read the file. */
export async function ffprobeJson(file: string): Promise<ProbeResult | null> {
  try {
    const { stdout } = await run(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_streams',
        '-show_format',
        '-of',
        'json',
        absolute(file),
      ],
      30_000
    )
    const parsed = JSON.parse(stdout) as ProbeResult
    return parsed && Array.isArray(parsed.streams) ? parsed : null
  } catch {
    return null
  }
}

/**
 * The same H.264 copy the route has always made -- libx264, preset fast,
 * CRF 23, AAC, faststart -- with two changes:
 *
 *   - it no longer blocks the event loop: the old `execFileSync` froze every
 *     other request of the server for up to five minutes while one video
 *     converted;
 *   - `-pix_fmt yuv420p`: an iPhone's HDR clip is 10-bit HEVC, and libx264
 *     keeps the bit depth unless told otherwise, so the "playable" copy came
 *     out as High 10 -- which Chrome does not decode either.
 */
export async function ffmpegH264(src: string, dest: string): Promise<void> {
  await run(
    'ffmpeg',
    [
      '-v',
      'error',
      '-i',
      absolute(src),
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-movflags',
      '+faststart',
      '-f',
      'mp4',
      '-y',
      absolute(dest),
    ],
    300_000
  )
}
