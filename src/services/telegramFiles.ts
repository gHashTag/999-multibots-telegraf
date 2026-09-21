/**
 * READING A FILE A PERSON SENT TO A BOT, WHEREVER THAT BOT'S FILES LIVE.
 *
 * Cloud bots: nothing changes. `getFile` answers a relative path, the bytes are
 * at `https://api.telegram.org/file/bot<token>/<path>`, and that URL is what
 * every scene has always handed to providers.
 *
 * Bots on our own Bot API server (`--local`): `getFile` answers an ABSOLUTE
 * path on that server's disk. Telegraf's `getFileLink` turns it into a
 * `file:///var/lib/...` URL, which is useless anywhere but inside that
 * container. The bytes are served by the server's private file endpoint
 * (deployment/telegram-bot-api/file-server.mjs), which nothing outside our
 * Railway project can reach -- so a provider cannot fetch them either. They are
 * therefore STREAMED onto our shelf, and the shelf's public URL is what leaves
 * the building. As a side effect, no token-bearing URL reaches a provider for
 * those bots at all.
 *
 * Streaming, not buffering: a local bot may receive 2000 MB. The source body is
 * piped through a byte counter into the shelf upload; this process holds one
 * chunk at a time, and the counter aborts the moment the ceiling is crossed.
 */

import { basename } from 'node:path'
import {
  botApiIsLocalFor,
  botIdOfToken,
  telegramDownloadLimitFor,
  telegramFileUrlFor,
} from './telegramApi'
import { putStream } from './contentFactory/storage'
import { SHELF_UPLOAD_LIMIT } from './contentFactory/shelfLimit'

export interface TelegramFileRef {
  file_id?: string
  file_path?: string
  file_size?: number
}

/** The file is bigger than what this bot's server or our shelf will carry. */
export class TelegramFileTooBig extends Error {
  constructor(
    readonly bytes: number,
    readonly limit: number
  ) {
    super(`file of ${bytes} bytes is over the limit of ${limit} bytes`)
    this.name = 'TelegramFileTooBig'
  }
}

/** The bytes could not be read from the Bot API server. */
export class TelegramFileDownloadFailed extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TelegramFileDownloadFailed'
  }
}

/**
 * The largest file that can go from this bot to our shelf: the smaller of what
 * its Bot API server hands over (20 MB cloud, 2000 MB ours) and what the shelf
 * accepts.
 */
export function mirrorLimitFor(token: string | null | undefined): number {
  return Math.min(telegramDownloadLimitFor(token), SHELF_UPLOAD_LIMIT)
}

/**
 * A pass-through that counts bytes and fails the stream once `limit` is
 * crossed, so an undeclared oversized file is stopped mid-flight rather than
 * after it has been stored.
 */
export function byteLimiter(limit: number): {
  stream: TransformStream<Uint8Array, Uint8Array>
  seen: () => number
  tripped: () => boolean
} {
  let seen = 0
  let tripped = false
  const stream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      seen += chunk.byteLength
      if (seen > limit) {
        tripped = true
        controller.error(new TelegramFileTooBig(seen, limit))
        return
      }
      controller.enqueue(chunk)
    },
  })
  return { stream, seen: () => seen, tripped: () => tripped }
}

export interface MirrorOptions {
  /** Telegram's own `file_size`, when it gave one. */
  declaredBytes?: number | null
  /** A tighter limit than the bot's own; never a looser one. */
  limit?: number
  fetchImpl?: typeof fetch
  put?: typeof putStream
}

/**
 * Streams one Telegram file onto our shelf. Throws TelegramFileTooBig,
 * TelegramFileDownloadFailed, or the shelf's own error.
 *
 * Never puts the source URL into an error or a log: it carries the token
 * (in the path, for both the cloud and our server).
 */
export async function mirrorTelegramFile(
  token: string,
  filePath: string,
  name: string,
  options: MirrorOptions = {}
): Promise<{ url: string; bytes: number }> {
  const fetchImpl = options.fetchImpl ?? fetch
  const put = options.put ?? putStream
  const limit = Math.min(
    mirrorLimitFor(token),
    options.limit ?? Number.POSITIVE_INFINITY
  )

  const declared = Number(options.declaredBytes)
  if (Number.isFinite(declared) && declared > limit) {
    throw new TelegramFileTooBig(declared, limit)
  }

  let res: Response
  try {
    res = await fetchImpl(telegramFileUrlFor(token, filePath))
  } catch (e) {
    throw new TelegramFileDownloadFailed(
      `download failed: ${e instanceof Error ? e.name : 'error'}`
    )
  }
  if (!res.ok || !res.body) {
    throw new TelegramFileDownloadFailed(`download failed: HTTP ${res.status}`)
  }
  const length = Number(res.headers.get('content-length'))
  if (Number.isFinite(length) && length > limit) {
    await res.body.cancel().catch(() => undefined)
    throw new TelegramFileTooBig(length, limit)
  }

  const limiter = byteLimiter(limit)
  let url: string
  try {
    url = (await put(res.body.pipeThrough(limiter.stream), name)).url
  } catch (e) {
    if (limiter.tripped()) throw new TelegramFileTooBig(limiter.seen(), limit)
    throw e
  }
  if (limiter.tripped()) throw new TelegramFileTooBig(limiter.seen(), limit)
  if (limiter.seen() === 0) {
    throw new TelegramFileDownloadFailed('download failed: empty body')
  }
  return { url, bytes: limiter.seen() }
}

/*
 * One file, one upload. A scene often asks for the same link twice (once to
 * validate, once to generate); without this a 1 GB video would cross the
 * network twice. Bounded, and keyed by bot id so two bots never share an entry.
 */
const MIRRORED = new Map<string, string>()
const MIRRORED_MAX = 500

/**
 * A URL a third party can fetch for this file.
 *
 * Cloud bot: the Telegram file URL, exactly as before (it carries the token,
 * as it always has -- that is the cloud's design, and out of scope here).
 * Bot on our server: the file is streamed onto our shelf first and the shelf's
 * URL is returned.
 */
export async function telegramFileLink(
  token: string,
  file: TelegramFileRef,
  name?: string,
  options: MirrorOptions = {}
): Promise<string> {
  const filePath = file?.file_path
  if (!filePath) throw new Error('telegramFileLink: getFile gave no file_path')
  if (!botApiIsLocalFor(token)) return telegramFileUrlFor(token, filePath)

  const key = `${botIdOfToken(token)}|${filePath}`
  const cached = MIRRORED.get(key)
  if (cached) return cached

  const { url } = await mirrorTelegramFile(
    token,
    filePath,
    name || basename(filePath),
    { declaredBytes: file.file_size ?? null, ...options }
  )
  if (MIRRORED.size >= MIRRORED_MAX) {
    MIRRORED.delete(MIRRORED.keys().next().value as string)
  }
  MIRRORED.set(key, url)
  return url
}

export function forgetMirroredForTests(): void {
  MIRRORED.clear()
}

const INSTALLED = Symbol.for('telegramFiles.localFileLinks')

/**
 * Make Telegraf's own `getFileLink` work for bots on our server.
 *
 * About thirty scenes call `ctx.telegram.getFileLink(...)` and hand the result
 * to a provider. Telegraf builds a fresh client per update (`ctx.telegram` is
 * not `bot.telegram`), so patching one instance reaches nothing; the method is
 * replaced on the class, once, at startup (src/index.ts).
 *
 * For a cloud bot the original runs untouched. For a bot on our server the
 * original would return a `file:` URL; this returns the shelf URL instead.
 */
export function installLocalFileLinks(TelegramClass: { prototype: any }): void {
  const proto = TelegramClass.prototype
  if (proto[INSTALLED]) return
  const original = proto.getFileLink
  proto.getFileLink = async function getFileLink(
    this: any,
    fileId: string | TelegramFileRef
  ): Promise<URL> {
    if (!botApiIsLocalFor(this.token)) return original.call(this, fileId)
    const file: TelegramFileRef =
      typeof fileId === 'string'
        ? await this.getFile(fileId)
        : fileId.file_path === undefined
          ? await this.getFile(fileId.file_id)
          : fileId
    return new URL(await telegramFileLink(this.token, file))
  }
  proto[INSTALLED] = true
}
