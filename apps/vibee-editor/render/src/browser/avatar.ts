/**
 * THE FACE IN THE BAR IS THE PERSON'S OWN.
 *
 * neko draws initials on a coloured disc -- "YO" for everybody whose name
 * starts that way, which on a screen showing YOUR browser is a stranger's
 * placeholder. The person already has a picture: the one on their Telegram
 * account, which is how they know themselves here.
 *
 * ── WHY THIS IS NOT THE EXISTING HELPER ───────────────────────────────────
 *
 * `avatarUrlViaBotApi` in agent/tools.ts fetches the same photo and then
 * PUBLISHES it to object storage, because its caller needs a public URL to
 * hand to an image model. A bar in a window needs bytes on the wire and
 * nothing else; uploading somebody's face to a bucket to draw a 24px disc
 * would be both slower and a copy of their photo we did not need to make.
 *
 * ── WHAT IT DOES NOT DO ───────────────────────────────────────────────────
 *
 * It never throws. A missing photo, a missing token, a Telegram outage --
 * all of them mean "no picture", and the initials stay. A face is a nicety;
 * the window works without it.
 */

export interface AvatarBytes {
  contentType: string
  bytes: Buffer
}

/** Long enough that a reload is free, short enough that a new photo shows. */
export const AVATAR_TTL_MS = 6 * 60 * 60 * 1000

interface CacheEntry {
  at: number
  value: AvatarBytes | null
}

const cache = new Map<string, CacheEntry>()

/** Test seam, and the way a person's new photo is picked up on demand. */
export function forgetAvatar(telegramId?: string): void {
  if (telegramId) cache.delete(telegramId)
  else cache.clear()
}

export function cachedAvatar(
  telegramId: string,
  nowMs = Date.now()
): AvatarBytes | null | undefined {
  const hit = cache.get(telegramId)
  if (!hit) return undefined
  if (nowMs - hit.at > AVATAR_TTL_MS) {
    cache.delete(telegramId)
    return undefined
  }
  return hit.value
}

export function botToken(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.TELEGRAM_BOT_TOKEN ||
    env.BOT_TOKEN_1 ||
    env.TELEGRAM_CHANNEL_BOT_TOKEN ||
    ''
  )
}

type Fetcher = typeof fetch

/**
 * The smallest size Telegram offers, not the largest.
 *
 * The other helper takes the biggest because its output feeds an image
 * model. This draws a 24px disc, so the biggest would be a megabyte fetched
 * to be thrown away.
 */
export function smallestPhoto<T extends { width: number }>(
  sizes: T[] | undefined
): T | null {
  if (!sizes?.length) return null
  return sizes.reduce((a, b) => (b.width < a.width ? b : a))
}

export async function telegramAvatar(
  telegramId: string,
  token = botToken(),
  fetcher: Fetcher = fetch,
  nowMs = Date.now()
): Promise<AvatarBytes | null> {
  const hit = cachedAvatar(telegramId, nowMs)
  if (hit !== undefined) return hit

  const remember = (v: AvatarBytes | null) => {
    cache.set(telegramId, { at: nowMs, value: v })
    return v
  }
  if (!telegramId || !token) return remember(null)

  try {
    const api = `https://api.telegram.org/bot${token}`
    const list = (await (
      await fetcher(
        `${api}/getUserProfilePhotos?user_id=${encodeURIComponent(
          telegramId
        )}&limit=1`
      )
    ).json()) as {
      result?: { photos?: { width: number; file_id: string }[][] }
    }

    const size = smallestPhoto(list?.result?.photos?.[0])
    if (!size) return remember(null)

    const file = (await (
      await fetcher(
        `${api}/getFile?file_id=${encodeURIComponent(size.file_id)}`
      )
    ).json()) as { result?: { file_path?: string } }
    const path = file?.result?.file_path
    if (!path) return remember(null)

    const bin = await fetcher(
      `https://api.telegram.org/file/bot${token}/${path}`
    )
    if (!bin.ok) return remember(null)
    return remember({
      contentType: bin.headers.get('content-type') || 'image/jpeg',
      bytes: Buffer.from(await bin.arrayBuffer()),
    })
  } catch {
    /* No picture is an answer. The initials stay and the window works. */
    return remember(null)
  }
}
