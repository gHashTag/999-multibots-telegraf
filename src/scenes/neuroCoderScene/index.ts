import { Scenes, Telegraf, Markup } from 'telegraf'
import type { MyContext } from '@/interfaces'
import { generateNeuroImage } from '../../services/generateNeuroImage'
import { isRussian } from '@/helpers'
import { promptNeuroCoder } from './promts'

export const neuroCoderScene = new Scenes.WizardScene<MyContext>(
  'neuroCoderScene',
  async ctx => {
    const isRu = isRussian(ctx)
    await ctx.reply(
      'Выберите количество изображений для генерации:',
      Markup.keyboard([
        ['1️', '2'],
        ['30', '50'],
        [isRu ? 'Отмена' : 'Cancel'],
      ]).resize()
    )

    return ctx.wizard.next()
  },
  async ctx => {
    const message = ctx.message
    if (!message || !ctx.from?.id) {
      await ctx.reply('Ошибка при выборе количества изображений.')
      return ctx.scene.leave()
    }
    const model_url =
      'ghashtag/neuro_coder_flux-dev-lora:5ff9ea5918427540563f09940bf95d6efc16b8ce9600e82bb17c2b188384e355'

    const prompt = promptNeuroCoder

    ctx.session.prompt = prompt
    if (ctx.message && 'text' in ctx.message) {
      console.log('ctx.message.text', ctx.message.text)
      const numImages = parseInt(ctx.message.text)

      console.log(numImages)

      if (!ctx?.chat?.id) {
        await ctx.reply('Ошибка при генерации ')
        return
      }

      await generateNeuroImage(
        prompt,
        model_url,
        numImages,
        ctx.from.id.toString(),
        ctx,
        ctx.botInfo?.username
      )

      return ctx.scene.leave()
    } else {
      await ctx.reply('Пожалуйста, выберите количество изображений.')
      return ctx.scene.reenter()
    }
  }
)
