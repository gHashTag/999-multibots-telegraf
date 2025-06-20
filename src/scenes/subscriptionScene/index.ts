import { Markup, Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { handleMenu } from '@/handlers'
import { getTranslation, getUserDetailsSubscription } from '@/core/supabase'
import { isRussian } from '@/helpers'
import { ModeEnum } from '@/interfaces/modes'
import { paymentOptionsPlans } from '@/price/priceCalculator'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { TranslationButton } from '@/interfaces/supabase.interface'
import { logger } from '@/utils/logger'
import { PaymentType } from '@/interfaces/payments.interface'
import { shouldShowRubles } from '@/core/bot/shouldShowRubles'
import { escapeMarkdownV2 } from '@/helpers/escapeMarkdown'

// Проверка валидности типа подписки
export function isValidPaymentSubscription(value: string): boolean {
  if (!value) return false

  // Преобразуем искомое значение в верхний регистр ОДИН РАЗ
  const upperValueToFind = value.toUpperCase()

  // Проверяем, существует ли такой тип подписки в наших планах
  for (const plan of paymentOptionsPlans) {
    // Сравниваем строковые представления в верхнем регистре
    if (plan.subscription?.toString().toUpperCase() === upperValueToFind) {
      return true
    }
  }

  // Если цикл завершился, и мы не нашли совпадения
  logger.warn(
    'Unknown subscription type encountered in isValidPaymentSubscription',
    { value }
  )
  return false
}

export const subscriptionScene = new Scenes.WizardScene<MyContext>(
  ModeEnum.SubscriptionScene,
  async ctx => {
    // !!! САМОЕ ПЕРВОЕ ЛОГИРОВАНИЕ !!!
    logger.info(`[${ModeEnum.SubscriptionScene}] STEP 1 ENTERED`, {
      telegram_id: ctx.from?.id,
    })
    // !!! КОНЕЦ САМОГО ПЕРВОГО ЛОГИРОВАНИЯ !!!

    const userDetails = await getUserDetailsSubscription(
      ctx.from?.id.toString()
    )
    logger.info({
      message: `[SubscriptionScene] User: ${ctx.from?.id}, Mode: ${ModeEnum.CheckBalanceScene}`,
      userDetails,
    })
    const isRu = isRussian(ctx)
    const { translation, buttons } = await getTranslation({
      key: 'subscriptionScene',
      ctx,
      bot_name: ctx.botInfo?.username,
    })
    console.log('buttons fetched from DB or static!!!', buttons)

    // Получаем ID админов
    const adminIds = process.env.ADMIN_IDS
      ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim(), 10))
      : []
    const telegramId = ctx.from?.id
    const isAdmin = telegramId ? adminIds.includes(telegramId) : false

    // Фильтруем планы на основе статуса администратора
    const availablePlans = paymentOptionsPlans.filter(
      plan => !plan.isAdminOnly || (plan.isAdminOnly && isAdmin)
    )

    if (!telegramId) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не удалось получить ID пользователя'
          : '❌ Error: User ID not found'
      )
      return ctx.scene.leave()
    }

    if (!availablePlans || availablePlans.length === 0) {
      // Проверяем отфильтрованные планы
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не удалось получить доступные планы подписки.'
          : '❌ Error: Could not retrieve available subscription plans.'
      )
      return ctx.scene.leave()
    }

    // Формируем клавиатуру из ОТФИЛЬТРОВАННЫХ планов
    const keyboardRows: any[] = []
    availablePlans.forEach((plan, index) => {
      // Используем availablePlans
      // !!! ЛОГИРОВАНИЕ !!!
      logger.info(
        `[${ModeEnum.SubscriptionScene}] Processing plan for button:`,
        {
          plan_subscription: plan.subscription,
          isAdminOnly: plan.isAdminOnly,
          index,
        }
      )
      // !!! КОНЕЦ ЛОГИРОВАНИЯ !!!

      const row = index // Просто размещаем каждую кнопку на новой строке для простоты
      if (!keyboardRows[row]) {
        keyboardRows[row] = []
      }

      const showRubles = shouldShowRubles(ctx)
      let buttonText = ''

      // Получаем текст кнопки из перевода, если он есть, иначе используем тип подписки
      const planKey = plan.subscription?.toString().toLowerCase()
      const translatedButton = buttons?.find(b => b.callback_data === planKey)
      console.log(
        `[SUBSCRIPTION DEBUG] Plan: ${plan.subscription}, Key: ${planKey}, Found button:`,
        translatedButton?.text || 'NOT FOUND'
      )

      buttonText =
        translatedButton?.text ||
        plan.subscription?.toString() ||
        'Unknown Plan'

      // Используем showRubles вместо только проверки языка
      if (isRu && showRubles) {
        // Для русского языка показываем рубли только если shouldShowRubles разрешает
        if (translatedButton?.ru_price) {
          buttonText += ` - ${translatedButton.ru_price} ₽`
        } else if (plan.amount !== undefined) {
          buttonText += ` - ${plan.amount} ₽`
        }
      } else if (isRu && !showRubles) {
        // Для русского языка, когда рубли отключены, показываем звезды
        if (plan.stars !== undefined) {
          buttonText += ` - ${plan.stars} ⭐`
        }
      } else {
        // Для английского языка показываем доллары/звезды
        if (translatedButton?.en_price) {
          buttonText += ` - $${translatedButton.en_price}`
        } else if (plan.stars !== undefined) {
          buttonText += ` - ${plan.stars} ⭐`
        }
      }

      keyboardRows[row].push(
        Markup.button.callback(
          buttonText,
          plan.subscription?.toString().toLowerCase() || 'error_plan'
        ) // Используем тип подписки как callback_data
      )
    })

    // Очистка от пустых строк
    const cleanedKeyboardRows = keyboardRows.filter(
      row => row && row.length > 0
    )

    // Добавляем админскую тестовую кнопку только для админов
    if (isAdmin) {
      const adminTestButtonText = isRu
        ? '🧪 1 ₽ (Админ-тест)'
        : '🧪 1 ₽ (Admin-test)'

      cleanedKeyboardRows.push([
        Markup.button.callback(adminTestButtonText, 'admin_test_1rub'),
      ])

      logger.info(
        `[${ModeEnum.SubscriptionScene}] Added admin test button for user: ${telegramId}`
      )
    }

    if (cleanedKeyboardRows.length === 0) {
      logger.warn(
        `[${ModeEnum.SubscriptionScene}] No valid buttons generated.`,
        { telegram_id: ctx.from?.id }
      )
    } else {
      const inlineKeyboard = Markup.inlineKeyboard(cleanedKeyboardRows)

      // Сначала экранируем весь текст для MarkdownV2
      let textForTelegram = escapeMarkdownV2(translation)
      // Затем заменяем экранированные двойные звездочки на одинарные для MarkdownV2 bold
      // Это превратит \*\*текст\*\* в *текст*
      textForTelegram = textForTelegram.replace(
        /\\\*\\\*(.*?)\\\*\\\*/g,
        '*$1*'
      )

      await ctx.reply(textForTelegram, {
        reply_markup: inlineKeyboard.reply_markup,
        parse_mode: 'MarkdownV2',
      })
    }

    return ctx.wizard.next()
  },
  async (ctx: MyContext) => {
    console.log('CASE: subscriptionScene.next', ctx)
    if ('callback_query' in ctx.update && 'data' in ctx.update.callback_query) {
      const text = ctx.update.callback_query.data
      console.log('Callback data text:', text)

      // Находим выбранный тариф в ЕДИНОМ ИСТОЧНИКЕ, учитывая регистр callback_data
      const selectedPayment = paymentOptionsPlans.find(
        option =>
          option.subscription?.toString().toLowerCase() === text.toLowerCase()
      )

      if (selectedPayment && selectedPayment.subscription) {
        // УДАЛЯЕМ ЛИШНЮЮ ПРОВЕРКУ isValidPaymentSubscription, так как find уже гарантирует валидность по списку
        // if (isValidPaymentSubscription(subscription)) {
        const subscription = selectedPayment.subscription
        console.log('Valid subscription selected:', subscription)
        ctx.session.subscription = subscription
        ctx.session.selectedPayment = {
          amount: selectedPayment.amount,
          stars: Number(selectedPayment.stars), // Убедимся, что звезды - это число
          subscription: subscription as SubscriptionType,
          type: PaymentType.MONEY_INCOME,
        }
        // Добавляем флаг isAdminTest в сессию, если выбран тестовый план
        ctx.session.isAdminTest = false
        return ctx.scene.enter(ModeEnum.PaymentScene)
      } else if (text === 'admin_test_1rub') {
        // Обработка админской тестовой кнопки
        console.log('CASE: Admin test 1 rub button pressed')

        // Проверяем, что пользователь действительно админ
        const adminIds = process.env.ADMIN_IDS
          ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim(), 10))
          : []
        const telegramId = ctx.from?.id
        const isAdmin = telegramId ? adminIds.includes(telegramId) : false

        if (!isAdmin) {
          const isRu = isRussian(ctx)
          await ctx.reply(
            isRu
              ? '❌ У вас нет доступа к этой функции.'
              : '❌ You do not have access to this function.'
          )
          return
        }

        // Настраиваем сессию для админского теста ПОДПИСКИ
        ctx.session.subscription = SubscriptionType.NEUROPHOTO // Тестируем подписку НейроФото
        ctx.session.selectedPayment = {
          amount: 1, // 1 рубль для теста
          stars: 1, // 1 звезда для теста
          subscription: SubscriptionType.NEUROPHOTO as SubscriptionType, // ✅ ЭТО тест подписки
          type: PaymentType.MONEY_INCOME, // Тип операции остается тот же
        }
        ctx.session.isAdminTest = true

        logger.info(
          `[${ModeEnum.SubscriptionScene}] Admin test payment initiated by user: ${telegramId}`,
          {
            selectedPayment: ctx.session.selectedPayment,
          }
        )

        return ctx.scene.enter(ModeEnum.PaymentScene)
        /* } else {
          // ЭТОТ БЛОК БОЛЬШЕ НЕ НУЖЕН, так как find гарантирует валидность
          console.warn(
            '[Callback Handler] Subscription type not supported for payment (should not happen):',
            subscription
          )
          const isRu = isRussian(ctx)
          await ctx.reply(
            isRu
              ? 'Этот тип подписки не поддерживает оплату. Пожалуйста, выберите другой вариант.'
              : 'This subscription type does not support payment. Please select another option.'
          )
        } */
      } else if (text === 'mainmenu') {
        console.log('CASE: 🏠 Главное меню')
        return ctx.scene.enter(ModeEnum.MainMenu)
      } else {
        // Этот блок теперь действительно означает неизвестный callback_data
        console.warn('[Callback Handler] Unknown callback_data received:', text)
        const isRu = isRussian(ctx)
        await ctx.reply(
          isRu
            ? 'Неизвестный тип подписки. Пожалуйста, выберите другой вариант.'
            : 'Unknown subscription type. Please select another option.'
        )
      }
    } else {
      handleMenu(ctx)
      return ctx.scene.leave()
    }
  }
)
