import { Markup, Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { getStepSelectionMenu } from '@/menu'
import { handleHelpCancel } from '@/handlers'
import { handleTrainingCost } from '@/price/helpers'
import { isRussian } from '@/helpers/language'
import { stepOptions } from '@/price/constants/modelsCost'

export const digitalAvatarBodyWizardV2 = new Scenes.WizardScene<MyContext>(
  'digital_avatar_body_v2',
  async ctx => {
    const isRu = isRussian(ctx)
    await ctx.reply('Выберите количество шагов:', getStepSelectionMenu(isRu))
    return ctx.wizard.next()
  },
  async ctx => {
    console.log('Entering step 2 of the wizard')
    const isRu = isRussian(ctx)

    if (ctx.message && 'text' in ctx.message) {
      const isCancel = await handleHelpCancel(ctx)
      if (isCancel) {
        return ctx.scene.leave()
      } else {
        const steps = parseInt(ctx.message.text, 10)
        if (isNaN(steps) || !stepOptions?.v2?.includes(steps)) {
          await ctx.reply(
            'Пожалуйста, выберите количество шагов из предложенных кнопок.'
          )
          return
        }
        console.log('Parsed steps:', steps)
        const { leaveScene, trainingCostInStars, currentBalance } =
          await handleTrainingCost(ctx, steps, isRu, 'v2')
        if (leaveScene) {
          return ctx.scene.leave()
        }
        if (trainingCostInStars > 0) {
          ctx.session.paymentAmount = trainingCostInStars
          ctx.session.steps = steps
          console.log('Training cost and steps saved to session:', {
            paymentAmount: ctx.session.paymentAmount,
            steps: ctx.session.steps,
          })
          const message = isRu
            ? `✅ Вы выбрали ${steps} шагов стоимостью ${trainingCostInStars}⭐️ звезд\n\nВаш баланс: ${currentBalance} ⭐️`
            : `✅ You selected ${steps} steps costing ${trainingCostInStars}⭐️ stars\n\nYour balance: ${currentBalance} ⭐️`
          await ctx.reply(message, Markup.removeKeyboard())
          return ctx.scene.leave()
        } else {
          await ctx.reply(
            isRu
              ? 'Не удалось рассчитать стоимость. Попробуйте еще раз.'
              : 'Failed to calculate cost. Please try again.'
          )
          return ctx.wizard.selectStep(ctx.wizard.cursor - 1)
        }
      }
    } else {
      const isCancel = await handleHelpCancel(ctx)
      if (isCancel) {
        return ctx.scene.leave()
      }
      await ctx.reply(
        isRu
          ? 'Пожалуйста, выберите количество шагов, нажав одну из кнопок.'
          : 'Please select the number of steps by clicking one of the buttons.'
      )
      return
    }
  }
)
