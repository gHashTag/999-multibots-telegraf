import { describe, it, expect, vi, beforeEach } from 'vitest'

/*
 * THREE DAYS OF 🚨 ALERTS THAT NAMED NO INCIDENT.
 *
 * Every `logger.error` in this application is forwarded to the owner's Telegram
 * (TelegramLogTransport, src/utils/logger.ts). That makes the choice between
 * `error` and `warn`/`info` a USER-FACING choice, not a stylistic one -- and
 * four ordinary states were spending it:
 *
 *   • the pulse channel id did not resolve for the bot that used it, so every
 *     generated image produced three `[pulse] Ошибка при отправке` errors;
 *   • an account with no profile photo produced an INVALID_URL error;
 *   • a Supabase lookup that legitimately found no row (PGRST116) produced one;
 *   • and the daily digest, which is supposed to be the summary of all this,
 *     counted zero of them and said `Ошибок: 0 / Система работает стабильно`.
 *
 * The last one is why this file exists as one file: the storm and the report
 * that denied the storm are the same defect seen from two ends.
 */
vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/core/supabase', () => ({ supabase: {}, supabaseAdmin: {} }))
vi.mock('@/inngest_app/client', () => ({
  inngest: { createFunction: () => ({}), send: async () => ({}) },
  createInngestFailureHandler: () => async () => undefined,
}))
vi.mock('@/inngest_app/inngestClient', () => ({
  inngest: { createFunction: () => ({}), send: async () => ({}) },
}))
vi.mock('@/inngest_app/functions/monitoring/monitoringBot', () => ({
  getMonitoringBot: () => null,
}))

import { logger } from '@/utils/logger'
import {
  resolvePulseChatId,
  isPulseDestinationDead,
  reportPulseFailure,
  resetPulseDestinationState,
} from '@/helpers/pulseDestination'
import { isChatGone, telegramErrorInfo } from '@/helpers/telegramErrors'
import {
  countLogLevels,
  resolveMonitorProvider,
} from '@/inngest_app/functions/monitoring/logMonitor'

const mockOf = (fn: unknown) =>
  fn as unknown as { mock: { calls: unknown[][] } }

/** The shape Telegraf throws: a TelegramError with code and description. */
const telegramError = (code: number, description: string) =>
  Object.assign(new Error(`${code}: ${description}`), {
    response: { error_code: code, description },
  })

describe('the pulse channel is named, not guessed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetPulseDestinationState()
  })

  it('PULSE_CHAT_ID wins, because setting it is a decision', () => {
    expect(
      resolvePulseChatId({
        PULSE_CHAT_ID: '-100111',
        ADMIN_CHAT_ID: '-100222',
      } as NodeJS.ProcessEnv)
    ).toBe('-100111')
  })

  it('falls back to ADMIN_CHAT_ID, which production already sets', () => {
    expect(
      resolvePulseChatId({
        ADMIN_CHAT_ID: '-1002298297094',
      } as NodeJS.ProcessEnv)
    ).toBe('-1002298297094')
  })

  it('a @username reaches the chat only with the @, so it is added', () => {
    expect(
      resolvePulseChatId({
        ADMIN_CHAT_ID: 'neuro_blogger_pulse',
      } as NodeJS.ProcessEnv)
    ).toBe('@neuro_blogger_pulse')
  })

  it('with nothing configured it uses the MEASURED id, not the one that 400s', () => {
    // -1002737186844 was hard-coded in three places and answers
    // "400: Bad Request: chat not found" for the bot that posts to it.
    const id = resolvePulseChatId({} as NodeJS.ProcessEnv)
    expect(id).toBe('-1002298297094')
    expect(id).not.toBe('-1002737186844')
  })
})

describe('an unreachable pulse channel is one warning, not three errors an image', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetPulseDestinationState()
  })

  it('the first "chat not found" warns once and tells the caller to stop', () => {
    const stop = reportPulseFailure(
      'Ошибка при отправке ФОТО',
      '-1002298297094',
      telegramError(400, 'Bad Request: chat not found')
    )
    expect(stop, 'a dead destination must not be retried').toBe(true)
    expect(mockOf(logger.warn).mock.calls).toHaveLength(1)
    expect(mockOf(logger.error).mock.calls).toHaveLength(0)
  })

  it('the next two sends of the same image say nothing at all', () => {
    // This is the storm, exactly as it reached the owner: photo, then text,
    // then the retry -- three messages describing one misconfiguration.
    const gone = telegramError(400, 'Bad Request: chat not found')
    reportPulseFailure('ФОТО', '-1002298297094', gone)
    reportPulseFailure('ТЕКСТ', '-1002298297094', gone)
    reportPulseFailure('ФОТО (повтор)', '-1002298297094', gone)
    expect(mockOf(logger.warn).mock.calls).toHaveLength(1)
    expect(mockOf(logger.error).mock.calls).toHaveLength(0)
  })

  it('the warning carries the remedy, since nobody can act on "недоступен"', () => {
    reportPulseFailure(
      'ФОТО',
      '-1002298297094',
      telegramError(403, 'Forbidden: bot was kicked from the channel chat')
    )
    const meta = JSON.stringify(mockOf(logger.warn).mock.calls[0][1])
    expect(meta).toContain('PULSE_CHAT_ID')
    expect(meta).toContain('-1002298297094')
  })

  it('a REAL failure keeps its ERROR and its alert', () => {
    // The latch must not become a blanket silencer: a 500 or a network fault
    // is news, and the caller should keep trying.
    const stop = reportPulseFailure(
      'ФОТО',
      '-1002298297094',
      new Error('socket hang up')
    )
    expect(stop).toBe(false)
    expect(mockOf(logger.error).mock.calls).toHaveLength(1)
    expect(mockOf(logger.warn).mock.calls).toHaveLength(0)
  })

  it('the latch is per destination: fixing the id must heal without a deploy', () => {
    reportPulseFailure(
      'ФОТО',
      '-1002737186844',
      telegramError(400, 'Bad Request: chat not found')
    )
    expect(isPulseDestinationDead('-1002737186844')).toBe(true)
    expect(isPulseDestinationDead('-1002298297094')).toBe(false)
  })

  it('and it expires, so a human adding the bot is enough', () => {
    reportPulseFailure(
      'ФОТО',
      '-100777',
      telegramError(400, 'Bad Request: chat not found')
    )
    const thirtyOneMinutesOn = Date.now() + 31 * 60 * 1000
    expect(isPulseDestinationDead('-100777', thirtyOneMinutesOn)).toBe(false)
  })
})

describe('telegram errors are classified by what they mean', () => {
  it('reads the code and description out of a Telegraf error', () => {
    expect(
      telegramErrorInfo(telegramError(400, 'Bad Request: chat not found'))
    ).toEqual({ code: 400, description: 'Bad Request: chat not found' })
  })

  const gone = [
    [400, 'Bad Request: chat not found'],
    [403, 'Forbidden: bot was blocked by the user'],
    [403, 'Forbidden: user is deactivated'],
    [400, 'Bad Request: PEER_ID_INVALID'],
  ] as const
  for (const [code, description] of gone) {
    it(`"${description}" is a dead chat, not an incident`, () => {
      expect(isChatGone(telegramError(code, description))).toBe(true)
    })
  }

  it('a 500 is NOT a dead chat -- the chat is fine, Telegram is not', () => {
    expect(isChatGone(telegramError(500, 'Internal Server Error'))).toBe(false)
  })

  it('a plain network error is not a dead chat either', () => {
    expect(isChatGone(new Error('ETIMEDOUT'))).toBe(false)
  })
})

describe('the daily digest counts the errors this application actually writes', () => {
  /*
   * The regression, in the format winston really emits. The old counter looked
   * for `"level":"error"`; not one of these lines contains it, which is how
   * three consecutive days of alerts were reported as `Ошибок: 0`.
   */
  const realLog = [
    '2026-09-15 09:00:01 [INFO]: 🚀 Bot started',
    '2026-09-15 09:04:12 [ERROR]: ❌ [pulse] Ошибка при отправке ФОТО',
    '2026-09-15 09:04:12 [ERROR]: ❌ [sendPhotoWithFallback] FAIL: Invalid photoUrl',
    '2026-09-15 09:05:00 [WARN]: ⚠️ Provider replicate is degraded',
    '2026-09-15 13:00:00 [ERROR]: 401 API key ****ex0A is invalid',
  ]

  it('counts printf lines -- the ones the owner was told did not exist', () => {
    expect(countLogLevels(realLog)).toEqual({
      errors: 3,
      warnings: 1,
      info: 1,
    })
  })

  it('still counts the JSON form, because the security logger writes it', () => {
    expect(
      countLogLevels([
        '{"level":"error","message":"auth failure"}',
        '{"level":"warn","message":"rate limited"}',
      ])
    ).toEqual({ errors: 1, warnings: 1, info: 0 })
  })

  it('one line is charged to ONE level, even when it mentions another', () => {
    // logger.info('…', { level: 'error' }) prints `[INFO]: … {"level":"error"}`.
    // Counting each level independently charged that single line twice and
    // invented an error that never happened.
    expect(
      countLogLevels([
        '2026-09-15 09:00:01 [INFO]: retry policy {"level":"error"}',
      ])
    ).toEqual({ errors: 0, warnings: 0, info: 1 })
  })

  it('a line with no level at all is counted nowhere', () => {
    expect(
      countLogLevels(['    at Object.<anonymous> (src/index.ts:1:1)'])
    ).toEqual({ errors: 0, warnings: 0, info: 0 })
  })
})

describe('the monitor posts its key to the door that key opens', () => {
  it('a GLM key goes to the CODING plan endpoint, never the standard one', () => {
    // Measured 2026-09-15: this key returns 200 against
    // https://api.z.ai/api/coding/paas/v4 and HTTP 429 code 1113
    // ("Insufficient balance or no resource package") against /api/paas/v4.
    // The 429 is about the DOOR, not about the balance.
    const p = resolveMonitorProvider({ GLM_API_KEY: 'k' } as NodeJS.ProcessEnv)
    expect(p?.name).toBe('zai')
    expect(p?.baseURL).toBe('https://api.z.ai/api/coding/paas/v4')
    expect(p?.baseURL).not.toBe('https://api.z.ai/api/paas/v4')
  })

  it('GLM thinking is disabled: max_tokens is charged for the deliberation', () => {
    // At max_tokens 16 the same ping spent all 16 on reasoning and returned
    // EMPTY content with finish_reason "stop". The report needs the answer.
    const p = resolveMonitorProvider({ GLM_API_KEY: 'k' } as NodeJS.ProcessEnv)
    expect(p?.extraBody).toEqual({ thinking: { type: 'disabled' } })
  })

  it('an explicit ZAI_BASE_URL still wins', () => {
    const p = resolveMonitorProvider({
      GLM_API_KEY: 'k',
      ZAI_BASE_URL: 'https://proxy.example/v4',
    } as NodeJS.ProcessEnv)
    expect(p?.baseURL).toBe('https://proxy.example/v4')
  })

  it('an OpenAI key gets no baseURL and no GLM-only fields', () => {
    // The storm's 13:00 alert -- `401 ... ****ex0A is invalid` -- was read at
    // first as a key/endpoint mismatch. Pairing them is NECESSARY and NOT
    // SUFFICIENT: measured the same day, both the OpenAI and the DeepSeek key
    // return 401 against their own correct endpoints. They need rotating.
    const p = resolveMonitorProvider({
      OPENAI_API_KEY: 'sk-x',
    } as NodeJS.ProcessEnv)
    expect(p?.name).toBe('openai')
    expect(p?.baseURL).toBeUndefined()
    expect(p?.extraBody).toEqual({})
  })

  it('a DeepSeek key goes to DeepSeek, not to OpenAI', () => {
    const p = resolveMonitorProvider({
      DEEPSEEK_API_KEY: 'dk',
    } as NodeJS.ProcessEnv)
    expect(p?.name).toBe('deepseek')
    expect(p?.baseURL).toBe('https://api.deepseek.com')
  })

  it('with no key at all it returns null instead of inventing a client', () => {
    expect(resolveMonitorProvider({} as NodeJS.ProcessEnv)).toBeNull()
  })
})
