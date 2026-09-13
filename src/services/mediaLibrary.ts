/**
 * THE PER-USER MEDIA LIBRARY, FROM THE BOT.
 *
 * One thin call to the render service: "this person sent these files, here
 * are OUR shelf URLs for them". The render side (`media-library.ts`) keeps a
 * row per (owner, lead, url), describes what it can see or hear in the
 * background and appends the words to the correspondence. The bot only
 * reports; it never waits for a transcript.
 *
 * WHAT NEVER LEAVES HERE: a Telegram file link. `getFileLink` answers a URL
 * with the bot token in its path; `agentAttachments.ts` uses it once to
 * fetch the bytes and hands back the shelf URL only. This module refuses to
 * send anything else, so a future caller cannot leak the token by accident
 * -- and the render side refuses the same URL a second time.
 */
import { logger } from '@/utils/logger'
import type { AgentMessagePlan } from '@/services/agentAttachments'

const BASE = 'https://vibee-render-production.up.railway.app'
const apiKey = () => process.env.RENDER_API_KEY || ''

export type MediaSurface = 'bot' | 'business'

export interface MediaItem {
  msg_id: number | null
  /** ISO date; the render side parses three shapes, this sends one. */
  at: string | null
  out: boolean
  kind: 'image' | 'video' | 'audio' | 'file'
  name: string
  mime: string | null
  bytes: number | null
  /** OUR shelf URL. */
  url: string
  caption: string | null
  tg_file_unique_id: string | null
}

/** The token guard, the same rule as on the render side. */
export function isTelegramFileUrl(url: string): boolean {
  return /api\.telegram\.org/i.test(String(url ?? ''))
}

/**
 * The plan's stored attachments as library items. The caption is attached
 * to every part: an album has one caption, and a reader of a single row
 * should still see what the person wrote beside the file.
 */
export function mediaItemsFrom(
  plan: Pick<AgentMessagePlan, 'stored'>,
  caption: string | null
): MediaItem[] {
  return (plan.stored ?? []).map(s => ({
    msg_id: s.messageId,
    at: s.at ? s.at.toISOString() : null,
    out: false,
    kind: s.kind,
    name: s.name,
    mime: s.mimeType,
    bytes: s.bytes,
    url: s.url,
    caption: caption?.trim() ? caption.trim() : null,
    tg_file_unique_id: s.fileUniqueId,
  }))
}

export async function rememberClientMedia(
  owner: string,
  lead: string,
  surface: MediaSurface,
  items: MediaItem[]
): Promise<{ ok: boolean; fresh?: number; error?: string }> {
  if (!apiKey()) return { ok: false, error: 'RENDER_API_KEY не задан' }
  if (!items.length) return { ok: true, fresh: 0 }
  const leak = items.find(i => isTelegramFileUrl(i.url))
  if (leak) {
    return {
      ok: false,
      error: `«${leak.name}»: ссылка Telegram содержит токен и в библиотеку не пишется`,
    }
  }
  const r = await fetch(
    `${BASE}/api/crm/media?telegram_id=${encodeURIComponent(owner)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey() },
      body: JSON.stringify({ lead, surface, items }),
    }
  )
  const data = (await r.json().catch(() => ({}))) as {
    ok?: boolean
    fresh?: number
    error?: string
  }
  return r.ok && data.ok
    ? { ok: true, fresh: data.fresh }
    : { ok: false, error: data.error || `HTTP ${r.status}` }
}

/**
 * Fire and forget, logged. The reply to the person must not wait for the
 * library, and a library outage must not cost anyone an answer.
 */
export function rememberClientMediaQuietly(
  owner: string,
  lead: string,
  surface: MediaSurface,
  items: MediaItem[]
): void {
  if (!items.length) return
  void rememberClientMedia(owner, lead, surface, items)
    .then(r => {
      if (!r.ok) {
        logger.warn('[медиатека] файлы не записались', {
          surface,
          count: items.length,
          error: r.error,
        })
      }
    })
    .catch(e => {
      logger.warn('[медиатека] файлы не записались', {
        surface,
        count: items.length,
        error: e instanceof Error ? e.message : String(e),
      })
    })
}
