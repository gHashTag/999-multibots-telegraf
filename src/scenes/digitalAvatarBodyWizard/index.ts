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

export const digitalAvatarBodyWizard = new Scenes.WizardScene<MyContext>(
  'digital_avatar_body',
  // Шаг 0: Выбор пола
  async ctx => {
    // ✅ Инициализируем wizardData
    ctx.session.wizardData = {}

    // Устанавливаем режим для правильного выбора API endpoint
    ctx.session.mode = ModeEnum.DigitalAvatarBody
    console.log('[digitalAvatarBodyWizard] Set session mode:', ctx.session.mode)

    const isRu = isRussianFromState(ctx)

    const genderKeyboard = Markup.keyboard([
      [
        Markup.button.text(isRu ? '👨‍💼 Мужской' : '👨‍💼 Male'),
        Markup.button.text(isRu ? '👩‍💼 Женский' : '👩‍💼 Female'),
      ],
      [
        Markup.button.text(isRu ? '❓ Справка' : '❓ Help'),
        Markup.button.text(isRu ? 'Отмена' : 'Cancel'),
      ],
    ])
      .resize()
      .oneTime()

    await ctx.reply(
      isRu ? '👤 Выберите пол для модели:' : '👤 Select gender for the model:',
      genderKeyboard
    )
    return ctx.wizard.next()
  },
  // Шаг 1: Обработка выбора пола и запрос названия модели
  async ctx => {
    const isRu = isRussianFromState(ctx)

    // ✅ Инициализируем wizardData если его нет
    if (!ctx.session.wizardData) {
      ctx.session.wizardData = {}
    }

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    }

    if (ctx.message && 'text' in ctx.message) {
      const messageText = ctx.message.text

      // Обработка выбора пола
      let gender: 'male' | 'female' | null = null

      if (isRu) {
        if (messageText.includes('Мужской') || messageText.includes('👨')) {
          gender = 'male'
        } else if (
          messageText.includes('Женский') ||
          messageText.includes('👩')
        ) {
          gender = 'female'
        }
      } else {
        if (messageText.includes('Male') || messageText.includes('👨')) {
          gender = 'male'
        } else if (
          messageText.includes('Female') ||
          messageText.includes('👩')
        ) {
          gender = 'female'
        }
      }

      if (gender) {
        // Сохраняем пол в сессию
        ctx.session.gender = gender
        ctx.session.wizardData.gender = gender

        // Запрашиваем название модели
        await ctx.reply(
          isRu
            ? '📝 Введите название модели (например: my_avatar_model):'
            : '📝 Enter model name (e.g., my_avatar_model):',
          Markup.removeKeyboard()
        )
        return ctx.wizard.next()
      }
    }

    await ctx.reply(
      isRu
        ? '👤 Пожалуйста, выберите пол из кнопок выше.'
        : '👤 Please select gender from the buttons above.',
      Markup.removeKeyboard()
    )
  },
  // Шаг 2: Обработка названия модели и показ меню выбора шагов
  async ctx => {
    const isRu = isRussianFromState(ctx)

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    }

    if (ctx.message && 'text' in ctx.message) {
      const messageText = ctx.message.text.trim()

      if (messageText.length > 0) {
        // Сохраняем название модели
        ctx.session.modelName = messageText
        ctx.session.triggerWord = messageText.toUpperCase()
        ctx.session.wizardData.modelName = messageText

        // Показываем меню выбора шагов
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
      }
    }

    await ctx.reply(
      isRu
        ? '📝 Пожалуйста, введите название модели.'
        : '📝 Please enter model name.',
      Markup.removeKeyboard()
    )
  },
  // Шаг 3: Обработка выбора шагов
  async ctx => {
    const isRu = isRussianFromState(ctx)
    console.log('Entering step 3: steps selection')

    // ✅ Инициализируем wizardData если его нет
    if (!ctx.session.wizardData) {
      ctx.session.wizardData = {}
    }

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    }

    // ✅ ОБРАБОТКА ВЫБОРА ШАГОВ
    if (ctx.message && 'text' in ctx.message) {
      const messageText = ctx.message.text
      const stepsMatch = messageText.match(/\d+/)
      console.log('stepsMatch', stepsMatch)

      if (stepsMatch) {
        const steps = parseInt(stepsMatch[0])

        // ✅ Сохраняем шаги в wizardData
        ctx.session.steps = steps
        ctx.session.wizardData.steps = steps
        console.log('Parsed steps:', steps)

        // Сразу запускаем обучение (БЕЗ проверки фото!)
        const { leaveScene, trainingCostInStars, currentBalance } =
          await handleTrainingCost(ctx, steps, isRu)

        if (leaveScene) {
          return ctx.scene.leave()
        } else {
          const message = isRu
            ? `✅ Вы выбрали ${steps} шагов стоимостью ${trainingCostInStars}⭐️ звезд\n\nВаш баланс: ${currentBalance} ⭐️\n\n📸 Переход к загрузке изображений для обучения модели...`
            : `✅ You selected ${steps} steps costing ${trainingCostInStars}⭐️ stars\n\nYour balance: ${currentBalance} ⭐️\n\n📸 Proceeding to image upload for model training...`

          await ctx.reply(message, Markup.removeKeyboard())
          return ctx.scene.enter('trainFluxModelWizard')
        }
      }
    }

    await ctx.reply(
      isRu
        ? '🔢 Пожалуйста, выберите количество шагов для продолжения обучения модели.'
        : '🔢 Please select the number of steps to proceed with model training.',
      Markup.removeKeyboard()
    )
  }
)
