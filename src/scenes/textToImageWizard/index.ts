import { Scenes, Markup } from 'telegraf'
import { MyContext } from '../../interfaces'
import { imageModelPrices } from '@/price/models'
import { handleHelpCancel } from '@/handlers'
import { sendGenericErrorMessage } from '@/menu'
import { generateTextToImageDirect } from '@/services/generateTextToImageDirect'
import { getUserBalance } from '@/core/supabase'
import { isRussian } from '@/helpers/language'
import {
  sendBalanceMessage,
  validateAndCalculateImageModelPrice,
} from '@/price/helpers'
import { logger } from '@/utils/logger'

import { createHelpCancelKeyboard } from '@/menu'
import { getUserProfileAndSettings } from '@/db/userSettings'
import { handleMenu } from '@/handlers/handleMenu'
import { improvePromptWizard } from '../improvePromptWizard'
import { sizeWizard } from '../sizeWizard'
import { createTextToImage } from '@/modules/textToImage'
// import { generateTextToImage } from '../../modules/textToImage'
// Временно комментируем ModeEnum, так как путь неверный
// import { ModeEnum } from '../../interfaces/modes'

/**
 * Сцена Text to Image Wizard
 * Позволяет пользователю создать изображение из текста через пошаговый процесс.
 */

// Определяем шаги сцены
const steps = {
  ENTER_PROMPT: 'enter_prompt',
  PROCESSING: 'processing',
}

// Создаем сцену для генерации изображения из текста
export const textToImageWizard = new Scenes.WizardScene<MyContext>(
  'textToImageWizard',
  async ctx => {
    await ctx.reply(
      'Пожалуйста, введите текстовое описание для генерации изображения:',
      {
        reply_markup: {
          keyboard: [[{ text: 'Отмена' }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      }
    )
    ctx.wizard.state.step = steps.ENTER_PROMPT
    return ctx.wizard.next()
  },
  async ctx => {
    if (ctx.message?.text === 'Отмена') {
      await ctx.reply('Генерация изображения отменена.', {
        reply_markup: { remove_keyboard: true },
      })
      // Временно возвращаем к leave, так как ModeEnum недоступен
      // return ctx.scene.enter(ModeEnum.MainMenu)
      return ctx.scene.leave()
    }

    if (ctx.wizard.state.step === steps.ENTER_PROMPT) {
      if (!ctx.message?.text) {
        await ctx.reply(
          'Пожалуйста, введите текстовое описание для изображения.'
        )
        return
      }

      ctx.wizard.state.prompt = ctx.message.text
      await ctx.reply('Обработка вашего запроса на генерацию изображения...', {
        reply_markup: { remove_keyboard: true },
      })
      ctx.wizard.state.step = steps.PROCESSING

      try {
        // Используем createTextToImage вместо generateTextToImage
        await createTextToImage(ctx, { text: ctx.wizard.state.prompt }, {})
        await ctx.reply('Генерация завершена!', {
          reply_markup: { remove_keyboard: true },
        })
        // Временно возвращаем к leave, так как ModeEnum недоступен
        // return ctx.scene.enter(ModeEnum.MainMenu)
        return ctx.scene.leave()
      } catch (error) {
        await ctx.reply(
          `Ошибка при генерации изображения: ${error.message || 'Неизвестная ошибка'}`,
          {
            reply_markup: { remove_keyboard: true },
          }
        )
        // Временно возвращаем к leave, так как ModeEnum недоступен
        // return ctx.scene.enter(ModeEnum.MainMenu)
        return ctx.scene.leave()
      }
    }
  }
)
