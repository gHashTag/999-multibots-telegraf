import { Markup, Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { isRussian } from '@/core/i18n/language'
import { handleSizeSelection } from '../../handlers'

export const sizeWizard = new Scenes.WizardScene<MyContext>(
  'sizeWizard',
  async ctx => {
    const isRu = isRussian(ctx)
    const keyboard = Markup.keyboard([
      ['21:9', '16:9', '3:2'],
      ['4:3', '5:4', '1:1'],
      ['4:5', '3:4', '2:3'],
      ['9:16', '9:21'],
    ]).resize()

    // Отправляем сообщение с клавиатурой
    await ctx.reply(
      isRu ? 'Выберите размер изображения:' : 'Choose image size:',
      {
        reply_markup: keyboard.reply_markup,
      }
    )

    return ctx.wizard.next()
  },
  async ctx => {
    if (!ctx.message || !('text' in ctx.message)) {
      return ctx.scene.leave()
    }

    const size = ctx.message.text
    const validSizes = [
      '21:9',
      '16:9',
      '3:2',
      '4:3',
      '5:4',
      '1:1',
      '4:5',
      '3:4',
      '2:3',
      '9:16',
      '9:21',
    ]

    if (!validSizes.includes(size)) {
      const isRu = isRussian(ctx)
      await ctx.reply(
        isRu
          ? `Неверный размер. Пожалуйста, выберите один из предложенных размеров. ${validSizes.join(
              ', '
            )}`
          : `Invalid size. Please choose one of the suggested sizes. ${validSizes.join(
              ', '
            )}`
      )
      return
    }

    await handleSizeSelection(ctx, size)
    return ctx.scene.leave()
  }
)
