import fs from 'node:fs/promises'
import path from 'node:path'
import { logger } from '@/utils/logger'
import { Artifact } from './types'

/**
 * Полка завода — хранилище Railway (S3-совместимое, бакет vibee-assets),
 * через рендер-сервер: `POST /upload` → `uploadToS3` → прокси-ссылка `/s3/<key>`.
 *
 * Supabase здесь НЕ используется: проект переехал на Railway, и заводу нельзя
 * тянуть за собой старое хранилище. Прокси-путь `/s3/` открыт на чтение без
 * ключа (auth.ts, PUBLIC_PREFIXES) — именно по нему headless-Chrome забирает
 * медиа во время рендера, поэтому ссылка годится и для рендера, и для отдачи
 * человеку.
 *
 * Правило, за которое уже заплачено: ссылки провайдеров умирают. Replicate
 * помечает прогон `data_removed: true` примерно через час, и по такой ссылке
 * приходит пустой output. Поэтому КАЖДЫЙ артефакт зеркалится к себе сразу же,
 * как появился, а не «перед отправкой».
 */

/**
 * THE SHELF ADDRESS. WE ADD THE SCHEME -- RAILWAY DOES NOT.
 *
 * Measured 2026-09-07 on the service `999-multibots-telegraf`: of the three
 * variables, ONLY `RAILWAY_SERVICE_VIBEE_RENDER_URL` is set, and Railway puts a
 * bare host in it -- `vibee-render-production.up.railway.app`, no `https://`.
 *
 * `fetch` cannot use such a string at all:
 *
 *     TypeError: Failed to parse URL from vibee-render-production.../upload
 *
 * That error is caught upstream and turned into a polite "it did not save on
 * our side" -- meaning every single upload WOULD have been refused while
 * looking like a refusal that works. The worst kind of failure: the one that
 * reports itself in a calm voice.
 */
function serverBase(): string {
  const url =
    process.env.RENDER_SERVER_URL ||
    process.env.VIBEE_RENDER_URL ||
    process.env.RAILWAY_SERVICE_VIBEE_RENDER_URL
  if (!url) {
    throw new Error(
      'RENDER_SERVER_URL не задан — заводу негде хранить артефакты. Это адрес сервиса vibee-render в Railway.'
    )
  }
  const trimmed = url.trim().replace(/\/+$/, '')
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function apiKey(): string {
  const key = process.env.RENDER_API_KEY
  if (!key) {
    throw new Error('RENDER_API_KEY не задан — загрузка на полку требует ключа')
  }
  return key
}

/** Абсолютная ссылка из ответа сервера: он отдаёт относительный /s3/<key>. */
function absolutize(url: string): string {
  return /^https?:\/\//.test(url) ? url : `${serverBase()}${url}`
}

interface UploadResult {
  success: boolean
  url?: string
  key?: string
  error?: string
}

/**
 * Puts BYTES on the shelf and returns a public link.
 *
 * Separate from `putFile` because not every file has a path on disk: an
 * attachment from Telegram arrives as a stream, and writing it to a temporary
 * file only to read it back is a pointless trip through a disk that does not
 * survive a Railway deploy anyway. There is still ONE upload path: `putFile`
 * below reads the file and calls this function.
 */
export async function putBytes(
  body: Buffer | Uint8Array,
  filename: string
): Promise<Artifact> {
  if (!body.length) {
    throw new Error(`${filename}: пустой файл, класть на полку нечего`)
  }

  const res = await fetch(`${serverBase()}/upload`, {
    method: 'POST',
    headers: {
      // Сервер требует X-Api-Key (не Bearer) — проверено ответом 401.
      'X-Api-Key': apiKey(),
      'Content-Type': contentTypeOf(filename),
      /*
       * THE NAME IS ENCODED. An HTTP header value must be Latin-1, and file
       * names arriving from Telegram are routinely non-Latin. A Cyrillic name
       * kills `new Headers` before a byte reaches the network:
       *
       *   TypeError: Cannot convert argument to a ByteString because the
       *   character at index 0 has a value of 1044...
       *
       * The server already expects percent-encoding and decodes it (the
       * `/upload` handler in render-server.ts), and the mini app encodes. This
       * did not -- so any file with a non-Latin name would not upload at all.
       */
      'X-Filename': encodeURIComponent(filename),
    },
    body: new Uint8Array(body),
  })

  const raw = await res.text()
  if (!res.ok) {
    throw new Error(
      `upload ${filename}: HTTP ${res.status} ${raw.slice(0, 200)}`
    )
  }

  let parsed: UploadResult
  try {
    parsed = JSON.parse(raw) as UploadResult
  } catch {
    throw new Error(
      `upload ${filename}: сервер ответил не JSON: ${raw.slice(0, 200)}`
    )
  }
  if (!parsed.success || !parsed.url) {
    throw new Error(
      `upload ${filename}: ${parsed.error || 'сервер не вернул ссылку'}`
    )
  }

  const url = absolutize(parsed.url)
  logger.info('[contentFactory] артефакт на полке', {
    filename,
    key: parsed.key,
    bytes: body.length,
  })
  return { url, meta: { bytes: body.length, key: parsed.key } }
}

/** Puts a local file on the shelf and returns a public link. */
export async function putFile(
  localPath: string,
  filename: string
): Promise<Artifact> {
  const body = await fs.readFile(localPath)
  const artifact = await putBytes(body, filename)
  return { ...artifact, localPath }
}

const CONTENT_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.json': 'application/json',
}

const contentTypeOf = (name: string): string =>
  CONTENT_TYPES[path.extname(name).toLowerCase()] || 'application/octet-stream'

/**
 * Скачивает чужую ссылку в рабочий каталог и сразу зеркалит на полку.
 * Возвращает УЖЕ свою ссылку: наружу отдавать чужую нельзя, она протухнет.
 */
export async function mirror(
  sourceUrl: string,
  localPath: string,
  filename: string
): Promise<Artifact> {
  const res = await fetch(sourceUrl)
  if (!res.ok) {
    throw new Error(`скачивание ${filename}: HTTP ${res.status}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  if (!buf.length) {
    // Пустой ответ у Replicate значит data_removed — прогон надо повторить,
    // молча сохранять нулевой файл нельзя.
    throw new Error(
      `${filename}: источник отдал пустой файл (вероятно, вывод уже удалён провайдером)`
    )
  }
  await fs.mkdir(path.dirname(localPath), { recursive: true })
  await fs.writeFile(localPath, buf)
  return putFile(localPath, filename)
}

export async function putJson(
  data: unknown,
  filename: string,
  localPath: string
): Promise<Artifact> {
  await fs.mkdir(path.dirname(localPath), { recursive: true })
  await fs.writeFile(localPath, JSON.stringify(data, null, 2), 'utf-8')
  return putFile(localPath, filename)
}

export async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}
