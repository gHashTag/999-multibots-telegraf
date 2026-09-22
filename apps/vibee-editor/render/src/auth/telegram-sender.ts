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

export async function sendToTelegram(
  telegramId: string,
  message: string,
  /**
   * Buttons under the message. Optional: most sends have none, and a second
   * sender "but with a keyboard" would drift from this one exactly as the
   * two copies of the send itself once drifted.
   */
  replyMarkup?: unknown
): Promise<void> {
  const t = токен()
  if (!t) {
    // Говорим ЧТО не так, а не «не удалось отправить»: без имени переменной
    // это сообщение не помогает никому.
    console.warn('[telegram] TELEGRAM_BOT_TOKEN не задан — уведомление не ушло')
    return
  }
  const о = await fetch(`${telegramApiFor(t)}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: telegramId,
      text: message,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
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
  const t = токен() // cyrillic-ok: pre-existing helper name
  if (!t) {
    console.warn(
      '[telegram] TELEGRAM_BOT_TOKEN is not set; the video was not sent'
    )
    return
  }
  const form = new FormData()
  form.append('chat_id', telegramId)
  form.append('caption', caption)
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
