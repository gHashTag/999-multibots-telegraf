import { MyContext } from '../../interfaces'

import { generateNeuroImage } from '../../services/generateNeuroImage'
import { models } from '../../core/replicate'
import { liquidPunkPrompt } from './prompts'

async function get100Command(ctx: MyContext) {
  const model_url = models['dpbelarusx'].key as `${string}/${string}:${string}`
  console.log('model_url', model_url)
  const message = liquidPunkPrompt
  ctx.session.prompt = message
  if (!message || !ctx.from?.id) {
    await ctx.reply(
      'Ошибка при генерации изображения !message || !ctx.from?.id'
    )
    throw new Error('Message or user id not found')
  }

  if (!ctx?.chat?.id) {
    await ctx.reply('Ошибка при генерации ')
    return
  }

  await generateNeuroImage(
    message,
    model_url,
    50,
    ctx.from.id.toString(),
    ctx,
    ctx.botInfo?.username
  )

  return
}

export { get100Command }
