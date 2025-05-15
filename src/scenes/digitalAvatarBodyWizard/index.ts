import { Markup, Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { getStepSelectionMenu } from '../../menu/getStepSelectionMenu'
import { isRussian } from '@/helpers/language'
import { handleTrainingCost } from '@/price/helpers'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { generateCostMessage, stepOptions } from '@/price/priceCalculator'

export const digitalAvatarBodyWizard = new Scenes.WizardScene<MyContext>(
  'digital_avatar_body',
  async ctx => {
    const isRu = isRussian(ctx)
    const costMessage = generateCostMessage(stepOptions.v1, isRu, 'v1')
    await ctx.reply(costMessage, getStepSelectionMenu(isRu))
    return ctx.wizard.next()
  },
  async ctx => {
    const isRu = isRussian(ctx)
    console.log('Entering step 2 of the wizard')
    if (ctx.message && 'text' in ctx.message) {
      const messageText = ctx.message.text
      const stepsMatch = messageText.match(/\d+/)
      console.log('stepsMatch', stepsMatch)

      if (stepsMatch) {
        const steps = parseInt(stepsMatch[0])
        ctx.session.steps = steps
        console.log('Parsed steps:', steps)
        const { leaveScene, trainingCostInStars, currentBalance } =
          await handleTrainingCost(ctx, steps, isRu)

        if (leaveScene) {
          return ctx.scene.leave()
        } else {
          // Save the calculated cost to the session
          ctx.session.calculatedCost = trainingCostInStars

          const message = isRu
            ? `✅ Вы выбрали ${steps} шагов стоимостью ${trainingCostInStars}⭐️ звезд\n\nВаш баланс: ${currentBalance} ⭐️`
            : `✅ You selected ${steps} steps costing ${trainingCostInStars}⭐️ stars\n\nYour balance: ${currentBalance} ⭐️`

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
          ? '🔢 Пожалуйста, выберите количество шагов для продолжения обучения модели.'
          : '🔢 Please select the number of steps to proceed with model training.'
      )
    }
  }
)
