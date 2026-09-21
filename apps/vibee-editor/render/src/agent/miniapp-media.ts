/**
 * WHAT A PERSON ATTACHES IN THE MINI APP JOINS THEIR MEDIA LIBRARY.
 *
 * The bot and the business DM have written every file into `user_media` since
 * 2026-09-13 (through /api/crm/media); the mini app's chat never did. Its
 * files were read on the turn they arrived and then existed nowhere but inside
 * one message's text -- so a video never got the background description the
 * sweep gives every other video, a PDF was read again on every mention, and
 * "what did I send you" had no answer in the app. Measured 2026-09-22 in the
 * salvage study, matrix row "Mini app chat".
 *
 * Written HERE, by the chat route, and not by the app calling /api/crm/media:
 * the route already knows who is speaking and which surface the turn came
 * from, and the marker lines it records are the very ones the agent read.
 *
 * Only OUR shelf: a marker is text a person typed, and a row is a promise that
 * the file is ours to describe. Anything else is skipped, not stored.
 */

import { parseMarkers, shelfObject } from './media-parts'
import {
  rememberMedia,
  transcribeAndMirror,
  type MediaRow,
  type Pool,
} from './media-library'

/** The mini app attaches at most four files; a pasted message cannot add more. */
const MAX_FILES = 4

/**
 * Record the files of one mini-app message. The owner and the lead are the
 * same person -- it is their own conversation, as on the bot surface. Fresh
 * rows are described in the background (`transcribeAndMirror`); the caller
 * does not wait for that and must not.
 */
export async function rememberMiniAppFiles(
  pool: Pool,
  telegramId: string,
  text: string,
  at: Date = new Date()
): Promise<{ stored: number; fresh: number }> {
  const owner = String(telegramId)
  const fresh: Array<MediaRow & { id: number }> = []
  let stored = 0
  const seen = new Set<string>()
  for (const ref of parseMarkers(text)) {
    if (stored >= MAX_FILES) break
    const found = shelfObject(ref.url)
    if (!found || seen.has(found.url)) continue
    seen.add(found.url)
    const row: MediaRow = {
      lead: owner,
      surface: 'miniapp',
      msgId: null,
      at,
      out: false,
      kind: ref.kind,
      name: ref.name || 'file',
      mime: ref.mime || null,
      bytes: null,
      url: found.url,
      tgFileUniqueId: null,
      caption: null,
    }
    const r = await rememberMedia(pool, owner, row)
    stored += 1
    if (r.fresh) fresh.push({ ...row, id: r.id })
  }
  if (fresh.length) {
    void transcribeAndMirror(pool, owner, fresh).catch(e =>
      console.warn(`[miniapp-media] background describe failed: ${String(e)}`)
    )
  }
  return { stored, fresh: fresh.length }
}
