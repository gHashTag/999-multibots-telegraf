/**
 * /api/crm/media -- the bot writes into the per-user media library, the
 * mini app / agent may read it.
 *
 * Identity is resolved by the caller (`render-server.ts`) exactly as for
 * `/api/crm/mirror`: the verified owner is `telegramId`, never a body field.
 * The bot names the owner with X-Api-Key + `telegram_id`; a person in the
 * mini app is their own owner through initData.
 *
 * POST body:
 *   { lead, surface: 'bot'|'business', items: [{ msg_id, at, out, kind,
 *     name, mime, bytes, url, caption, tg_file_unique_id }] }
 * Answer: { ok, fresh, ids } -- and, in the background, every fresh row is
 * described and mirrored into `crm_messages` (`transcribeAndMirror`).
 *
 * The only 400 with teeth: a URL on api.telegram.org anywhere in the body
 * refuses the WHOLE request. That link carries the bot token; refusing the
 * batch instead of skipping the item makes the bug visible where it was
 * introduced rather than silently thinning the library.
 *
 * GET ?lead=&limit=&kind= answers the rows newest first, for the owner only.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  isTelegramFileUrl,
  listMedia,
  rememberMedia,
  transcribeAndMirror,
  MEDIA_KINDS,
  MEDIA_SURFACES,
  type MediaKind,
  type MediaRow,
  type MediaSurface,
} from './media-library'

const LEAD = /^\d{5,15}$/
const MAX_ITEMS = 50
const MAX_BODY = 256_000

const when = (v: unknown): Date => {
  if (typeof v === 'string') {
    const t = Date.parse(v)
    return Number.isFinite(t) ? new Date(t) : new Date()
  }
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return new Date()
  return new Date(n > 1e12 ? n : n * 1000)
}

async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = []
  for await (const chunk of req as AsyncIterable<Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
    if (chunks.reduce((n, c) => n + c.length, 0) > MAX_BODY) break
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
}

export async function handleCrmMedia(
  req: IncomingMessage,
  res: ServerResponse,
  telegramId: string,
  getPool: () => any
): Promise<void> {
  const answer = (code: number, body: unknown) => {
    res.writeHead(code, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  const owner = String(telegramId)

  if (req.method === 'GET') {
    const q = new URL(req.url ?? '/', 'http://x').searchParams
    const lead = String(q.get('lead') ?? owner).trim()
    if (!LEAD.test(lead)) {
      return answer(400, { error: 'lead: числовой telegram_id человека' })
    }
    const kind = q.get('kind') as MediaKind | null
    if (kind && !MEDIA_KINDS.includes(kind)) {
      return answer(400, { error: `kind: ${MEDIA_KINDS.join(' | ')}` })
    }
    try {
      const pool = await getPool()
      const items = await listMedia(pool, owner, lead, {
        limit: Number(q.get('limit') ?? 20) || 20,
        kind: kind ?? undefined,
      })
      return answer(200, { ok: true, items })
    } catch (e) {
      return answer(500, { error: String(e).slice(0, 200) })
    }
  }

  let body: any = {}
  try {
    body = await readJson(req)
  } catch {
    return answer(400, { error: 'body: JSON' })
  }

  const lead = String(body?.lead ?? '').trim()
  if (!LEAD.test(lead)) {
    return answer(400, { error: 'lead: числовой telegram_id человека' })
  }
  const surface = String(body?.surface ?? '') as MediaSurface
  if (!MEDIA_SURFACES.includes(surface) || surface === 'ingest') {
    return answer(400, { error: "surface: 'bot' | 'business'" })
  }
  // In the bot the person IS the owner; in a business DM they never are.
  if (surface === 'business' && lead === owner) {
    return answer(400, { error: 'lead: это вы сами' })
  }

  const raw: unknown[] = Array.isArray(body?.items) ? body.items : []
  const rows: MediaRow[] = []
  for (const it of raw.slice(0, MAX_ITEMS) as any[]) {
    const url = String(it?.url ?? '').trim()
    if (isTelegramFileUrl(url)) {
      return answer(400, {
        error:
          'url: ссылка api.telegram.org содержит токен бота и не сохраняется — загрузите файл на полку и передайте её URL',
      })
    }
    if (!/^https?:\/\//i.test(url)) continue
    const kind = String(it?.kind ?? '') as MediaKind
    if (!MEDIA_KINDS.includes(kind)) continue
    const msgId = Number(it?.msg_id)
    rows.push({
      lead,
      surface,
      msgId: Number.isFinite(msgId) ? msgId : null,
      at: when(it?.at),
      out: Boolean(it?.out),
      kind,
      name: String(it?.name ?? '') || 'file',
      mime: it?.mime ? String(it.mime) : null,
      bytes: Number.isFinite(Number(it?.bytes)) ? Number(it.bytes) : null,
      url,
      tgFileUniqueId: it?.tg_file_unique_id
        ? String(it.tg_file_unique_id)
        : null,
      caption: it?.caption ? String(it.caption) : null,
    })
  }
  if (!rows.length) {
    return answer(400, {
      error:
        'items: [{ url, kind, name, ... }] — хотя бы один с URL полки и kind',
    })
  }

  try {
    const pool = await getPool()
    const ids: number[] = []
    const freshRows: Array<MediaRow & { id: number }> = []
    for (const row of rows) {
      const r = await rememberMedia(pool, owner, row)
      ids.push(r.id)
      if (r.fresh) freshRows.push({ ...row, id: r.id })
    }
    answer(200, { ok: true, fresh: freshRows.length, ids })
    if (freshRows.length) {
      // Fire and forget: the send that caused this must not wait 20 s per file.
      void transcribeAndMirror(pool, owner, freshRows).catch(e =>
        console.warn(`[media-library] background describe failed: ${String(e)}`)
      )
    }
    return
  } catch (e) {
    return answer(500, { error: String(e).slice(0, 200) })
  }
}
