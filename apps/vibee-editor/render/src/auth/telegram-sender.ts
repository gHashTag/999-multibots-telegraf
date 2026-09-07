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
  текст: string
): Promise<void> {
  const t = токен()
  if (!t) {
    // Говорим ЧТО не так, а не «не удалось отправить»: без имени переменной
    // это сообщение не помогает никому.
    console.warn('[telegram] TELEGRAM_BOT_TOKEN не задан — уведомление не ушло')
    return
  }
  const res = await fetch(`${telegramApiFor(t)}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: telegramId, text: текст }),
  })
  if (!res.ok) {
    /*
     * Тело ответа Telegram НЕ печатается целиком: в нём эхо нашего же
     * сообщения. Печатаем код и описание — этого хватает, чтобы отличить
     * «человек заблокировал бота» (403) от «токен не тот» (401).
     */
    const тело = (await res.text().catch(() => '')).slice(0, 200) // cyrillic-ok
    const описание = /"description":"([^"]+)"/.exec(тело)?.[1] ?? 'без описания'
    throw new Error(`Telegram ответил ${res.status}: ${описание}`)
  }
}
