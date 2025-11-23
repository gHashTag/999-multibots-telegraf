import { Markup, Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { getStepSelectionMenu } from '../../menu/getStepSelectionMenu'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { handleTrainingCost } from '@/price/helpers'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { generateCostMessage, stepOptions } from '@/price/priceCalculator'
import { calculateCost } from '@/price/priceCalculator'
import { shouldShowRubles } from '@/core/bot/shouldShowRubles'
import { ModeEnum } from '@/interfaces/modes'

// ✅ CENTRALIZED CANCEL SYSTEM
import { createCancelOnlyKeyboard } from '@/utils/cancelKeyboard'

export const digitalAvatarBodyWizard = new Scenes.WizardScene<MyContext>(
  'digital_avatar_body',
  async ctx => {
    // Устанавливаем режим для правильного выбора API endpoint
    ctx.session.mode = ModeEnum.DigitalAvatarBody
    console.log('[digitalAvatarBodyWizard] Set session mode:', ctx.session.mode)

    const isRu = isRussianFromState(ctx)
    const showRubles = shouldShowRubles(ctx)
    const costMessage = generateCostMessage(
      stepOptions.v1,
      isRu,
      'v1',
      showRubles,
      isRu
    )
    await ctx.reply(costMessage, getStepSelectionMenu(isRu))
    return ctx.wizard.next()
  },
  async ctx => {
    const isRu = isRussianFromState(ctx)
    console.log('Entering step 2 of the wizard')

    // ✅ FIX: Добавляем обработку загрузки фото
    if (ctx.message && 'photo' in ctx.message) {
      console.log('[digitalAvatarBodyWizard] Photo received:', ctx.message.photo.length)

      // Сохраняем фото в сессии
      const photo = ctx.message.photo[ctx.message.photo.length - 1] // Берем фото в наивысшем качестве
      ctx.session.avatarPhoto = {
        file_id: photo.file_id,
        unique_id: photo.file_unique_id,
      }

      await ctx.reply(
        isRu
          ? '✅ Фото получено! Теперь выберите количество шагов для обучения модели:'
          : '✅ Photo received! Now select the number of steps for model training:',
        Markup.removeKeyboard()
      )
      return
    }

    if (ctx.message && 'text' in ctx.message) {
      const messageText = ctx.message.text
      const stepsMatch = messageText.match(/\d+/)
      console.log('stepsMatch', stepsMatch)

      if (stepsMatch) {
        const steps = parseInt(stepsMatch[0])
        ctx.session.steps = steps
        console.log('Parsed steps:', steps)

        // ✅ FIX: Проверяем наличие фото перед обработкой
        if (!ctx.session.avatarPhoto) {
          await ctx.reply(
            isRu
              ? '📸 Сначала загрузите фото для создания цифрового аватара.'
              : '📸 Please upload a photo to create a digital avatar first.',
            Markup.removeKeyboard()
          )
          return
        }

        const { leaveScene, trainingCostInStars, currentBalance } =
          await handleTrainingCost(ctx, steps, isRu)

        if (leaveScene) {
          return ctx.scene.leave()
        } else {
          const message = isRu
            ? `✅ Вы выбрали ${steps} шагов стоимостью ${trainingCostInStars}⭐️ звезд\n\nВаш баланс: ${currentBalance} ⭐️\n\n📸 Фото загружено и готово к обработке.`
            : `✅ You selected ${steps} steps costing ${trainingCostInStars}⭐️ stars\n\nYour balance: ${currentBalance} ⭐️\n\n📸 Photo uploaded and ready for processing.`

          await ctx.reply(message, Markup.removeKeyboard())
          return ctx.scene.enter('trainFluxModelWizard')
        }
      }
    } else {
      console.error('Callback query does not contain data')
    }

    const isCancel = await handleHelpCancel(ctx)

    if (isCancel) {
      return ctx.scene.leave()
    } else {
      await ctx.reply(
        isRu
          ? '🔢 Пожалуйста, выберите количество шагов для продолжения обучения модели.\n\n📸 Или загрузите фото для создания цифрового аватара.'
          : '🔢 Please select the number of steps to proceed with model training.\n\n📸 Or upload a photo to create a digital avatar.',
        Markup.removeKeyboard()
      )
    }
  }
)
