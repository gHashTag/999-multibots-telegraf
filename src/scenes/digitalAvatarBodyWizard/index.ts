import { Markup, Scenes } from 'telegraf'
import { MyContext, ModeEnum } from '../../interfaces'
import { getStepSelectionMenu } from '../../menu/getStepSelectionMenu'
import { isRussian } from '@/helpers/language'
import { handleTrainingCost } from '@/price/helpers'
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
      console.log(
        '[digitalAvatarBodyWizard] Received text message:',
        messageText
      )

      // --- ВОЗВРАЩАЕМ ОБРАБОТКУ КНОПКИ ГЛАВНОГО МЕНЮ ---
      if (messageText.startsWith(isRu ? '🏠 Главное меню' : '🏠 Main menu')) {
        console.log(
          'Leaving digitalAvatarBodyWizard to main menu via text command (using startsWith)'
        )
        // Корректный переход в сцену главного меню
        return ctx.scene.enter(ModeEnum.MainMenu)
      }
      // --- КОНЕЦ ВОЗВРАТА ГЛАВНОГО МЕНЮ ---

      // --- ВОЗВРАЩАЕМ ОБРАБОТКУ КНОПКИ СПРАВКИ ---
      if (
        messageText.startsWith(
          isRu ? '❓ Справка' : '❓ Help' // Используем стандартизированный текст
        )
      ) {
        console.log(
          'Handling help inline from digitalAvatarBodyWizard via text command'
        )
        // Сохраняем текущий режим, чтобы справка знала, куда возвращаться
        ctx.session.mode = ModeEnum.DigitalAvatarBody // Устанавливаем режим текущей сцены
        // Корректный переход в сцену справки
        return ctx.scene.enter(ModeEnum.Help)
      }
      // --- КОНЕЦ ВОЗВРАТА СПРАВКИ ---

      // --- Остальная логика обработки выбора шагов ---
      const stepsMatch = messageText.match(/\d+/)
      console.log('stepsMatch', stepsMatch)

      if (stepsMatch) {
        const steps = parseInt(stepsMatch[0])
        ctx.session.steps = steps
        console.log('Parsed steps:', steps)
        const { leaveScene, trainingCostInStars, currentBalance } =
          await handleTrainingCost(ctx, steps, isRu)

        if (leaveScene) {
          return ctx.scene.leave() // handleTrainingCost может сам выйти из сцены
        } else {
          const message = isRu
            ? `✅ Вы выбрали ${steps} шагов стоимостью ${trainingCostInStars}⭐️ звезд\n\nВаш баланс: ${currentBalance} ⭐️`
            : `✅ You selected ${steps} steps costing ${trainingCostInStars}⭐️ stars\n\nYour balance: ${currentBalance} ⭐️`

          await ctx.reply(message, Markup.removeKeyboard()) // Убираем клавиатуру шагов
          return ctx.scene.enter('trainFluxModelWizard')
        }
      } else {
        // Если текст не шаги и не команда - сообщаем об ошибке
        await ctx.reply(
          isRu
            ? '🔢 Пожалуйста, выберите количество шагов с помощью кнопок.'
            : '🔢 Please select the number of steps using the buttons.'
        )
        return // Остаемся в той же сцене
      }
    } else {
      // Если пришло не текстовое сообщение
      console.error('Received non-text update in step 2')
      await ctx.reply(isRu ? 'Неверный ввод.' : 'Invalid input.')
      return
    }
  }
)
