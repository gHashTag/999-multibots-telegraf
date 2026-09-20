import { describe, it, expect, beforeEach } from 'vitest'
import {
  telegramAvatar,
  smallestPhoto,
  botToken,
  forgetAvatar,
  cachedAvatar,
  AVATAR_TTL_MS,
} from './src/browser/avatar'

/**
 * THE FACE IN THE BAR IS THE PERSON'S OWN.
 *
 * neko draws initials on a disc. On a screen showing YOUR browser, somebody
 * else's placeholder initials are the wrong answer.
 */

const photoList = (sizes: { width: number; file_id: string }[]) => ({
  ok: true,
  json: async () => ({ result: { photos: [sizes] } }),
})
const fileAnswer = {
  ok: true,
  json: async () => ({ result: { file_path: 'a/b.jpg' } }),
}
const bytes = {
  ok: true,
  headers: { get: () => 'image/jpeg' },
  arrayBuffer: async () => new TextEncoder().encode('JPEGDATA').buffer,
}

function podFetcher(calls: string[]) {
  return (async (url: string) => {
    calls.push(String(url))
    if (String(url).includes('getUserProfilePhotos')) {
      return photoList([
        { width: 640, file_id: 'big' },
        { width: 160, file_id: 'small' },
        { width: 320, file_id: 'mid' },
      ])
    }
    if (String(url).includes('getFile')) return fileAnswer
    return bytes
  }) as never
}

beforeEach(() => forgetAvatar())

describe('which size is fetched', () => {
  it('TAKES THE SMALLEST, not the largest', () => {
    /*
     * The other helper in this codebase takes the biggest, because its
     * output feeds an image model. This draws a 24px disc, so the biggest
     * would be a megabyte fetched in order to be thrown away.
     */
    expect(
      smallestPhoto([
        { width: 640, file_id: 'big' },
        { width: 160, file_id: 'small' },
      ])!.file_id
    ).toBe('small')
  })

  it('has an answer when there are no sizes at all', () => {
    expect(smallestPhoto([])).toBeNull()
    expect(smallestPhoto(undefined)).toBeNull()
  })

  it('asks Telegram for the small one', async () => {
    const calls: string[] = []
    await telegramAvatar('900000001', 'tok', podFetcher(calls))
    expect(calls.some(c => c.includes('file_id=small'))).toBe(true)
    expect(calls.some(c => c.includes('file_id=big'))).toBe(false)
  })
})

describe('when there is no face', () => {
  it('RETURNS NULL RATHER THAN THROWING, every way it can fail', async () => {
    /*
     * A missing photo, a missing token, an outage: all of them mean "no
     * picture", the initials stay, and the window works. A face is a
     * nicety, not a function.
     */
    expect(await telegramAvatar('', 'tok', podFetcher([]))).toBeNull()
    forgetAvatar()
    expect(await telegramAvatar('900000001', '', podFetcher([]))).toBeNull()
    forgetAvatar()
    const boom = (async () => {
      throw new Error('telegram is down')
    }) as never
    expect(await telegramAvatar('900000001', 'tok', boom)).toBeNull()
    forgetAvatar()
    const noPhotos = (async () => ({
      ok: true,
      json: async () => ({ result: { photos: [] } }),
    })) as never
    expect(await telegramAvatar('900000001', 'tok', noPhotos)).toBeNull()
  })
})

describe('the cache', () => {
  it('asks Telegram once, not on every reload', async () => {
    const calls: string[] = []
    await telegramAvatar('900000001', 'tok', podFetcher(calls))
    const first = calls.length
    await telegramAvatar('900000001', 'tok', podFetcher(calls))
    expect(calls.length).toBe(first)
  })

  it('REMEMBERS THE ABSENCE TOO', async () => {
    /*
     * Somebody with no photo would otherwise hit Telegram on every single
     * page load, forever, to be told nothing again.
     */
    const calls: string[] = []
    const none = (async (u: string) => {
      calls.push(u)
      return { ok: true, json: async () => ({ result: { photos: [] } }) }
    }) as never
    await telegramAvatar('900000002', 'tok', none)
    await telegramAvatar('900000002', 'tok', none)
    expect(calls.length).toBe(1)
  })

  it('lets a new photo through eventually', async () => {
    const calls: string[] = []
    const t0 = 1_800_000_000_000
    await telegramAvatar('900000003', 'tok', podFetcher(calls), t0)
    expect(cachedAvatar('900000003', t0)).toBeTruthy()
    expect(cachedAvatar('900000003', t0 + AVATAR_TTL_MS + 1)).toBeUndefined()
  })

  it('keeps the window measured in hours, not days', () => {
    expect(AVATAR_TTL_MS).toBeGreaterThanOrEqual(60 * 60 * 1000)
    expect(AVATAR_TTL_MS).toBeLessThanOrEqual(24 * 60 * 60 * 1000)
  })
})

describe('the token', () => {
  it('reads the names this deployment actually uses', () => {
    expect(botToken({ TELEGRAM_BOT_TOKEN: 'a' } as never)).toBe('a')
    expect(botToken({ BOT_TOKEN_1: 'b' } as never)).toBe('b')
    expect(botToken({} as never)).toBe('')
  })
})
