/**
 * "ОШИБКА В LOGGER.ERROR" -- AN ALERT THAT NAMED THE PIPE IT CAME DOWN.
 *
 * Measured on the live deploy 2026-09-16:
 *
 *   09:00:15 [ERROR]: '[TelegramLog] ❌ Ошибка в logger.error'
 *   09:00:29 [ERROR]: '[TelegramLog] ❌ Ошибка в logger.error'
 *
 * One line, two defects.
 *
 * HALF A -- the title. `TelegramLogTransport.sendToTelegram` fell back to the
 * literal string 'logger.error' when a winston record carried neither `context`
 * nor `function`, which is what almost all of the ~1050 logger.error sites in
 * this repository do. telegram-log.service.ts builds the alert title as
 * `❌ Ошибка в <context>`, so the owner's push named the transport and they had
 * to open every alert to find out what had actually broken.
 *
 * HALF B -- the echo. Every `log()` mirrors the composed alert back into winston
 * and 'error' passed straight through, so each alert that was sent wrote TWO
 * error records locally: the one at the call site and this copy. "How many
 * errors today", read off the log, was roughly double.
 *
 * THE WHOLE CHAIN IS REAL HERE. A synthetic winston record goes into the real
 * transport found on the real logger; the transport's own level guard, the
 * fingerprint throttle and the real TelegramLogService all run; a fake bot
 * captures the text that would have gone to Telegram, and a real winston
 * transport captures what was written locally and AT WHAT LEVEL. Every
 * assertion below is on what the owner would actually have received, never on
 * the spelling of a source line.
 *
 * The three paired controls are in the last describe: quieting the echo must not
 * quiet a dead alert channel, an undelivered alert, or the recursion guard.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import Transport from 'winston-transport'

import { logger, contextFromMessage } from '@/utils/logger'
import {
  telegramLogService,
  TelegramLogService,
} from '@/services/telegram-log.service'

/** Every local record and the level it was routed at. */
class CaptureTransport extends Transport {
  public records: Array<{ level: string; message: string }> = []
  log(info: any, next: () => void) {
    this.records.push({ level: info.level, message: String(info.message) })
    next()
  }
}
const capture = new CaptureTransport({})
logger.add(capture)
afterAll(() => logger.remove(capture))

/**
 * Found the way production finds it -- on the logger -- so this breaks if it is
 * detached or renamed. Its service reference is primed by hand because under
 * vitest the constructor's lazy `import()` never settles and records would park
 * in `pendingLogs`; the reference given is the REAL singleton, so everything
 * downstream of it is production code.
 */
const transport = (logger as unknown as { transports: any[] }).transports.find(
  t => t.constructor.name === 'TelegramLogTransport'
) as any

/** What the owner's Telegram would have received. */
const sendMessage = vi.fn().mockResolvedValue({})
telegramLogService.initialize({
  catch: vi.fn(),
  telegram: { sendMessage },
  botInfo: { username: 'neuro_blogger_bot' },
} as never)

const settle = () => new Promise(resolve => setTimeout(resolve, 20))

/** Exactly the shape winston hands `Transport.log`. */
const feed = async (message: string, meta: Record<string, unknown> = {}) => {
  logger.error(message, meta)
  await settle()
}

/** The text Telegram was asked to deliver, title line first. */
const delivered = () => String(sendMessage.mock.calls.at(-1)![1])
const title = () =>
  delivered()
    .split('\n')
    .find(line => line.includes('Ошибка'))!

const errorsLogged = () =>
  capture.records.filter(r => r.level === 'error').map(r => r.message)

beforeEach(() => {
  sendMessage.mockClear()
  capture.records = []
  transport.telegramLogService = telegramLogService
  transport.isInitialized = true
  // One incident is one message; unrelated cases must not throttle each other.
  transport.seen.clear()
})

describe('the alert is titled after the subsystem that failed', () => {
  it('lifts the bracketed tag the message already carries', async () => {
    await feed('[answerAi] xAI Grok API error', {
      status: 400,
      error: 'Model not found: grok-2-latest',
    })
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(title()).toContain('❌ Ошибка в answerAi')
    expect(title(), 'the alert still names the transport').not.toContain(
      'logger.error'
    )
  })

  it('sees past a leading emoji, which is how most sites are written', async () => {
    await feed('❌ [CreateUserScene] Error processing subscription')
    expect(title()).toContain('❌ Ошибка в CreateUserScene')
  })

  it('an explicit context still wins over the derived one', async () => {
    // The 400-odd sites that DO classify themselves must not be overridden.
    await feed('[answerAi] xAI Grok API error', { context: 'answerAi:stream' })
    expect(title()).toContain('❌ Ошибка в answerAi:stream')
  })

  it('a bracket in the middle of a sentence is not a subsystem', async () => {
    /*
     * THE CONTROL THAT CAN FAIL. A greedier rule would title this alert
     * "❌ Ошибка в job-7" -- a job id, which is not a place and cannot be looked
     * up. Over-reaching here would replace one useless headline with another.
     */
    await feed('❌ getFile failed [job-7]: 404 from api.telegram.org')
    expect(title()).toBe('❌ Ошибка')
    expect(title()).not.toContain('job-7')
  })

  it('no tag: a plain title, and the owner loses nothing else', async () => {
    const message =
      '❌ Ошибка подключения к Supabase: connection refused after 3 attempts'
    await feed(message, { code: 'ECONNREFUSED', attempts: 3 })

    // The title is honest rather than long. The old trailing clause naming
    // the transport (asserted absent on the next line) was the lie.
    expect(title()).toBe('❌ Ошибка')
    expect(delivered()).not.toContain(' в logger.error')

    // Everything below the title is byte-for-byte what it was before.
    expect(delivered()).toContain('connection refused after 3 attempts')
    expect(delivered()).toContain('<pre>')
    expect(delivered()).toContain('ECONNREFUSED')
    expect(delivered()).toContain('"attempts": 3')
  })

  it.each([
    ['[TON NATIVE PAYMENT] Error creating payment'],
    ['🎬 [SimpleTextToVideoWizard] Generation error'],
    ['❌ Ошибка подключения к Supabase:'],
    ['Failed to notify admin'],
  ])('no real message ever produces "в logger.error" again: %s', async m => {
    await feed(m)
    expect(delivered()).not.toContain('logger.error')
  })

  it('a derived title never poisons the HTML payload', async () => {
    /*
     * THE HAZARD THIS FIX CREATED, AND THE CONTROL THAT CLOSES IT.
     *
     * The title is the one field telegram-log.service.ts did not escape, and
     * it did not need to be: `context` was always a developer literal. Deriving
     * it from the MESSAGE makes it data, and the send is parse_mode:'HTML' --
     * a single stray '<' makes Telegram answer 400 and the owner then gets
     * NOTHING for that incident, which is the loudest way to go silent.
     *
     * The redactor manufactures the same hazard on its own: its replacements
     * ('<redacted>', '<key>') are angle-bracketed, and the context is derived
     * from the REDACTED message on purpose.
     */
    await feed('[Item<T>] serialisation failed & dropped')
    expect(title()).toContain('Item&lt;T&gt;')
    expect(title()).not.toContain('<T>')
    expect(sendMessage.mock.calls.at(-1)![2].parse_mode).toBe('HTML')
  })

  describe('contextFromMessage, the rule itself', () => {
    it.each([
      ['[answerAi] xAI Grok API error', 'answerAi'],
      ['❌ [CreateUserScene] failed', 'CreateUserScene'],
      ['🎬 [SimpleTextToVideoWizard] error', 'SimpleTextToVideoWizard'],
      ['[ TON NATIVE PAYMENT ] Error', 'TON NATIVE PAYMENT'],
    ])('%s -> %s', (message, expected) => {
      expect(contextFromMessage(message)).toBe(expected)
    })

    it.each([
      ['❌ Ошибка подключения к Supabase:'],
      ['❌ getFile failed [job-7]: 404'],
      ['[]'],
      [''],
    ])('%s yields nothing, on purpose', message => {
      expect(contextFromMessage(message)).toBeUndefined()
    })
  })
})

describe('one incident is one ERROR line, not two', () => {
  it('the alert echo is a receipt at info, not a second incident', async () => {
    await feed('[answerAi] xAI Grok API error', { status: 400 })

    const errors = errorsLogged()
    expect(
      errors,
      `the echo is still counted as an incident: ${JSON.stringify(errors)}`
    ).toHaveLength(1)
    expect(errors[0]).toContain('[answerAi] xAI Grok API error')
    expect(
      errors[0],
      'the surviving ERROR line must be the ORIGINAL logger.error, not the [TelegramLog] echo'
    ).not.toContain('[TelegramLog]')

    // SILENCE IS NOT ZERO: the receipt is still in the log, and it still carries
    // the whole alert. It simply stops being counted and stops reaching
    // logs/error.log, which is bound at level 'error'.
    const echo = capture.records.find(r =>
      r.message.startsWith('[TelegramLog]')
    )
    expect(
      echo,
      'the receipt disappeared instead of being demoted'
    ).toBeDefined()
    expect(echo!.level).toBe('info')
    expect(echo!.message).toContain('answerAi')
  })
})

describe('what must still be loud after the echo was quieted', () => {
  it('the recursion guard still holds: an echo is never re-sent', async () => {
    await feed('[TelegramLog] ❌ Ошибка в answerAi')
    expect(
      sendMessage,
      'the transport re-sent its own echo: that is the recursion this guard exists for'
    ).not.toHaveBeenCalled()
  })

  it('a dead alert channel still shouts at ERROR', async () => {
    // An uninitialised service must not fail quiet: "no alerts" would read as
    // "no incidents", which is the defect this line was written for.
    const dead = new TelegramLogService()
    await dead.logError({ error: 'probe' })
    await settle()
    expect(
      errorsLogged().some(m => m.includes('TelegramLogService')),
      'demoting the echo also silenced the unwired-channel complaint'
    ).toBe(true)
  })

  it('an alert Telegram refused still shouts at ERROR', async () => {
    // The currently-unpinned twin: the channel is wired, and sendMessage fails.
    const refusing = new TelegramLogService()
    refusing.initialize({
      catch: vi.fn(),
      telegram: {
        sendMessage: vi.fn().mockRejectedValue(new Error('403: Forbidden')),
      },
      botInfo: { username: 'neuro_blogger_bot' },
    } as never)
    await refusing.logError({ error: '[answerAi] xAI Grok API error' })
    await settle()
    expect(
      errorsLogged().some(m => m.includes('alert NOT delivered')),
      'an alert that never arrived must not be reported at info'
    ).toBe(true)
  })

  it('the originating logger.error still reaches the owner', async () => {
    // The whole change is only a fix while this stays true.
    await feed('[notificationHandler] ❌ Ошибка при получении уведомлений')
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(delivered()).toContain('Ошибка при получении уведомлений')
  })
})
