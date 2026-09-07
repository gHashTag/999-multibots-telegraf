import { Composer, Markup } from 'telegraf'
import type { MyContext } from '../interfaces'
import { isRussianFromState } from '../helpers/centralizedLanguage'
import { logger } from '../utils/logger'

/**
 * «ПОДЕЛИТЬСЯ НОМЕРОМ» — ОДНО НАЖАТИЕ ВМЕСТО ОДИННАДЦАТИ ЦИФР.
 *
 * Владелец 07.09.2026: «заполни телефон из телеграм, если открыт, чтобы руками
 * не писать».
 *
 * ── ЧЕГО TELEGRAM НЕ ДАЁТ, И ЭТО НЕ ОБХОДИТСЯ ─────────────────────────────
 *
 * Бот НЕ ЗНАЕТ номер человека, сколько бы тот ему ни писал. Проверено
 * замером: ни в базе рендера, ни в Supabase (42 поля в `users`) телефона нет
 * вовсе. Telegram передаёт номер боту РОВНО в одном случае — человек сам
 * нажал кнопку «Поделиться номером». Это не ограничение нашей реализации, а
 * устройство платформы, и обойти его нельзя ничем.
 *
 * Поэтому «не писать руками» достижимо так: один раз нажать здесь — и дальше
 * подставляется само, во всех клиентах.
 *
 * ── ПОЧЕМУ ПРОВЕРЯЕТСЯ `contact.user_id` ──────────────────────────────────
 *
 * Кнопка отдаёт СВОЙ номер, но человек может прислать и ЧУЖОЙ контакт из
 * записной книжки — обычным вложением. Тогда `contact.user_id` либо пуст,
 * либо не равен отправителю. Записать такой номер значило бы дать любому
 * подставить чужой телефон в чужой аккаунт — и потом отправить на него код
 * подключения.
 */
export const sharePhoneCommand = new Composer<MyContext>()

const БАЗА = 'https://vibee-render-production.up.railway.app'

/** Кнопка-просьба. Показывается там, где номер вот-вот понадобится. */
export function клавиатураНомера(isRu: boolean) {
  return Markup.keyboard([
    [Markup.button.contactRequest(isRu ? '📱 Поделиться номером' : '📱 Share my number')],
  ])
    .resize()
    .oneTime()
}

sharePhoneCommand.command('phone', async ctx => {
  const isRu = isRussianFromState(ctx)
  await ctx.reply(
    isRu
      ? 'Нажмите кнопку ниже — Telegram спросит разрешение и передаст номер.\n\n' +
          'Он нужен только чтобы не набирать его руками при подключении аккаунта. ' +
          'Кода и пароля мы не храним, номер убирается вместе с отключением.'
      : 'Press the button below — Telegram will ask for permission and pass the number.\n\n' +
          'It is only used so you do not have to type it when connecting your account.',
    клавиатураНомера(isRu)
  )
})

/**
 * Пришёл контакт. Проверяем, что он СВОЙ, и передаём серверу.
 *
 * Ответ человеку — всегда, в том числе при отказе: молчание после нажатия
 * кнопки неотличимо от поломки.
 */
sharePhoneCommand.on('contact', async ctx => {
  const isRu = isRussianFromState(ctx)
  const контакт = ctx.message.contact
  const свой = контакт?.user_id && String(контакт.user_id) === String(ctx.from?.id)

  if (!свой) {
    await ctx.reply(
      isRu
        ? 'Это чужой контакт. Нужен ваш номер — нажмите кнопку «Поделиться номером».'
        : 'That is somebody else’s contact. Please use the “Share my number” button.',
      клавиатураНомера(isRu)
    )
    return
  }

  const ключ = process.env.RENDER_API_KEY || ''
  if (!ключ) {
    // Называем ПРИЧИНУ в журнал, а человеку — что делать. «Не получилось»
    // без причины отправляет искать ошибку у себя.
    logger.error('[phone] RENDER_API_KEY не задан — номер не сохранён')
    await ctx.reply(
      isRu
        ? 'Не удалось сохранить номер: сервис не настроен. Введите его вручную при подключении.'
        : 'Could not save the number: the service is not configured.'
    )
    return
  }

  try {
    const о = await fetch(`${БАЗА}/api/tg/phone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': ключ },
      body: JSON.stringify({
        telegram_id: String(ctx.from?.id ?? ''),
        phone: контакт.phone_number,
        источник: 'кнопка в боте',
      }),
    })
    if (!о.ok) throw new Error(`сервер ответил ${о.status}`)
    await ctx.reply(
      isRu
        ? '✅ Номер сохранён. Теперь при подключении аккаунта он подставится сам — набирать не придётся.'
        : '✅ Saved. It will be filled in for you when you connect your account.',
      Markup.removeKeyboard()
    )
  } catch (e) {
    logger.error('[phone] не удалось передать номер', {
      error: e instanceof Error ? e.message : String(e),
    })
    await ctx.reply(
      isRu
        ? 'Не удалось сохранить номер. Ничего страшного: при подключении его можно ввести вручную.'
        : 'Could not save the number. You can still type it when connecting.'
    )
  }
})

export default sharePhoneCommand
