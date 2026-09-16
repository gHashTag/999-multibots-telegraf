/**
 * 7200 LINES A DAY SAYING NOTHING HAPPENED.
 *
 * Measured on the live deploy 2026-09-16: a 500-line window of production log
 * held 313 INFO lines, and almost all of them were this one timer --
 *
 *   09:53:32 [INFO]: '🔍 Запрос к Supabase завершен: {"hasData":true,"dataLength":0,…}'
 *   09:54:32 [INFO]: '🔍 Запрос к Supabase завершен: {"hasData":true,"dataLength":0,…}'
 *   09:55:32 [INFO]: '🔍 Запрос к Supabase завершен: {"hasData":true,"dataLength":0,…}'
 *
 * `setupNotificationProcessor` runs `processNotificationQueue` every 60 seconds
 * and an IDLE tick -- the normal state -- emitted five info lines before
 * returning. Five a minute is 7200 a day. A real incident does not get lost in
 * a log like that, it gets buried in it, which is the entire cost.
 *
 * SILENCE IS NOT ZERO, and here that rule is the whole design. The one thing
 * those five lines bought was liveness: they were the only way an operator
 * could tell "the poller is alive and idle" from "the poller is dead". Nothing
 * else carries that signal -- the startup lines fire once, the hourly cleanup
 * is a different timer that keeps logging while this one is wedged, and
 * exclusiveTick speaks only when a tick overlaps or throws. So the narration is
 * cut AND a heartbeat is added, and both halves are pinned below.
 *
 * A heartbeat is only worth anything if it can be absent and if it ADVANCES:
 * the last two cases are the controls. One drives the poller against an
 * unreachable Supabase and proves nothing beats; the other proves the count
 * rises, because a frozen counter would be as useless as silence.
 *
 * Driven, not read: the real handler, the real logger and the real Telegram
 * transport, with a capturing winston transport watching what was written AND
 * AT WHICH LEVEL -- so a line demoted to debug is genuinely dropped by winston
 * at the production default rather than merely renamed.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import Transport from 'winston-transport'

const logError = vi.fn().mockResolvedValue(undefined)

vi.mock('@/services/telegram-log.service', () => ({
  telegramLogService: {
    isReady: () => true,
    logError,
    initializeOnce: vi.fn(),
    log: vi.fn(),
  },
}))

/** What the fake Supabase answers with on the next call. */
const db = vi.hoisted(() => ({
  connectionError: null as any,
  selectError: null as any,
  rows: [] as any[],
}))

vi.mock('@/core/supabase', () => {
  const rowsBuilder: any = {
    eq: () => rowsBuilder,
    lt: () => rowsBuilder,
    order: () => rowsBuilder,
    limit: async () => ({ data: db.rows, error: db.selectError }),
  }
  return {
    supabase: {
      from: () => ({
        // The connection probe is `select('count', { head: true })`; the queue
        // read is the chained builder. One `from()` serves both, as in production.
        select: (_columns: string, options?: { head?: boolean }) =>
          options?.head
            ? Promise.resolve({ error: db.connectionError })
            : rowsBuilder,
        update: () => ({ eq: async () => ({ error: null }) }),
        delete: () => ({ eq: () => ({ lt: async () => ({ error: null }) }) }),
      }),
    },
  }
})

import { logger } from '@/utils/logger'
import {
  NotificationHandler,
  HEARTBEAT_EVERY_POLLS,
} from '@/handlers/notificationHandler'

/**
 * Only records winston actually ROUTED arrive here. The logger's level is the
 * production default ('info', because LOG_LEVEL is unset in the image), so a
 * line moved to debug never reaches this transport -- which is the property
 * under test, and it cannot be faked by renaming a method.
 */
class CaptureTransport extends Transport {
  public records: Array<{ level: string; message: string; meta: any }> = []
  log(info: any, next: () => void) {
    const { level, message, timestamp, ...meta } = info
    this.records.push({ level, message: String(message), meta })
    next()
  }
}
const capture = new CaptureTransport({})
logger.add(capture)
afterAll(() => logger.remove(capture))

const telegramTransport = (
  logger as unknown as { transports: any[] }
).transports.find(t => t.constructor.name === 'TelegramLogTransport') as any

const settle = () => new Promise(resolve => setTimeout(resolve, 10))

const at = (level: string) => capture.records.filter(r => r.level === level)
const beats = () =>
  capture.records.filter(r => r.message.includes('poller alive'))
/** What the owner would have been paged about. */
const paged = () => logError.mock.calls.length

const sendMessage = vi.fn().mockResolvedValue({})
const handler = () =>
  new NotificationHandler({ telegram: { sendMessage } } as never)

const row = (id: string) => ({
  id,
  telegram_id: '1613501411',
  message: 'hi',
  message_type: 'info',
  created_at: '',
  priority: 'medium' as const,
  attempts: 0,
  sent: false,
})

beforeEach(() => {
  logError.mockClear()
  sendMessage.mockClear()
  capture.records = []
  db.connectionError = null
  db.selectError = null
  db.rows = []
  telegramTransport.telegramLogService = { isReady: () => true, logError }
  telegramTransport.isInitialized = true
  telegramTransport.seen.clear()
})

describe('an idle poller beats, it does not narrate', () => {
  it('two hours of an empty queue is a handful of lines, not six hundred', async () => {
    const h = handler()
    const polls = HEARTBEAT_EVERY_POLLS * 2
    for (let i = 0; i < polls; i++) await h.processNotificationQueue()
    await settle()

    // The five lines the report quoted are gone from the routed log entirely.
    for (const narration of [
      'Начинаем обработку очереди уведомлений',
      'Подключение к Supabase успешно',
      'Выполняем запрос к Supabase pending_messages',
      'Запрос к Supabase завершен',
      'Нет уведомлений для отправки',
    ]) {
      expect(
        at('info')
          .map(r => r.message)
          .join('\n'),
        `the idle narration is still at info: ${narration}`
      ).not.toContain(narration)
    }

    // 30 polls used to be 150 info lines. Beats at the 1st, 15th and 30th.
    expect(at('info')).toHaveLength(3)
    expect(beats()).toHaveLength(3)
    expect(paged(), 'an idle poller must never wake anybody').toBe(0)
  })

  it('the heartbeat ADVANCES, which is the only thing that proves it is alive', async () => {
    /*
     * THE CONTROL THAT CAN FAIL. A beat emitted from a stuck counter, or a
     * constant string, would look identical in the log to a healthy poller. The
     * distinction the deleted lines bought is "alive and idle" vs "dead", and a
     * frozen number carries neither.
     */
    const h = handler()
    for (let i = 0; i < HEARTBEAT_EVERY_POLLS * 2; i++)
      await h.processNotificationQueue()
    await settle()

    const counts = beats().map(r => r.meta.polls)
    expect(counts).toEqual([
      1,
      HEARTBEAT_EVERY_POLLS,
      HEARTBEAT_EVERY_POLLS * 2,
    ])
    for (let i = 1; i < counts.length; i++)
      expect(counts[i]).toBeGreaterThan(counts[i - 1])
  })

  it('the first poll beats immediately, so a fresh deploy proves itself', async () => {
    // Otherwise a deploy that cannot reach Supabase at all looks identical to a
    // healthy one for fifteen minutes.
    await handler().processNotificationQueue()
    await settle()
    expect(beats()).toHaveLength(1)
    expect(beats()[0].meta.polls).toBe(1)
  })

  it('a poller that cannot reach Supabase does NOT beat, and pages', async () => {
    /*
     * THE OTHER HALF OF THE SAME CONTROL. A heartbeat that beats regardless of
     * whether the database answered would report a wedged poller as healthy.
     * The counter is incremented only after the select returns.
     */
    db.connectionError = {
      message: 'TypeError: fetch failed',
      code: undefined,
      details: null,
      hint: null,
    }
    const h = handler()
    for (let i = 0; i < HEARTBEAT_EVERY_POLLS + 1; i++)
      await h.processNotificationQueue()
    await settle()

    expect(beats(), 'a dead poller reported itself alive').toHaveLength(0)
    expect(
      at('error').length,
      'our own machinery failing must still be logged at error'
    ).toBeGreaterThan(0)
    expect(at('error')[0].message).toContain('Ошибка подключения к Supabase')
    expect(paged(), 'a Supabase outage must still reach the owner').toBe(1)
  })
})

describe('the work itself is as loud as it ever was', () => {
  it('a non-empty batch still announces itself at info', async () => {
    db.rows = [row('row-alpha'), row('row-beta')]
    await handler().processNotificationQueue()
    await settle()

    const info = at('info').map(r => r.message)
    expect(
      info.some(m => m.includes('📨 Найдено 2 уведомлений')),
      `the batch line was quieted too: ${JSON.stringify(info)}`
    ).toBe(true)
    expect(sendMessage).toHaveBeenCalledTimes(2)
  })

  it('the heartbeat reports what was picked up since the last one', async () => {
    // An idle beat reads 0; a beat after real work says how much there was, so
    // the line is a summary rather than a pulse with no content.
    const h = handler()
    db.rows = [row('row-alpha')]
    await h.processNotificationQueue()
    await settle()
    expect(beats()[0].meta.pickedUpSinceHeartbeat).toBe(1)
    expect(beats()[0].meta.queued).toBe(1)
  })

  it('a select failure still pages the owner', async () => {
    db.selectError = {
      message: 'column "sent" of relation "pending_messages" does not exist',
      code: '42703',
      details: null,
      hint: null,
    }
    await handler().processNotificationQueue()
    await settle()

    expect(at('error')[0].message).toContain('Ошибка при получении уведомлений')
    expect(paged(), 'a broken queue read must still reach the owner').toBe(1)
    expect(logError.mock.calls[0][0].details).toContain('42703')
  })

  it('a thrown fault inside the tick still pages', async () => {
    // The catch-all at the bottom of processNotificationQueue: if it stopped
    // paging, a crashing poller would look exactly like an idle one.
    db.rows = null as any
    const broken = new NotificationHandler({} as never)
    ;(broken as any).processMessage = () => {
      throw new TypeError('this.bot.telegram is undefined')
    }
    db.rows = [row('row-alpha')]
    await broken.processNotificationQueue()
    await settle()

    expect(
      at('error').some(r => r.message.includes('Критическая ошибка')),
      'a crash inside the tick went quiet'
    ).toBe(true)
    expect(paged()).toBe(1)
  })
})
