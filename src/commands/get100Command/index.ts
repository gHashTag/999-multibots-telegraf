import { MyContext } from '../../interfaces'

import { generateNeuroImage } from '../../services/generateNeuroImage'
import { models } from '../../core/replicate'
import { solarPunkAngelPrompt } from './prompts'

async function get100Command(ctx: MyContext) {
  const model_url = models['neuro_coder'].key as `${string}/${string}:${string}`

  const message = solarPunkAngelPrompt
  ctx.session.prompt = message
  if (!message || !ctx.from?.id) {
    await ctx.reply(
      'Ошибка при генерации изображения !message || !ctx.from?.id'
    )
    throw new Error('Message or user id not found')
  }

  const generatingMessage = await ctx.reply('Генерация изображения началась...')

  if (!ctx?.chat?.id) {
    await ctx.reply('Ошибка при генерации ')
    return
  }

  await generateNeuroImage(
    message,
    model_url,
    5,
    ctx.from.id.toString(),
    ctx,
    ctx.botInfo?.username
  )

  await ctx.telegram.deleteMessage(
    ctx.chat?.id || '',
    generatingMessage.message_id
  )
  return
}

export { get100Command }
