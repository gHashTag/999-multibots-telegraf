import { describe, it, expect } from 'vitest'
import {
  CLOUD_API_ROOT,
  CLOUD_DOWNLOAD_LIMIT,
  LOCAL_DOWNLOAD_LIMIT,
  assertBotApiConfig,
  botApiIsLocalFor,
  botIdOfToken,
  describeBotApiConfig,
  telegramApiFor,
  telegramApiRootFor,
  telegramClientOptionsFor,
  telegramDownloadLimitFor,
  telegramFileUrlFor,
} from '@/services/telegramApi'
import { redactBotToken } from '@/utils/redactBotToken'

/**
 * WHICH SERVER A CALL GOES TO IS DECIDED BY THE TOKEN IT USES.
 *
 * Made-up tokens and ids throughout: a moved bot (id 900000011) and one that
 * stays on the cloud (id 900000022). The secrets are long enough to look real
 * so the "never printed" checks mean something.
 */
const MOVED = '900000011:ZZmovedmovedmovedmovedmovedmovedmoved'
const STAYS = '900000022:ZZstaysstaysstaysstaysstaysstaysstays'
const OURS = 'http://telegram-bot-api.railway.internal:8081'
const FILES = 'http://telegram-bot-api.railway.internal:8082'

const env = (bots: string, extra: Record<string, string> = {}) => ({
  TELEGRAM_API_ROOT: OURS,
  TELEGRAM_API_FILES_ROOT: FILES,
  BOT_API_LOCAL_BOTS: bots,
  ...extra,
})

describe('the host is chosen per bot, from the token', () => {
  it('nothing configured: every bot on the cloud, exactly as before', () => {
    expect(telegramApiRootFor(MOVED, {})).toBe(CLOUD_API_ROOT)
    expect(telegramApiFor(MOVED, {})).toBe(`${CLOUD_API_ROOT}/bot${MOVED}`)
    expect(telegramDownloadLimitFor(MOVED, {})).toBe(CLOUD_DOWNLOAD_LIMIT)
  })

  it('a listed bot goes to our server; an unlisted one stays on the cloud', () => {
    const e = env('900000011')
    expect(telegramApiRootFor(MOVED, e)).toBe(OURS)
    expect(telegramApiRootFor(STAYS, e)).toBe(CLOUD_API_ROOT)
    expect(telegramClientOptionsFor(MOVED, e)).toEqual({ apiRoot: OURS })
    expect(telegramClientOptionsFor(STAYS, e)).toEqual({
      apiRoot: CLOUD_API_ROOT,
    })
  })

  it('username=id lists the bot by its id; the name is only a label', () => {
    const e = env('@Kaya_easy_art_bot=900000011, other_bot=900000033')
    expect(botApiIsLocalFor(MOVED, e)).toBe(true)
    expect(botApiIsLocalFor(STAYS, e)).toBe(false)
    expect(assertBotApiConfig(e).local.get('900000011')?.username).toBe(
      'kaya_easy_art_bot'
    )
  })

  it('the server set but nobody listed: nobody moves', () => {
    const e = env('')
    expect(telegramApiRootFor(MOVED, e)).toBe(CLOUD_API_ROOT)
    expect(telegramApiRootFor(STAYS, e)).toBe(CLOUD_API_ROOT)
  })

  it('something that is not a token goes to the cloud (as before)', () => {
    expect(botIdOfToken('test-token')).toBeNull()
    expect(telegramApiRootFor('test-token', env('900000011'))).toBe(
      CLOUD_API_ROOT
    )
    expect(telegramApiRootFor(undefined, env('900000011'))).toBe(CLOUD_API_ROOT)
  })
})

describe('the ceiling is the bot’s own', () => {
  it('20 MB on the cloud, 2000 MB on our server -- per bot, not per process', () => {
    const e = env('900000011')
    expect(telegramDownloadLimitFor(MOVED, e)).toBe(LOCAL_DOWNLOAD_LIMIT)
    expect(telegramDownloadLimitFor(STAYS, e)).toBe(CLOUD_DOWNLOAD_LIMIT)
    expect(CLOUD_DOWNLOAD_LIMIT).toBe(20 * 1024 * 1024)
    expect(LOCAL_DOWNLOAD_LIMIT).toBe(2000 * 1024 * 1024)
  })
})

describe('file URLs', () => {
  const e = env('900000011')

  it('cloud bot: the cloud file URL, unchanged', () => {
    expect(telegramFileUrlFor(STAYS, 'photos/file_1.jpg', e)).toBe(
      `${CLOUD_API_ROOT}/file/bot${STAYS}/photos/file_1.jpg`
    )
  })

  it('our server in --local mode: the absolute path, on the file endpoint', () => {
    const abs = `/var/lib/telegram-bot-api/${MOVED}/videos/file 3.mp4`
    expect(telegramFileUrlFor(MOVED, abs, e)).toBe(
      `${FILES}/var/lib/telegram-bot-api/${MOVED}/videos/file%203.mp4`
    )
  })

  it('our server without --local: its own /file/ route', () => {
    expect(telegramFileUrlFor(MOVED, 'videos/file_3.mp4', e)).toBe(
      `${OURS}/file/bot${MOVED}/videos/file_3.mp4`
    )
  })

  it('a token in a local path is masked in logs like a cloud one', () => {
    const url = telegramFileUrlFor(
      MOVED,
      `/var/lib/telegram-bot-api/${MOVED}/videos/file_3.mp4`,
      e
    )
    const shown = redactBotToken(url)
    expect(shown).not.toContain('ZZmoved')
    expect(shown).toContain('900000011:<redacted>')
    expect(
      redactBotToken(`${CLOUD_API_ROOT}/file/bot${STAYS}/x`)
    ).not.toContain('ZZstays')
  })
})

describe('a bad value stops the start, naming the variable', () => {
  const throwsNaming = (e: Record<string, string>, name: string) =>
    expect(() => assertBotApiConfig(e)).toThrow(name)

  it('a root that is not a URL', () => {
    throwsNaming(
      { TELEGRAM_API_ROOT: 'telegram-bot-api:8081x y' },
      'TELEGRAM_API_ROOT'
    )
  })

  it('a root with a path, a scheme that is not http, credentials', () => {
    throwsNaming({ TELEGRAM_API_ROOT: `${OURS}/bot` }, 'TELEGRAM_API_ROOT')
    throwsNaming({ TELEGRAM_API_ROOT: 'ftp://host:21' }, 'TELEGRAM_API_ROOT')
    throwsNaming(
      { TELEGRAM_API_ROOT: 'http://u:p@host:8081' },
      'TELEGRAM_API_ROOT'
    )
    throwsNaming(
      { ...env('900000011'), TELEGRAM_API_FILES_ROOT: 'nope' },
      'TELEGRAM_API_FILES_ROOT'
    )
  })

  it('the cloud named as OUR server', () => {
    throwsNaming({ TELEGRAM_API_ROOT: CLOUD_API_ROOT }, 'TELEGRAM_API_ROOT')
  })

  it('bots listed with nowhere to go, or no way to read their files', () => {
    throwsNaming({ BOT_API_LOCAL_BOTS: '900000011' }, 'TELEGRAM_API_ROOT')
    throwsNaming(
      { TELEGRAM_API_ROOT: OURS, BOT_API_LOCAL_BOTS: '900000011' },
      'TELEGRAM_API_FILES_ROOT'
    )
  })

  it('a bare username: refused, with the fix in the message', () => {
    expect(() => assertBotApiConfig(env('Kaya_easy_art_bot'))).toThrow(
      /BOT_API_LOCAL_BOTS entry #1 "Kaya_easy_art_bot".*Kaya_easy_art_bot=<id>/
    )
  })

  it('garbage and a name given two ids', () => {
    throwsNaming(env('900000011, ???'), 'BOT_API_LOCAL_BOTS entry #2')
    throwsNaming(env('a_bot=900000011, b_bot=900000011'), 'BOT_API_LOCAL_BOTS')
  })

  /*
   * THE ONE MISTAKE THAT IS ALSO A LEAK. A token pasted into the list must
   * stop the start -- and must not be printed by the error that stops it.
   */
  it('a TOKEN pasted into the list: refused, and not echoed', () => {
    let message = ''
    try {
      assertBotApiConfig(env(`900000011, ${STAYS}`))
    } catch (e) {
      message = String((e as Error).message)
    }
    expect(message).toContain('BOT_API_LOCAL_BOTS entry #2')
    expect(message).toContain('TOKEN')
    expect(message).not.toContain('ZZstays')
  })

  it('a token-shaped value in a root is masked in its error too', () => {
    let message = ''
    try {
      assertBotApiConfig({ TELEGRAM_API_ROOT: `x${STAYS}` })
    } catch (e) {
      message = String((e as Error).message)
    }
    expect(message).toContain('TELEGRAM_API_ROOT')
    expect(message).not.toContain('ZZstays')
  })

  it('every call site throws too, not only the startup check', () => {
    expect(() => telegramApiFor(MOVED, { BOT_API_LOCAL_BOTS: 'x' })).toThrow(
      'BOT_API_LOCAL_BOTS'
    )
  })
})

describe('the startup line', () => {
  it('names ids, never tokens', () => {
    const line = describeBotApiConfig([MOVED, STAYS], env('900000011'))
    expect(line).toContain('1 of 2')
    expect(line).toContain('900000011')
    expect(line).not.toContain('ZZ')
  })
})
