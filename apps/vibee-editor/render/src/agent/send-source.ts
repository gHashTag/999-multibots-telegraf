/**
 * THE BYTES A SEND CARRIES ARE THE BYTES THAT WERE STORED.
 *
 * A file sent from a person's own Telegram session (`tg_send_document`,
 * `tg_send_video`, `tg_send_voice`, a video note) used to be fetched over
 * HTTP from whatever URL the draft named -- for our own shelf that meant the
 * `/s3/` route, and on 2026-09-22 that route re-encoded every video
 * (46 322 402 bytes in, 16 009 894 out) and answered 500 for every zip, pdf
 * or docx. The owner pressed "send as a document", and a stranger's
 * re-encode, or nothing, went out under his name.
 *
 * Now there are exactly two roads, and both end in a private local file that
 * is removed when the send is over:
 *
 *   OUR SHELF -- the object is read from the bucket BY KEY (`withShelfFile`):
 *     the original bytes, no HTTP, no transcode, no URL for anyone to aim.
 *
 *   ANYWHERE ELSE -- downloaded under the same rules the render applies to
 *     every other fetched media (`downloadBoundedMediaToFile`): https only,
 *     the host must resolve to public addresses only and the connection is
 *     pinned to the address that was checked, no redirects, a size cap and a
 *     deadline. A refusal is a sentence the owner can act on.
 *
 * WHY A FILE AND NOT A BUFFER. GramJS reads an upload larger than 20 MB from
 * `CustomFile.path` -- never from its buffer (`getFileBuffer` in
 * telegram/client/uploads.js). The old code built `CustomFile(name, size, '',
 * buffer)`, so every file over 20 MB died with the library's own "Either one
 * of `buffer` or `filePath` should be specified" -- the exact text the owner
 * got for a 46 MB document. A path works at every size.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { shelfObject } from './media-parts'
import { extensionOf, withShelfFile } from './media-extract'
import {
  downloadBoundedMediaToFile,
  type AddressLookup,
} from '../lib/remoteMediaDuration'
import { isMissingObject } from '../lib/s3-put'

/** Our own shelf: the upload route takes 100 MB, Telegram takes 2 GB. */
export const SHELF_SEND_MAX_BYTES = 512 * 1024 * 1024
/** Somebody else's server: the cap this send path always had. */
export const FOREIGN_SEND_MAX_BYTES = 50 * 1024 * 1024
const SHELF_READ_MS = 120_000
const FOREIGN_READ_MS = 60_000

const MB = 1024 * 1024

export interface LocalCopy {
  path: string
  size: number
}

/**
 * The network seam for tests. Production passes nothing: the download
 * resolves the host itself and pins the socket to the checked address. A
 * test either replaces the lookup (and so proves a private address is
 * refused before any socket opens) or replaces fetch entirely.
 */
let downloadDeps: { fetchImpl?: typeof fetch; lookupImpl?: AddressLookup } = {}
export function useDownloadForTests(
  deps: { fetchImpl?: typeof fetch; lookupImpl?: AddressLookup } | null
): void {
  downloadDeps = deps ?? {}
}

/** Is this URL an object on our own shelf (read by key, never fetched)? */
export function isShelfUrl(url: string): boolean {
  return shelfObject(url) !== null
}

/**
 * Hand `use` a private local copy of the file behind `url`, and remove it
 * afterwards whatever `use` did. Every refusal throws an Error whose message
 * is a plain sentence -- the executor shows it to the owner as it is.
 */
export async function withLocalCopy<T>(
  url: string,
  use: (file: LocalCopy) => Promise<T>
): Promise<T> {
  if (!/^https:\/\//i.test(url))
    throw new Error('файл можно взять только по https-ссылке')
  return isShelfUrl(url) ? fromShelf(url, use) : fromElsewhere(url, use)
}

async function fromShelf<T>(
  url: string,
  use: (file: LocalCopy) => Promise<T>
): Promise<T> {
  // Set the moment `use` starts: an error after that is the SEND's, and it
  // must reach the executor as it was, not dressed up as a shelf problem.
  let started = false
  let got: T | 'missing' | 'too-big'
  try {
    got = await withShelfFile(
      url,
      SHELF_SEND_MAX_BYTES,
      (path, size) => {
        started = true
        return use({ path, size })
      },
      AbortSignal.timeout(SHELF_READ_MS)
    )
  } catch (e) {
    if (started) throw e
    if (isMissingObject(e))
      throw new Error('этого файла нет на полке — ссылка устарела или неверна')
    if (isTimeout(e))
      throw new Error(
        `файл с полки не прочитался за ${SHELF_READ_MS / 1000} секунд — попробуй ещё раз`
      )
    throw new Error(
      `не удалось прочитать файл с полки: ${messageOf(e).slice(0, 80)}`
    )
  }
  if (got === 'too-big')
    throw new Error(
      `файл больше ${SHELF_SEND_MAX_BYTES / MB} МБ — не буду отправлять`
    )
  if (got === 'missing')
    throw new Error('файл на полке пуст — отправлять нечего')
  return got
}

async function fromElsewhere<T>(
  url: string,
  use: (file: LocalCopy) => Promise<T>
): Promise<T> {
  let target: URL
  try {
    target = new URL(url)
  } catch {
    throw new Error('ссылка на файл не читается как адрес')
  }
  const dir = await mkdtemp(join(tmpdir(), 'send-'))
  const ext = localExtension(target.pathname)
  const path = join(dir, ext ? `file.${ext}` : 'file')
  try {
    let size: number
    try {
      size = await downloadBoundedMediaToFile(target, path, {
        maxBytes: FOREIGN_SEND_MAX_BYTES,
        timeoutMs: FOREIGN_READ_MS,
        ...downloadDeps,
      })
    } catch (e) {
      throw new Error(downloadProblem(e))
    }
    return await use({ path, size })
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

/**
 * The extension the private copy is named with: the LAST path segment's, and
 * only when it is a plain word. A foreign path is somebody else's text --
 * `/files.v2/report` would otherwise name the copy `file.v2/report`, a
 * directory that does not exist, and the send would die on ENOENT.
 */
export function localExtension(pathname: string): string {
  const ext = extensionOf(String(pathname).split('/').pop())
  return /^[a-z0-9]{1,10}$/.test(ext) ? ext : ''
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function isTimeout(e: unknown): boolean {
  const name = (e as { name?: string })?.name ?? ''
  return (
    name === 'TimeoutError' ||
    name === 'AbortError' ||
    /timed out|aborted/i.test(messageOf(e))
  )
}

/**
 * What a failed foreign download means, in words the owner can act on. The
 * raw text is kept only as the last resort, so a new failure still carries
 * its clue instead of a friendly nothing.
 */
export function downloadProblem(e: unknown): string {
  const msg = messageOf(e)
  const cause = messageOf((e as { cause?: unknown })?.cause ?? '')
  const both = `${msg} ${cause}`
  if (/forbidden network/i.test(both))
    return 'ссылка ведёт во внутреннюю сеть — такой файл скачивать не буду'
  if (/did not resolve|ENOTFOUND|EAI_AGAIN/i.test(both))
    return 'адрес файла не найден — проверь ссылку'
  if (/redirect/i.test(both))
    return 'ссылка перенаправляет на другой адрес — дай прямую ссылку на файл'
  const http = /HTTP (\d{3})/.exec(msg)
  if (http) return `не удалось скачать файл (${http[1]})`
  if (/too large/i.test(msg))
    return `файл больше ${FOREIGN_SEND_MAX_BYTES / MB} МБ — не буду отправлять`
  if (/is empty/i.test(msg)) return 'по ссылке пустой файл — отправлять нечего'
  if (isTimeout(e))
    return `файл не скачался за ${FOREIGN_READ_MS / 1000} секунд`
  return `не удалось скачать файл: ${msg.slice(0, 80)}`
}
