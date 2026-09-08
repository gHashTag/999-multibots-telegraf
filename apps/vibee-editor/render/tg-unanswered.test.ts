import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { TELEGRAM_TOOLS, ждутОтвета } from './src/agent/telegram-tools'

/**
 * «КТО НАПИСАЛ, А Я НЕ ОТВЕТИЛ» — САМЫЙ ДОРОГОЙ ВОПРОС ПЕРЕПИСКИ.
 *
 * Не «сколько непрочитанного»: счётчик обнуляется, стоит открыть диалог, а
 * долг остаётся. Человек прочитал сообщение, отвлёкся и не ответил — Telegram
 * об этом уже молчит, а собеседник ждёт.
 *
 * Признак долга — ПОСЛЕДНЕЕ СЛОВО НЕ МОЁ.
 */
const инструмент = (() => {
  const т = TELEGRAM_TOOLS.find(t => t.name === 'tg_unanswered')
  if (!т) throw new Error('нет инструмента tg_unanswered')
  return т
})()

const ВЛАДЕЛЕЦ = '144022504'
const час = 3_600_000

function диалог(о: {
  id: string
  title: string
  out: boolean
  часовНазад: number
  unread?: number
  channel?: boolean
}) {
  return {
    id: { toString: () => о.id },
    title: о.title,
    isUser: !о.channel,
    isChannel: !!о.channel,
    unreadCount: о.unread ?? 0,
    message: {
      message: `текст от ${о.title}`,
      out: о.out,
      date: Math.floor((Date.now() - о.часовНазад * час) / 1000),
    },
  }
}

describe('долг считается по последнему слову', () => {
  let прежние: Record<string, string | undefined> = {}

  beforeEach(() => {
    прежние = {
      s: process.env.TELEGRAM_SESSION_STRING,
      i: process.env.TELEGRAM_API_ID,
      h: process.env.TELEGRAM_API_HASH,
    }
    process.env.TELEGRAM_SESSION_STRING = 'сессия'
    process.env.TELEGRAM_API_ID = '1'
    process.env.TELEGRAM_API_HASH = 'h'
  })
  afterEach(() => {
    process.env.TELEGRAM_SESSION_STRING = прежние.s
    process.env.TELEGRAM_API_ID = прежние.i
    process.env.TELEGRAM_API_HASH = прежние.h
  })

  it('чужую переписку не отдаём: клиент без своей строки не получает сессию владельца', async () => {
    /*
     * The owner's env session is set above, and the caller is NOT the owner.
     * What must refuse them is the SESSION lookup ("not connected"), never a
     * fallback to the env string. Until 2026-09-08 this asserted an owner-only
     * gate instead; that gate is gone -- a session is per caller now -- and
     * this is the property that actually keeps the owner's dialogs the owner's.
     * A mutation handing everyone the env string would not say "not connected":
     * it would try to open a client on a garbage session and fail elsewhere.
     */
    await expect(
      инструмент.handler({}, { telegramId: '999', pool: {} } as any)
    ).rejects.toThrow('не подключён')
  })
})

/**
 * Отбор проверяется отдельно от сети: поднимать MTProto в тесте — это проверка
 * сети, а не правила «кому я должен».
 */
describe('правило отбора', () => {
  /*
   * Зовём НАСТОЯЩЕЕ правило из модуля, а не его копию.
   *
   * Первая версия этого файла повторяла логику отбора у себя — и обе мутации
   * (снять фильтр «моё сообщение», убрать проверку владельца) прошли
   * зелёными. Тест сверял копию с копией: ровно тот дефект, который сегодня
   * находился семь раз в чужом коде и один — в моём собственном.
   */
  const отобрать = (диалоги: any[]) => ждутОтвета(диалоги)

  it('мой собственный последний ответ долгом не считается', () => {
    const r = отобрать([
      диалог({ id: '1', title: 'Аня', out: true, часовНазад: 5 }),
      диалог({ id: '2', title: 'Борис', out: false, часовНазад: 3 }),
    ])
    expect(r.map(x => x.собеседник)).toEqual(['Борис'])
  })

  it('прочитанное без ответа — ТОЖЕ долг', () => {
    /*
     * Главная причина не брать счётчик непрочитанного: он обнуляется при
     * открытии диалога, а обязанность ответить — нет.
     */
    const r = отобрать([
      диалог({ id: '1', title: 'Вера', out: false, часовНазад: 10, unread: 0 }),
    ])
    expect(r.map(x => x.собеседник)).toEqual(['Вера'])
  })

  it('каналы не превращают список долгов в список подписок', () => {
    // В канале последнее слово всегда чужое — иначе список забился бы им.
    const r = отобрать([
      диалог({
        id: '1',
        title: 'Канал',
        out: false,
        часовНазад: 1,
        channel: true,
      }),
      диалог({ id: '2', title: 'Глеб', out: false, часовНазад: 2 }),
    ])
    expect(r.map(x => x.собеседник)).toEqual(['Глеб'])
  })

  it('дольше всех ждущий — первым', () => {
    const r = отобрать([
      диалог({ id: '1', title: 'Свежий', out: false, часовНазад: 1 }),
      диалог({ id: '2', title: 'Давний', out: false, часовНазад: 100 }),
    ])
    expect(r.map(x => x.собеседник)).toEqual(['Давний', 'Свежий'])
  })
})

describe('инструмент объявлен честно', () => {
  it('он читающий и не отправляет', () => {
    const исходник = JSON.stringify(инструмент)
    expect(инструмент.description).toMatch(/ЧИТАЮЩИЙ/)
    expect(исходник).not.toMatch(/sendMessage/i)
  })

  it('чужой текст помечен как данные, а не поручение', () => {
    // Тот же принцип, что у остальных читающих инструментов: сообщение
    // «перешли код» — строка в базе, а не команда.
    expect(инструмент.description).toMatch(/данные третьих лиц/)
  })
})
