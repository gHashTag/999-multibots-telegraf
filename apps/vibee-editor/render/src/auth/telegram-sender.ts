/**
 * ОТПРАВКА СООБЩЕНИЯ В TELEGRAM ОТ ИМЕНИ БОТА — ОДНА ФУНКЦИЯ НА ВЕСЬ СЕРВИС.
 *
 * Отдельным файлом, а не строкой внутри маршрута, по двум причинам.
 *
 * First: `notifySignIn` must not know about HTTP or tokens -- that is what
 * запустить в тесте с подставным отправителем и проверить ТЕКСТ, а не сеть.
 *
 * Вторая: токен бота читается ЗДЕСЬ и только здесь. `render-server.ts` уже
 * держит свою копию этой отправки; две копии расходятся — одну поправят,
 * вторая продолжит слать по-старому. Новые места зовут эту.
 */

import { telegramApiFor } from '../telegram-api'
import { rewriteAppUrlsForToken } from '../app-links'
import {
  eventThreadForToken,
  triesServiceBot,
  viaHouseBot,
  type EventKey,
} from '../topic-event-tabs'
import { isHouse } from '../house-ids'
import { PLATFORM_OWNER_FALLBACK } from '../platform-owner'
import { HOUSE_DELIVERY_BOT } from '../spec/crm-story-reel.gen'

/**
 * Токен читается ПРИ КАЖДОМ ВЫЗОВЕ, а не один раз при импорте.
 *
 * Модуль может быть загружен раньше, чем разложены переменные окружения
 * (в этом сервисе секреты приезжают из Infisical на старте). Значение,
 * снятое при импорте, оказалось бы пустым навсегда — и отправка молча
 * не работала бы, а причина выглядела бы как «Telegram не отвечает».
 */
function токен(): string {
  return (process.env.TELEGRAM_BOT_TOKEN || '').trim()
}

/*
 * THE HOUSE HEARS THE RENDER FROM ITS OWN BOT (bot-event-tabs v2).
 *
 * Owner, 2026-10-09: "why does the bot write in another bot? we have one
 * main one now". Every send here left from TELEGRAM_BOT_TOKEN, the old
 * @neuro_blogger_bot, while the owner talks to Trinity in @t27ai_bot and
 * keeps its tabs there. A message for the house now goes through the house's
 * bot (crm-story-reel HOUSE_DELIVERY_BOT) and finds its tab there; the
 * service's bot only when that one was not used or did not deliver.
 */
function forHouse(telegramId: string): boolean {
  const owner = (
    process.env.OWNER_TELEGRAM_ID || PLATFORM_OWNER_FALLBACK
  ).trim()
  return isHouse(telegramId) || String(telegramId).trim() === owner
}

/** Sends through the bots the spec names, in order; false: no bot to send. */
async function throughItsBot(
  telegramId: string,
  send: (token: string) => Promise<void>
): Promise<boolean> {
  let house = ''
  if (forHouse(telegramId)) {
    const { tokenForBot } = await import('../agent/bot-farm')
    const bot = await tokenForBot(HOUSE_DELIVERY_BOT).catch(() => null)
    house = bot?.token ?? ''
  }
  const via = viaHouseBot(forHouse(telegramId), !!house)
  let delivered = false
  let houseError: unknown = null
  if (via)
    delivered = await send(house).then(
      () => true,
      e => {
        houseError = e
        console.warn(
          `[telegram] ${HOUSE_DELIVERY_BOT}: ${String(e).slice(0, 160)}`
        )
        return false
      }
    )
  if (!triesServiceBot(via, delivered)) return true
  const t = токен() // cyrillic-ok: pre-existing helper name
  if (t && t !== house) {
    await send(t)
    return true
  }
  if (houseError) throw houseError
  return false
}

export async function sendToTelegram(
  telegramId: string,
  message: string,
  /**
   * Buttons under the message. Optional: most sends have none, and a second
   * sender "but with a keyboard" would drift from this one exactly as the
   * two copies of the send itself once drifted.
   */
  replyMarkup?: unknown,
  /**
   * HTML for a card that carries its own markup (a `tg-time` entity, bold).
   * The caller escapes the person's text; plain text stays the default.
   */
  options?: {
    parseMode?: 'HTML'
    /** The event this is (bot-event-tabs.t27): it lands in that agent's tab. */
    event?: EventKey
  }
): Promise<void> {
  const sent = await throughItsBot(telegramId, t =>
    sendOnce(t, telegramId, message, replyMarkup, options)
  )
  if (!sent)
    // Говорим ЧТО не так, а не «не удалось отправить»: без имени переменной
    // это сообщение не помогает никому.
    console.warn('[telegram] TELEGRAM_BOT_TOKEN не задан — уведомление не ушло')
}

async function sendOnce(
  t: string,
  telegramId: string,
  message: string,
  replyMarkup: unknown,
  options: Parameters<typeof sendToTelegram>[3]
): Promise<void> {
  const thread = options?.event
    ? await eventThreadForToken(t, telegramId, options.event)
    : undefined
  const о = await fetch(`${telegramApiFor(t)}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: telegramId,
      ...(thread !== undefined ? { message_thread_id: thread } : {}),
      // A raw app URL opened outside Telegram has no signature and does not
      // open; it becomes this bot's t.me link (app-links.ts). getMe is asked
      // only when there is such a URL, on this bot's own Bot API host.
      text: await rewriteAppUrlsForToken(message, t),
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      ...(options?.parseMode ? { parse_mode: options.parseMode } : {}),
    }),
  })
  if (!о.ok) {
    /*
     * Тело ответа Telegram НЕ печатается целиком: в нём эхо нашего же
     * сообщения. Печатаем код и описание — этого хватает, чтобы отличить
     * «человек заблокировал бота» (403) от «токен не тот» (401).
     */
    const тело = (await о.text().catch(() => '')).slice(0, 200)
    const описание = /"description":"([^"]+)"/.exec(тело)?.[1] ?? 'без описания'
    throw new Error(`Telegram ответил ${о.status}: ${описание}`)
  }
}

/**
 * A video to the person's chat (the browser film, browser/film.ts). Same
 * token, same host choice and same error shape as sendToTelegram; multipart
 * because the bytes are ours, not at a public address Telegram could fetch.
 */
export async function sendVideoToTelegram(
  telegramId: string,
  mp4: Buffer,
  caption: string
): Promise<void> {
  const sent = await throughItsBot(telegramId, t =>
    sendVideoOnce(t, telegramId, mp4, caption)
  )
  if (!sent)
    console.warn(
      '[telegram] TELEGRAM_BOT_TOKEN is not set; the video was not sent'
    )
}

async function sendVideoOnce(
  t: string,
  telegramId: string,
  mp4: Buffer,
  caption: string
): Promise<void> {
  const form = new FormData()
  form.append('chat_id', telegramId)
  form.append('caption', await rewriteAppUrlsForToken(caption, t))
  form.append('supports_streaming', 'true')
  form.append(
    'video',
    new Blob([new Uint8Array(mp4)], { type: 'video/mp4' }),
    'agent-work.mp4'
  )
  const res = await fetch(`${telegramApiFor(t)}/sendVideo`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) {
    const body = (await res.text().catch(() => '')).slice(0, 200)
    const why = /"description":"([^"]+)"/.exec(body)?.[1] ?? 'no description'
    throw new Error(`Telegram answered ${res.status}: ${why}`)
  }
}
