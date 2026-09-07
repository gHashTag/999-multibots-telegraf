import { Composer, Markup } from 'telegraf'
import type { MyContext } from '../interfaces'
import { isRussianFromState } from '../helpers/centralizedLanguage'
import { logger } from '../utils/logger'
import { MINI_APP_URL } from '../navigation/config/miniApp.config'

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
 * WHY `contact.user_id` IS CHECKED
 *
 * The button hands over the sender's OWN number, but a person can also forward
 * SOMEBODY ELSE'S contact from their address book as an ordinary attachment.
 * Then `contact.user_id` is either empty or not the sender. Storing such a
 * number would let anyone put a stranger's phone on a stranger's account --
 * and then have the connect code sent to it.
 */
export const sharePhoneCommand = new Composer<MyContext>()

const БАЗА = 'https://vibee-render-production.up.railway.app'

/**
 * THE WAY ONWARDS, NOT JUST A CONFIRMATION.
 *
 * Saving the number used to end with "saved" and nothing else, which left the
 * person holding a fact instead of a next step: they had to find the mini app,
 * find the profile, and find the right tab on their own. The owner asked for
 * this to be "as automatic as possible", and this is the part of it that CAN
 * be automatic.
 *
 * The link carries `?tab=agent` because ProfileTabs already reads `tab` from
 * the address -- the connect screen lives on that tab, and landing anywhere
 * else means hunting for it.
 *
 * WHAT IS DELIBERATELY NOT AUTOMATED. The button opens the screen; it does not
 * request the login code. Telegram has no "approve this sign-in" API for
 * MTProto -- the code must be typed into the client that asked for it -- and
 * pressing "get code" on somebody's behalf starts access to their entire
 * correspondence. The screen states the same rule in its own comment. Two taps
 * and five digits is the floor Telegram allows, not a shortcut we declined to
 * take.
 */
function connectButton(isRu: boolean) {
  return Markup.inlineKeyboard([
    [
      Markup.button.webApp(
        isRu ? '🔗 Подключить Telegram' : '🔗 Connect Telegram',
        `${MINI_APP_URL}/profile?tab=agent`
      ),
    ],
  ])
}

/** Кнопка-просьба. Показывается там, где номер вот-вот понадобится. */
export function phoneKeyboard(isRu: boolean) {
  return Markup.keyboard([
    [
      Markup.button.contactRequest(
        isRu ? '📱 Поделиться номером' : '📱 Share my number'
      ),
    ],
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
    phoneKeyboard(isRu)
  )
  /*
   * The way onwards is offered here too. Somebody whose number is already
   * saved presses /phone, is asked to share it again, and has nowhere to go
   * from there -- the one thing they actually need is the screen.
   */
  await ctx.reply(
    isRu
      ? 'Если номер уже сохранён — сразу сюда:'
      : 'If the number is already saved, go straight here:',
    connectButton(isRu)
  )
})

/**
 * A contact arrived. Check it is the sender's OWN, then pass it to the server.
 *
 * The person is always answered, refusals included: silence after pressing a
 * button is indistinguishable from a breakage.
 */
sharePhoneCommand.on('contact', async ctx => {
  const isRu = isRussianFromState(ctx)
  const contact = ctx.message.contact
  const isOwn =
    contact?.user_id && String(contact.user_id) === String(ctx.from?.id)

  if (!isOwn) {
    await ctx.reply(
      isRu
        ? 'Это чужой contact. Нужен ваш номер — нажмите кнопку «Поделиться номером».'
        : 'That is somebody else’s contact. Please use the “Share my number” button.',
      phoneKeyboard(isRu)
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
        phone: contact.phone_number,
        источник: 'кнопка в боте',
      }),
    })
    if (!о.ok) throw new Error(`сервер ответил ${о.status}`)
    /*
     * Two messages, not one, because they carry different keyboards: the
     * contact request is a REPLY keyboard and must be removed, while the way
     * onwards is an INLINE web_app button. Telegram does not let one message
     * do both.
     */
    await ctx.reply(
      isRu
        ? '✅ Номер сохранён — набирать его больше не придётся.'
        : '✅ Saved — you will not have to type it again.',
      Markup.removeKeyboard()
    )
    await ctx.reply(
      isRu
        ? 'Осталось одно: откройте экран и введите код, который пришлёт Telegram.\n\n' +
            'Код набираете вы — за вас его ввести нельзя, так устроен вход в Telegram.'
        : 'One step left: open the screen and enter the code Telegram sends you.',
      connectButton(isRu)
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
