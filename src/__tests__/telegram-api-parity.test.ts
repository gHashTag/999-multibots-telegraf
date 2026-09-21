import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import * as bot from '@/services/telegramApi'
import * as render from '../../apps/vibee-editor/render/src/telegram-api'

/**
 * THREE COPIES, ONE ANSWER.
 *
 * The bot, the render and the plain-node scripts each carry the host logic
 * (none can import another's). If two of them ever disagreed about a bot, one
 * service would call the cloud for a bot that left it -- the exact failure the
 * per-bot design exists to prevent. So all three are fed the same table and
 * must give the same answer, error or not, for every row.
 */
const scripts = createRequire(__filename)('../../scripts/lib/telegram-api.cjs')

const MOVED = '900000011:ZZmovedmovedmovedmovedmovedmovedmoved'
const STAYS = '900000022:ZZstaysstaysstaysstaysstaysstaysstays'
const OURS = 'http://telegram-bot-api.railway.internal:8081'
const FILES = 'http://telegram-bot-api.railway.internal:8082/'

const ENVS: Record<string, Record<string, string>> = {
  unset: {},
  'server, nobody listed': { TELEGRAM_API_ROOT: OURS },
  'one id': {
    TELEGRAM_API_ROOT: OURS,
    TELEGRAM_API_FILES_ROOT: FILES,
    BOT_API_LOCAL_BOTS: '900000011',
  },
  'labelled, spaces and semicolons': {
    TELEGRAM_API_ROOT: ` ${OURS}/ `,
    TELEGRAM_API_FILES_ROOT: FILES,
    BOT_API_LOCAL_BOTS: ' @Kaya_easy_art_bot=900000011 ; x_bot=900000044 ',
  },
  'bare username': {
    TELEGRAM_API_ROOT: OURS,
    TELEGRAM_API_FILES_ROOT: FILES,
    BOT_API_LOCAL_BOTS: 'Kaya_easy_art_bot',
  },
  'token pasted': {
    TELEGRAM_API_ROOT: OURS,
    TELEGRAM_API_FILES_ROOT: FILES,
    BOT_API_LOCAL_BOTS: MOVED,
  },
  'no files root': { TELEGRAM_API_ROOT: OURS, BOT_API_LOCAL_BOTS: '900000011' },
  'cloud as ours': { TELEGRAM_API_ROOT: 'https://api.telegram.org' },
  'path in root': { TELEGRAM_API_ROOT: `${OURS}/x` },
  'not a url': { TELEGRAM_API_ROOT: 'not a url' },
}

const PATHS = [
  'photos/file_1.jpg',
  `/var/lib/telegram-bot-api/${MOVED}/videos/file 3.mp4`,
]

type Copy = typeof bot | typeof render | any

function answers(copy: Copy, env: Record<string, string>) {
  const out: unknown[] = []
  for (const token of [MOVED, STAYS, 'not-a-token']) {
    try {
      out.push([
        copy.botApiIsLocalFor(token, env),
        copy.telegramApiRootFor(token, env),
        copy.telegramApiFor(token, env),
        copy.telegramDownloadLimitFor(token, env),
        ...PATHS.map(p => copy.telegramFileUrlFor(token, p, env)),
      ])
    } catch (e) {
      out.push(`throws: ${(e as Error).message}`)
    }
  }
  return out
}

describe('bot, render and scripts agree about every bot', () => {
  for (const [name, env] of Object.entries(ENVS)) {
    it(name, () => {
      const fromBot = answers(bot, env)
      expect(answers(render, env)).toEqual(fromBot)
      expect(answers(scripts, env)).toEqual(fromBot)
    })
  }

  it('the table exercises both branches and the errors', () => {
    const flat = JSON.stringify(
      Object.values(ENVS).map(env => answers(bot, env))
    )
    expect(flat).toContain(OURS)
    expect(flat).toContain('https://api.telegram.org')
    expect(flat).toContain('throws: ')
  })

  it('the three copies know the same constants', () => {
    for (const copy of [render, scripts]) {
      expect(copy.CLOUD_API_ROOT).toBe(bot.CLOUD_API_ROOT)
      expect(copy.CLOUD_DOWNLOAD_LIMIT).toBe(bot.CLOUD_DOWNLOAD_LIMIT)
      expect(copy.LOCAL_DOWNLOAD_LIMIT).toBe(bot.LOCAL_DOWNLOAD_LIMIT)
      expect([copy.ROOT_VAR, copy.FILES_VAR, copy.BOTS_VAR]).toEqual([
        bot.ROOT_VAR,
        bot.FILES_VAR,
        bot.BOTS_VAR,
      ])
    }
  })

  it('the shell helper decides with the SERVICE’s variables, read from kv lines', () => {
    const env = scripts.envFromKv(
      [
        'SOMETHING_ELSE=1',
        `TELEGRAM_API_ROOT=${OURS}`,
        `TELEGRAM_API_FILES_ROOT=${FILES}`,
        'BOT_API_LOCAL_BOTS=900000011',
      ].join('\n')
    )
    expect(Object.keys(env).sort()).toEqual([
      'BOT_API_LOCAL_BOTS',
      'TELEGRAM_API_FILES_ROOT',
      'TELEGRAM_API_ROOT',
    ])
    expect(scripts.telegramApiRootFor(MOVED, env)).toBe(OURS)
  })
})
