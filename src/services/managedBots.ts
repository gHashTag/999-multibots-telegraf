import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'

/**
 * A NEW OWNER'S BOT, WITHOUT A TRIP TO BOTFATHER.
 *
 * Bot API 9.6 (3 Apr 2026): a link of the form t.me/newbot/<us>/<suggested>
 * asks Telegram to create a bot managed by us. The `managed_bot` update then
 * names it, and getManagedBotToken is the ONLY way to read its token --
 * BotFather does not own this bot, we do. So the token is read and kept the
 * moment the update lands; nobody can ask for it a second time.
 *
 * WHAT THIS DOES NOT DO. The farm still builds its map of cashiers from the
 * environment alone (bot-farm.ts), so the new bot does not start serving by
 * itself. Moving the key into Railway stays a deliberate act by a person.
 * That was the owner's call, 2026-09-15, and the reason is the trust model:
 * a farm that boots bots out of a database is a different thing from a farm
 * that boots what its operator put in its environment.
 *
 * THE TOKEN IS NEVER SHOWN. Not to the owner, not in a log, not in the reply
 * from the render. It goes from Telegram into one row and stops.
 */

/** Where the token is kept. The bot holds it only in a variable, in flight. */
async function keepBot(bot: {
  owner: string
  botId: number
  botUsername: string
  token: string
}): Promise<boolean> {
  const r = await fetch(
    'https://vibee-render-production.up.railway.app/api/bots/managed',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': process.env.RENDER_API_KEY || '',
      },
      body: JSON.stringify(bot),
    }
  )
  const d = (await r.json().catch(() => ({}))) as { ok?: boolean }
  return Boolean(d?.ok)
}

export function registerManagedBots(bot: Telegraf<MyContext>): void {
  /*
   * The link itself. Not a secret -- it creates a bot for whoever taps it,
   * managed by us -- so it is not gated: somebody asking for their own bot is
   * the whole point of the feature.
   */
  bot.command('newbot', async ctx => {
    const text = 'text' in ctx.message ? String(ctx.message.text) : ''
    const [, suggested, ...rest] = text.trim().split(/\s+/)
    const us = ctx.botInfo?.username ?? ''
    if (!suggested) {
      await ctx.reply(
        'Напишите так: /newbot имя_бота Название\n\n' +
          'Имя — латиница, цифры и _, обязано кончаться на bot. ' +
          'Название можно не писать.'
      )
      return
    }
    try {
      const { newBotLink } = await import('@/services/managedBotLink')
      const link = newBotLink(us, suggested, rest.join(' '))
      await ctx.reply(
        'Откройте ссылку — Telegram сам создаст бота, а ключ придёт мне, ' +
          'и вам его вводить не придётся:\n\n' +
          link
      )
    } catch (e) {
      await ctx.reply(e instanceof Error ? e.message : String(e))
    }
  })

  /*
   * Telegraf 4.16.3 has no type for this update, but Composer.on is a plain
   * `filter in update` check -- and src/index.ts must list `managed_bot` in
   * allowedUpdates or it never arrives.
   */
  const onManagedBot = async (ctx: MyContext) => {
    const m = (ctx.update as Record<string, any>)?.managed_bot
    const madeBy = String(m?.user?.id ?? '')
    const made = m?.bot
    const botId = Number(made?.id)
    const username = String(made?.username ?? '')
    if (!madeBy || !Number.isFinite(botId) || !username) return
    try {
      const token = (await (bot.telegram as any).callApi('getManagedBotToken', {
        user_id: botId,
      })) as string
      const kept = token
        ? await keepBot({
            owner: madeBy,
            botId,
            botUsername: username,
            token: String(token),
          })
        : false
      // Logged by NAME only. The token has no business in a log line.
      logger.info('[managed-bot] created', { madeBy, botId, username, kept })
      await ctx.telegram
        .sendMessage(
          madeBy,
          kept
            ? `Бот @${username} создан и привязан к вам. Ключ сохранён — ` +
                'показывать его не нужно и не буду. Осталось поднять бота ' +
                'в окружении, скажите — сделаю.'
            : `Бот @${username} создан, но ключ сохранить не удалось. ` +
                'Скажите — повторю, пока он не потерялся.'
        )
        .catch(() => undefined)
    } catch (error) {
      logger.error('[managed-bot] token not taken', {
        madeBy,
        botId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  bot.on('managed_bot' as never, onManagedBot as never)
}
