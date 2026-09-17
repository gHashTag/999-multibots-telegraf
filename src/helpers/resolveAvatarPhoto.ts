/**
 * A CLIENT WITH NO PHOTO COULD NOT MAKE A LIPSYNC AT ALL.
 *
 * Hedra renders from a still image, and the event schema REQUIRES
 * `avatar_settings.avatar_photo_url` for it -- the refine in
 * inngest_app/functions/render/schemas.ts rejects the whole event without one.
 * The payload builder passes `avatarPhotoUrl || undefined`, and every wizard
 * feeds it `ctx.session.…imageUrl || ''`. So a person who never uploaded a
 * picture hit a validation refusal, which reads from the outside as the feature
 * being broken rather than a missing step.
 *
 * Owner, 2026-09-17: the lipsync photo should default to the user's own avatar
 * straight away. That avatar is already in hand: `createUserScene` stores the
 * Telegram profile photo as `users.photo_url` at registration, with the bot's
 * own photo as a fallback.
 *
 * WHAT THIS IS NOT. It does not upload, convert or validate an image. It picks
 * between sources that already exist, in the order a person would expect: what
 * they chose for THIS render first, then their own avatar. A default must never
 * quietly outrank a deliberate choice.
 */
import type { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'

/**
 * The rule itself, with no IO, so it can be read and tested as a sentence.
 *
 * `chosen` is what the person picked in this wizard; `stored` is the avatar
 * kept on their user row. Blank and whitespace-only count as absent -- the
 * wizards pass `'' ` for "not chosen", and a string of spaces is not a URL.
 */
export function pickAvatarPhoto(
  chosen: string | null | undefined,
  stored: string | null | undefined
): string | null {
  const real = (s: string | null | undefined): string | null => {
    const t = (s ?? '').trim()
    return t ? t : null
  }
  return real(chosen) ?? real(stored)
}

/**
 * The same rule with the lookup attached.
 *
 * Reads the user row only when it has to: a person who chose a picture costs no
 * query. A failed lookup returns what was chosen (that is, nothing) rather than
 * throwing -- a render refusing for a missing photo is a bad outcome, and a
 * render refusing because the profile table was briefly unreachable is a worse
 * one to debug.
 */
export async function resolveAvatarPhoto(
  ctx: MyContext,
  chosen: string | null | undefined
): Promise<string> {
  const direct = pickAvatarPhoto(chosen, null)
  if (direct) return direct

  try {
    const { getUserByTelegramId } = await import('@/core/supabase')
    const user = await getUserByTelegramId(ctx)
    const fallback = pickAvatarPhoto(null, user?.photo_url)
    if (fallback) {
      logger.info('[resolveAvatarPhoto] using the stored avatar', {
        telegramId: ctx.from?.id,
      })
      return fallback
    }
  } catch (e) {
    logger.warn('[resolveAvatarPhoto] could not read the stored avatar', {
      telegramId: ctx.from?.id,
      error: e instanceof Error ? e.message : String(e),
    })
  }
  return ''
}
