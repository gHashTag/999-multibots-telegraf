import { Markup, Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
// УДАЛЁН УДАЛЁН - используется setupHearsHandlers
import { getTranslation, getUserDetailsSubscription } from '@/core/supabase'
import { isRussian } from '@/helpers'
import { ModeEnum } from '@/interfaces/modes'
import { paymentOptionsPlans } from '@/price/priceCalculator'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { TranslationButton } from '@/interfaces/supabase.interface'
import { logger } from '@/utils/logger'
import { PaymentType } from '@/interfaces/payments.interface'
import { showRublesTo } from '@/helpers/railsForThisPerson'
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
    logger.info(
      `[SubscriptionScene] User: ${ctx.from?.id}, Mode: ${ModeEnum.CheckBalanceScene}`,
      {
        userDetails,
      }
    )
    const isRu = isRussian(ctx)
    const { translation, buttons } = await getTranslation({
      key: 'subscriptionScene',
      ctx,
      bot_name: ctx.botInfo?.username,
    })

    // ✅ ИСПРАВЛЕНИЕ: Добавляем подробное логирование результатов getTranslation
    logger.info(`[${ModeEnum.SubscriptionScene}] getTranslation results:`, {
      telegram_id: ctx.from?.id,
      bot_name: ctx.botInfo?.username,
      translation_found: !!translation && translation.trim() !== '',
      translation_length: translation?.length || 0,
      buttons_count: buttons?.length || 0,
      buttons_preview:
        buttons
          ?.slice(0, 2)
          .map(b => ({ text: b.text, callback_data: b.callback_data })) || [],
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

      /*
       * THE BOT DECIDES WHAT IS POSSIBLE; THE PERSON NARROWS IT.
       *
       * `shouldShowRubles` is a property of the bot -- some of them must not
       * offer roubles at all. What the person chose in the mini app's paywall
       * can only take options away, never add them: asking for roubles where
       * roubles are forbidden still shows Stars, and asking for Stars hides the
       * rouble buttons so nobody has to say it twice.
       */
      const showRubles = showRublesTo(
        shouldShowRubles(ctx),
        ctx.session?.payMethod
      )
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

    // ✅ ДОБАВЛЯЕМ КНОПКУ ОТМЕНЫ В INLINE KEYBOARD
    cleanedKeyboardRows.push([
      Markup.button.callback(
        isRu ? '❌ Отмена' : '❌ Cancel',
        'cancel_subscription'
      ),
    ])

    if (cleanedKeyboardRows.length === 0) {
      logger.warn(
        `[${ModeEnum.SubscriptionScene}] No valid buttons generated.`,
        { telegram_id: ctx.from?.id }
      )

      // ✅ ИСПРАВЛЕНИЕ: Отправляем сообщение пользователю, даже если нет кнопок
      const fallbackMessage = isRu
        ? `❌ К сожалению, в данный момент планы подписки недоступны. Попробуйте позже или обратитесь в поддержку.`
        : `❌ Unfortunately, subscription plans are currently unavailable. Please try again later or contact support.`

      await ctx.reply(fallbackMessage)

      // Возвращаемся в главное меню
      await ctx.scene.leave()
      const { showMainMenu } = await import('@/navigation')
      await showMainMenu(ctx)
      return
    } else {
      const inlineKeyboard = Markup.inlineKeyboard(cleanedKeyboardRows)

      // ✅ ИСПРАВЛЕНИЕ: Добавляем fallback текст, если перевод не найден
      let messageText = translation

      // Если перевод пустой или отсутствует, используем fallback
      if (!messageText || messageText.trim() === '') {
        messageText = isRu
          ? `💫 **Выберите подписку**

Получите доступ ко всем функциям нейро-бота!

**Free** — 3 генерации/день, AI чат
**Basic** — 299 ₽/мес: 50 генераций/мес, AI чат
**Pro** — 699 ₽/мес: безлимит, все инструменты
**Studio** — 1 999 ₽/мес: всё + API + маркетплейс`
          : `💫 **Choose Subscription**

Get access to all neuro-bot features!

**Free** — 3 generations/day, AI chat
**Basic** — $4/mo: 50 generations/mo, AI chat
**Pro** — $9/mo: unlimited, all tools
**Studio** — $25/mo: everything + API + marketplace`

        logger.warn(
          `[${ModeEnum.SubscriptionScene}] Translation not found for key 'subscriptionScene'. Using fallback text.`,
          { telegram_id: ctx.from?.id, bot_name: ctx.botInfo?.username }
        )
      }

      // Сначала экранируем весь текст для MarkdownV2
      let textForTelegram = escapeMarkdownV2(messageText)
      // Затем заменяем экранированные двойные звездочки на одинарные для MarkdownV2 bold
      // Это превратит \*\*текст\*\* в *текст*
      textForTelegram = textForTelegram.replace(
        /\\\*\\\*(.*?)\\\*\\\*/g,
        '*$1*'
      )

      // ✅ ИСПРАВЛЕНИЕ: Добавляем try-catch для безопасной отправки сообщения
      try {
        // Убеждаемся, что отправляем сообщение правильному пользователю
        const userChatId = ctx.from?.id
        if (!userChatId) {
          throw new Error('User chat ID not found')
        }

        await ctx.telegram.sendMessage(userChatId, textForTelegram, {
          reply_markup: inlineKeyboard.reply_markup,
          parse_mode: 'MarkdownV2',
        })
      } catch (error) {
        logger.error(`❌ Error sending subscription message:`, {
          error: error instanceof Error ? error.message : String(error),
          telegram_id: ctx.from?.id,
          textLength: textForTelegram.length,
          messagePreview: textForTelegram.substring(0, 100),
        })

        // Fallback: отправляем простое сообщение без markdown
        try {
          const userChatId = ctx.from?.id
          if (userChatId) {
            await ctx.telegram.sendMessage(userChatId, messageText, {
              reply_markup: inlineKeyboard.reply_markup,
            })
          } else {
            throw new Error('User chat ID not found in fallback')
          }
        } catch (fallbackError) {
          logger.error(`❌ Error sending fallback subscription message:`, {
            error:
              fallbackError instanceof Error
                ? fallbackError.message
                : String(fallbackError),
            telegram_id: ctx.from?.id,
          })

          // Последний fallback: простое текстовое сообщение
          const simpleMessage = isRu
            ? 'Выберите план подписки из кнопок ниже.'
            : 'Choose a subscription plan from the buttons below.'

          const userChatId = ctx.from?.id
          if (userChatId) {
            await ctx.telegram.sendMessage(userChatId, simpleMessage, {
              reply_markup: inlineKeyboard.reply_markup,
            })
          }
        }
      }
    }

    return ctx.wizard.next()
  },
  async (ctx: MyContext) => {
    console.log('CASE: subscriptionScene.next', ctx)
    if ('callback_query' in ctx.update && 'data' in ctx.update.callback_query) {
      // Answer the callback up front so the subscription plan button's spinner
      // does not hang ~30s on any branch (scene.enter PaymentScene / admin test /
      // mainmenu / unknown), all of which returned without answering. .catch
      // guards a stale/expired query id.
      await ctx.answerCbQuery().catch(() => {})
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
        await ctx.scene.leave()
        const { showMainMenu } = await import('@/navigation')
        await showMainMenu(ctx)
        return
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
    } else if ('message' in ctx.update && 'text' in ctx.update.message) {
      const messageText = ctx.update.message.text

      // ✅ СПЕЦИАЛЬНАЯ ОБРАБОТКА КОМАНДЫ /instagram
      if (messageText === '/instagram') {
        console.log(
          '🔍 [DEBUG] /instagram command in subscriptionScene - showing subscription required message'
        )
        logger.info('🔍 [DEBUG] /instagram command in subscriptionScene', {
          telegramId: ctx.from?.id,
          currentScene: 'subscription_scene',
        })

        const isRu = isRussian(ctx)
        const instagramMessage = isRu
          ? '📊 *Instagram анализ конкурентов*\n\n' +
            '❌ Для использования функции анализа конкурентов Instagram необходима активная подписка.\n\n' +
            '🎯 Выберите подходящий план подписки выше, чтобы получить доступ к:\n' +
            '• Анализу профилей конкурентов\n' +
            '• Изучению их контент-стратегий\n' +
            '• Анализу популярных Reels\n' +
            '• Детальной аналитике аудитории'
          : '📊 *Instagram Competitor Analysis*\n\n' +
            '❌ An active subscription is required to use Instagram competitor analysis.\n\n' +
            '🎯 Choose a suitable subscription plan above to get access to:\n' +
            '• Competitor profile analysis\n' +
            '• Content strategy insights\n' +
            '• Popular Reels analysis\n' +
            '• Detailed audience analytics'

        await ctx.reply(instagramMessage, { parse_mode: 'Markdown' })
        return // Остаемся в сцене подписки
      }

      // ✅ КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Обработка кнопок меню
      // Проверяем, не нажал ли пользователь кнопку из главного меню
      try {
        const { ALL_BUTTONS } = await import(
          '@/navigation/config/buttons.config'
        )
        const button = Object.values(ALL_BUTTONS).find(
          btn => btn.ru === messageText || btn.en === messageText
        )

        if (button) {
          // Это кнопка меню! Выходим из сцены и позволяем глобальному обработчику её обработать
          logger.info(
            '🔄 [subscriptionScene] Menu button detected, exiting scene',
            {
              telegramId: ctx.from?.id,
              buttonText: messageText,
            }
          )
          return ctx.scene.leave()
        }
      } catch (error) {
        // Если не удалось импортировать, просто выходим из сцены
        logger.warn(
          '⚠️ [subscriptionScene] Failed to import NAVIGATION_BUTTONS, exiting scene',
          {
            error: error instanceof Error ? error.message : String(error),
            telegramId: ctx.from?.id,
          }
        )
        return ctx.scene.leave()
      }

      // ✅ ОБРАБОТКА ДРУГИХ ТЕКСТОВЫХ КОМАНД - УДАЛЁН УДАЛЁН
      // Все кнопки обрабатываются глобальными обработчиками
      return ctx.scene.leave()
    } else {
      // УДАЛЁН УДАЛЁН - используется setupHearsHandlers
      return ctx.scene.leave()
    }
  }
)

// ✅ ОБРАБОТЧИК КНОПКИ ОТМЕНЫ
subscriptionScene.action('cancel_subscription', async ctx => {
  await ctx.answerCbQuery()
  const isRu = isRussian(ctx)

  await ctx.editMessageText(
    isRu ? '❌ Оформление подписки отменено.' : '❌ Subscription canceled.'
  )

  await ctx.scene.leave()
  const { showMainMenu } = await import('@/navigation')
  await showMainMenu(ctx)
})
