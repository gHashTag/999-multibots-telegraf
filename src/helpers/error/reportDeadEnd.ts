import type { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import { telegramLogService } from '@/services/telegram-log.service'

/**
 * A DEAD END IS NOT AN EXCEPTION, AND THAT IS WHY NOBODY EVER HEARD ABOUT IT.
 *
 * "Image not found. Starting over." is a deliberate branch: the wizard replies,
 * rewinds to step 0 and returns. Nothing throws, so `bot.catch` never runs and
 * the owner learns nothing -- the alert channel fixed in #2235/#2236 would not
 * carry it either. The person is back at the beginning with no explanation and
 * the only trace is a console line nobody reads.
 *
 * WHAT IT REPORTS, AND WHY THAT EXACT PAYLOAD. The question a lost `imageUrl`
 * raises is not "was it missing" -- the branch already knows that -- but
 * WHETHER THE REST OF THE SESSION WAS THERE. A session holding the model, the
 * aspect ratio and the cursor but not the image is one story; an empty session
 * is a different one, and they have different causes. So the KEYS present are
 * listed beside the keys missing.
 *
 * NAMES ONLY, NEVER VALUES. Session fields carry prompts, file links carrying a
 * bot token, and other people's text. A diagnostic that leaks them into a chat
 * log is a worse defect than the one it explains.
 */

/** Once a minute per (place, person): a stuck user taps more than once. */
const lastReported = new Map<string, number>()
const EVERY_MS = 60_000

export function shouldReport(
  key: string,
  now: number,
  seen: Map<string, number> = lastReported
): boolean {
  const at = seen.get(key)
  if (at !== undefined && now - at < EVERY_MS) return false
  seen.set(key, now)
  return true
}

/**
 * Session field names present right now. Names only -- and whether each one
 * actually holds anything.
 *
 * "PRESENT" AND "HAS A VALUE" ARE DIFFERENT, AND THE REPORT CONTRADICTED ITSELF
 * OVER IT. `defaultSession` in src/store/index.ts sets `imageUrl: ''`, the
 * wizard guards with `if (!imageUrl)`, and the empty string is falsy -- so after
 * any /start reset the branch fires with the key sitting right there. The first
 * version of this reporter then said, in one message:
 *
 *   "session has no imageUrl -- session held (27): ..., imageUrl, ..."
 *
 * A reader believes the second half and stops. The evidence has to survive being
 * read by someone who did not write it.
 *
 * `(empty)` is a shape, not a value: '' , null, undefined, [] and {} are all
 * "the key exists and carries nothing". Values themselves never appear here --
 * these fields hold prompts and file links that carry a bot token.
 */
export function sessionKeysOf(session: unknown): string[] {
  if (!session || typeof session !== 'object') return []
  const obj = session as Record<string, unknown>
  return Object.keys(obj)
    .sort()
    .map(k => (isEmpty(obj[k]) ? `${k}(empty)` : k))
}

/** Carries nothing, whatever its type says. */
export function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null || v === '') return true
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === 'object') return Object.keys(v as object).length === 0
  return false
}

export async function reportDeadEnd(
  ctx: MyContext,
  where: string,
  missing: string[]
): Promise<void> {
  const telegramId = ctx.from?.id
  const present = sessionKeysOf(ctx.session)
  const detail = {
    where,
    missing: missing.join(', '),
    sessionKeys: present.join(', ') || '(session is empty)',
    sessionKeyCount: present.length,
    telegramId,
    username: ctx.from?.username,
    botName: ctx.botInfo?.username,
  }
  logger.warn(`🚧 [dead-end] ${where}: no ${missing.join(', ')}`, detail)

  if (!shouldReport(`${where}:${telegramId ?? 'unknown'}`, Date.now())) return

  await telegramLogService
    .logError({
      telegramId: telegramId?.toString(),
      username: ctx.from?.username,
      error:
        `${where}: session has no ${missing.join(', ')} — the person was sent back to the start.\n` +
        `session held (${present.length}): ${detail.sessionKeys}`,
      context: 'dead end',
      botName: ctx.botInfo?.username,
    })
    /*
     * The reporter's own failure must not become the incident. It is already
     * logged inside the service, which now says loudly when a channel is dead
     * or a delivery is refused (#2235, #2236).
     */
    .catch(() => {})
}
