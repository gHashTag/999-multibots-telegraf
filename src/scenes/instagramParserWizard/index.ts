import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import {
  handleHelpCancel,
  createHelpCancelKeyboard,
  getMainMenuText,
} from '@/navigation'
import { generateInstagramScraping } from '@/services/generateInstagramScraping'
import { updateUserBalance } from '@/core/supabase'
import { PaymentType } from '@/interfaces'
import { logger } from '@/utils/logger'
import { ADMIN_IDS_ARRAY } from '@/config'

// Интерфейс для сессии Instagram парсинга
interface InstagramParserSessionData {
  type?: 'competitor' | 'hashtag'
  target?: string
  count?: number
  cost?: number
}

export const instagramParserWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.InstagramParserWizard,

  // ==========================================
  // ШАГ 0: ВЫБОР ТИПА ПАРСИНГА
  // ==========================================
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const userId = ctx.from?.id

    // 🔒 Проверка админа
    if (!userId || !ADMIN_IDS_ARRAY.includes(userId)) {
      await ctx.reply(
        isRu
          ? '❌ У вас нет доступа к этой функции.'
          : '❌ You have no access to this function.'
      )
      return ctx.scene.leave()
    }

    logger.info('Instagram Parser Wizard: Step 0 - Type selection', {
      userId: ctx.from?.id,
    })

    // Создаем клавиатуру выбора типа
    const keyboard = Markup.keyboard([
      [
        Markup.button.text(isRu ? '👤 Конкурент' : '👤 Competitor'),
        Markup.button.text(isRu ? '#️⃣ Хештег' : '#️⃣ Hashtag'),
      ],
      [
        Markup.button.text(
          isRu ? 'Справка по команде' : 'Help for the command'
        ),
        Markup.button.text(isRu ? 'Отмена' : 'Cancel'),
      ],
      [Markup.button.text(getMainMenuText(isRu))],
    ])
      .resize()
      .oneTime()

    await ctx.reply(
      isRu
        ? '🔍 **Парсинг Instagram**\n\n' +
            '⚙️ Выберите тип парсинга:\n\n' +
            '👤 **Конкурент** - парсинг конкретного аккаунта\n' +
            '#️⃣ **Хештег** - парсинг по хештегу\n\n' +
            '💡 Выберите опцию из меню ниже:'
        : '🔍 **Instagram Parsing**\n\n' +
            '⚙️ Choose parsing type:\n\n' +
            '👤 **Competitor** - parse specific account\n' +
            '#️⃣ **Hashtag** - parse by hashtag\n\n' +
            '💡 Choose option from menu below:',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup,
      }
    )

    return ctx.wizard.next()
  },

  // ==========================================
  // ШАГ 1: ОБРАБОТКА ВЫБОРА ТИПА + ВВОД TARGET
  // ==========================================
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const sessionData = ctx.wizard.state as InstagramParserSessionData
    const message = ctx.message

    if (!message || !('text' in message)) {
      await ctx.reply(
        isRu
          ? '⚠️ Пожалуйста, выберите тип парсинга.'
          : '⚠️ Please choose parsing type.'
      )
      return
    }

    // Обработка отмены
    if (await handleHelpCancel(ctx)) {
      return ctx.scene.leave()
    }

    const text = message.text.trim()

    // Если это выбор типа
    if (text === '👤 Конкурент' || text === '👤 Competitor') {
      sessionData.type = 'competitor'

      await ctx.reply(
        isRu
          ? '👤 **Парсинг конкурента**\n\n' +
              '✏️ Введите Instagram username (без @):\n\n' +
              '💡 Например: neuro_sage'
          : '👤 **Competitor Parsing**\n\n' +
              '✏️ Enter Instagram username (without @):\n\n' +
              '💡 Example: neuro_sage',
        {
          parse_mode: 'Markdown',
          ...createHelpCancelKeyboard(isRu),
        }
      )

      return ctx.wizard.next()
    }

    if (text === '#️⃣ Хештег' || text === '#️⃣ Hashtag') {
      sessionData.type = 'hashtag'

      await ctx.reply(
        isRu
          ? '#️⃣ **Парсинг по хештегу**\n\n' +
              '✏️ Введите хештег (без #):\n\n' +
              '💡 Например: neurocoding'
          : '#️⃣ **Hashtag Parsing**\n\n' +
              '✏️ Enter hashtag (without #):\n\n' +
              '💡 Example: neurocoding',
        {
          parse_mode: 'Markdown',
          ...createHelpCancelKeyboard(isRu),
        }
      )

      return ctx.wizard.next()
    }

    // Неизвестный выбор
    await ctx.reply(
      isRu
        ? '❌ Неизвестный тип. Пожалуйста, выберите из предложенных вариантов.'
        : '❌ Unknown type. Please choose from the suggested options.'
    )
  },

  // ==========================================
  // ШАГ 2: ОБРАБОТКА ВВОДА TARGET + ВЫБОР КОЛИЧЕСТВА
  // ==========================================
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const sessionData = ctx.wizard.state as InstagramParserSessionData
    const message = ctx.message

    if (!message || !('text' in message)) {
      await ctx.reply(
        isRu
          ? '⚠️ Пожалуйста, введите username или хештег.'
          : '⚠️ Please enter username or hashtag.'
      )
      return
    }

    // Обработка отмены
    if (await handleHelpCancel(ctx)) {
      return ctx.scene.leave()
    }

    const target = message.text.trim().replace(/[@#]/g, '')

    // Валидация
    const validationRegex = /^[a-zA-Z0-9._]{1,30}$/
    if (!validationRegex.test(target)) {
      await ctx.reply(
        isRu
          ? '❌ Некорректный формат!\n\n' +
              '✅ Должен содержать только буквы, цифры, точки и подчеркивания (1-30 символов)\n' +
              '💡 Попробуйте еще раз:'
          : '❌ Invalid format!\n\n' +
              '✅ Must contain only letters, numbers, dots and underscores (1-30 characters)\n' +
              '💡 Try again:',
        createHelpCancelKeyboard(isRu)
      )
      return
    }

    sessionData.target = target

    // Создаем клавиатуру выбора количества
    const keyboard = Markup.keyboard([
      ['10 (3⭐)', '25 (8⭐)', '50 (15⭐)'],
      ['100 (30⭐)', '200 (55⭐)'],
      [
        Markup.button.text(
          isRu ? 'Справка по команде' : 'Help for the command'
        ),
        Markup.button.text(isRu ? 'Отмена' : 'Cancel'),
      ],
      [Markup.button.text(getMainMenuText(isRu))],
    ])
      .resize()
      .oneTime()

    await ctx.reply(
      isRu
        ? `✅ ${sessionData.type === 'competitor' ? 'Аккаунт' : 'Хештег'}: ${sessionData.type === 'competitor' ? '@' : '#'}${target}\n\n` +
            '⚙️ Выберите количество рилсов для парсинга:\n\n' +
            '💡 Выберите из предложенных вариантов:'
        : `✅ ${sessionData.type === 'competitor' ? 'Account' : 'Hashtag'}: ${sessionData.type === 'competitor' ? '@' : '#'}${target}\n\n` +
            '⚙️ Choose number of reels to parse:\n\n' +
            '💡 Choose from the options below:',
      {
        reply_markup: keyboard.reply_markup,
      }
    )

    return ctx.wizard.next()
  },

  // ==========================================
  // ШАГ 3: ОБРАБОТКА ВЫБОРА КОЛИЧЕСТВА + ПОДТВЕРЖДЕНИЕ
  // ==========================================
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const sessionData = ctx.wizard.state as InstagramParserSessionData
    const message = ctx.message

    if (!message || !('text' in message)) {
      await ctx.reply(
        isRu
          ? '⚠️ Пожалуйста, выберите количество рилсов.'
          : '⚠️ Please choose number of reels.'
      )
      return
    }

    // Обработка отмены
    if (await handleHelpCancel(ctx)) {
      return ctx.scene.leave()
    }

    const text = message.text.trim()

    // Парсинг количества и стоимости
    let count: number
    let cost: number

    if (text === '10 (3⭐)') {
      count = 10
      cost = 3
    } else if (text === '25 (8⭐)') {
      count = 25
      cost = 8
    } else if (text === '50 (15⭐)') {
      count = 50
      cost = 15
    } else if (text === '100 (30⭐)') {
      count = 100
      cost = 30
    } else if (text === '200 (55⭐)') {
      count = 200
      cost = 55
    } else {
      await ctx.reply(
        isRu
          ? '❌ Неизвестное количество. Пожалуйста, выберите из предложенных вариантов.'
          : '❌ Unknown quantity. Please choose from the suggested options.'
      )
      return
    }

    sessionData.count = count
    sessionData.cost = cost

    // Создаем клавиатуру подтверждения
    const keyboard = Markup.keyboard([
      [
        Markup.button.text(isRu ? '✅ Подтвердить' : '✅ Confirm'),
        Markup.button.text(isRu ? 'Отмена' : 'Cancel'),
      ],
      [Markup.button.text(getMainMenuText(isRu))],
    ])
      .resize()
      .oneTime()

    await ctx.reply(
      isRu
        ? `📋 **Подтверждение парсинга**\n\n` +
            `🎯 ${sessionData.type === 'competitor' ? 'Аккаунт' : 'Хештег'}: ${sessionData.type === 'competitor' ? '@' : '#'}${sessionData.target}\n` +
            `📊 Количество рилсов: ${count}\n` +
            `💰 Стоимость: ${cost} ⭐\n\n` +
            `⏱️ Время выполнения: 3-10 минут\n` +
            `📬 Результаты будут отправлены автоматически\n\n` +
            `❓ Подтвердить запуск парсинга?`
        : `📋 **Parsing Confirmation**\n\n` +
            `🎯 ${sessionData.type === 'competitor' ? 'Account' : 'Hashtag'}: ${sessionData.type === 'competitor' ? '@' : '#'}${sessionData.target}\n` +
            `📊 Reels count: ${count}\n` +
            `💰 Cost: ${cost} ⭐\n\n` +
            `⏱️ Execution time: 3-10 minutes\n` +
            `📬 Results will be sent automatically\n\n` +
            `❓ Confirm parsing start?`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup,
      }
    )

    return ctx.wizard.next()
  },

  // ==========================================
  // ШАГ 4: ОБРАБОТКА ПОДТВЕРЖДЕНИЯ + ЗАПУСК
  // ==========================================
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const sessionData = ctx.wizard.state as InstagramParserSessionData
    const message = ctx.message
    const userId = ctx.from?.id

    if (!message || !('text' in message)) {
      await ctx.reply(
        isRu
          ? '⚠️ Пожалуйста, подтвердите или отмените операцию.'
          : '⚠️ Please confirm or cancel the operation.'
      )
      return
    }

    // Обработка отмены
    if (await handleHelpCancel(ctx)) {
      return ctx.scene.leave()
    }

    const text = message.text.trim()

    if (text === 'Отмена' || text === 'Cancel') {
      await ctx.reply(
        isRu ? '❌ Парсинг отменен.' : '❌ Parsing cancelled.',
        Markup.removeKeyboard()
      )
      return ctx.scene.leave()
    }

    if (text === '✅ Подтвердить' || text === '✅ Confirm') {
      if (
        !userId ||
        !sessionData.target ||
        !sessionData.count ||
        !sessionData.cost
      ) {
        await ctx.reply(
          isRu ? '❌ Ошибка данных сессии.' : '❌ Session data error.',
          Markup.removeKeyboard()
        )
        return ctx.scene.leave()
      }

      // Возврат ниже обязан знать, было ли вообще списание. После переноса
      // списания под проверку успеха исключение может случиться ДО него — и
      // безусловный возврат тогда начислил бы деньги, которых никто не брал.
      let charged = false

      // In-flight guard: the parse (generateInstagramScraping) + charge below are
      // awaited before scene.leave(), so a second Confirm during the ~parse would
      // re-enter and double-charge. Reject-before-set (sync); released in the
      // finally so it also fires in direct-drive tests (no session leak). #1368
      if (ctx.session.instagramParserInProgress) {
        await ctx.reply(
          isRu
            ? '⏳ Уже обрабатываю, подождите...'
            : '⏳ Already processing, please wait...'
        )
        return
      }

      ctx.session.instagramParserInProgress = true

      try {
        // Убираем клавиатуру
        await ctx.reply(
          isRu ? '🚀 Запуск парсинга...' : '🚀 Starting parsing...',
          Markup.removeKeyboard()
        )

        // СНАЧАЛА ЗАПУСК, ПОТОМ СПИСАНИЕ — списание перенесено ниже, под
        // проверку `result.success`.
        //
        // Здесь была прямая ложь пользователю: списание стояло ДО вызова, а
        // ветка неудачи сообщала «💰 Средства не были списаны». Возврат делался
        // только в `catch`, то есть при ИСКЛЮЧЕНИИ, — а `success: false` без
        // исключения оставлял человека и без услуги, и без денег, да ещё с
        // сообщением, что деньги на месте.

        // Отправляем запрос на ai-server
        const result = await generateInstagramScraping(
          sessionData.target,
          1, // project_id
          sessionData.count, // max_users
          sessionData.count, // max_reels_per_user
          true, // scrape_reels
          userId.toString(),
          ctx,
          ctx.botInfo?.username || 'telegram_bot'
        )

        if (result && result.success) {
          // Списываем только после подтверждённого запуска.
          charged = await updateUserBalance(
            userId.toString(),
            sessionData.cost,
            PaymentType.MONEY_OUTCOME,
            isRu
              ? `Instagram парсинг: ${sessionData.type === 'competitor' ? '@' : '#'}${sessionData.target} (${sessionData.count} рилсов)`
              : `Instagram parsing: ${sessionData.type === 'competitor' ? '@' : '#'}${sessionData.target} (${sessionData.count} reels)`,
            {
              service_type: 'instagram_parser',
              target: sessionData.target,
              count: sessionData.count,
              stars: sessionData.cost,
            }
          )
          // `charged` now reflects the REAL result: updateUserBalance returns
          // false (never throws) on a schema/insert failure or a ghost-payer
          // with no users row. Setting it unconditionally true used to (a)
          // discard the result — a silent free parse on a charge failure — and
          // (b) let the error path below refund (MONEY_INCOME) stars that were
          // never actually deducted (a mint). Both are closed by keying on the
          // return.
          if (!charged) {
            logger.error(
              '[instagramParser] charge failed after a successful parse — user got the result unbilled',
              { userId, cost: sessionData.cost, target: sessionData.target }
            )
          }

          await ctx.reply(
            isRu
              ? `✅ Запрос принят сервером!\n\n` +
                  `🎯 Цель: ${sessionData.type === 'competitor' ? '@' : '#'}${sessionData.target}\n` +
                  `📊 Количество: ${sessionData.count} рилсов\n` +
                  (charged
                    ? `💰 Списано: ${sessionData.cost} ⭐\n`
                    : `⚠️ Средства не списаны (техническая ошибка списания)\n`) +
                  `🔄 Event ID: ${result.eventId || 'N/A'}\n\n` +
                  `${result.message}\n\n` +
                  `📬 Результаты будут отправлены автоматически когда парсинг завершится.\n` +
                  `⏱️ Обычно занимает 3-10 минут.\n\n` +
                  `💡 Вы можете продолжать использовать бота.`
              : `✅ Request accepted by server!\n\n` +
                  `🎯 Target: ${sessionData.type === 'competitor' ? '@' : '#'}${sessionData.target}\n` +
                  `📊 Count: ${sessionData.count} reels\n` +
                  (charged
                    ? `💰 Charged: ${sessionData.cost} ⭐\n`
                    : `⚠️ You were not charged (a technical charge error)\n`) +
                  `🔄 Event ID: ${result.eventId || 'N/A'}\n\n` +
                  `${result.message}\n\n` +
                  `📬 Results will be sent automatically when parsing is complete.\n` +
                  `⏱️ Usually takes 3-10 minutes.\n\n` +
                  `💡 You can continue using the bot.`
          )
        } else {
          const errorMessage =
            result?.error || result?.message || 'Неизвестная ошибка'

          await ctx.reply(
            isRu
              ? `❌ Ошибка отправки запроса\n\n` +
                  `Причина: ${errorMessage}\n\n` +
                  `💰 Средства не были списаны.\n` +
                  `Попробуйте еще раз позже.`
              : `❌ Request sending error\n\n` +
                  `Reason: ${errorMessage}\n\n` +
                  `💰 Funds were not charged.\n` +
                  `Please try again later.`
          )
        }
      } catch (error) {
        logger.error('Instagram parser wizard error', {
          error,
          userId,
          sessionData,
        })

        // Возвращаем деньги ТОЛЬКО если списание действительно состоялось.
        // Безусловный возврат после переноса списания стал бы начислением из
        // воздуха: исключение может прилететь до того, как деньги взяли.
        if (!charged) {
          logger.info('Instagram parser: списания не было, возврат не нужен', {
            userId,
            target: sessionData.target,
          })
        }

        // Возвращаем деньги при ошибке. Если списания не было, возвращать
        // нечего — тогда и сообщать о возврате не надо.
        let refunded = !charged
        try {
          if (charged)
            refunded = await updateUserBalance(
              userId.toString(),
              sessionData.cost,
              PaymentType.MONEY_INCOME,
              isRu
                ? `Возврат за ошибку парсинга: ${sessionData.type === 'competitor' ? '@' : '#'}${sessionData.target}`
                : `Refund for parsing error: ${sessionData.type === 'competitor' ? '@' : '#'}${sessionData.target}`,
              {
                service_type: 'instagram_parser_refund',
                target: sessionData.target,
                count: sessionData.count,
                stars: sessionData.cost,
              }
            )
        } catch (refundError) {
          logger.error('Failed to refund user', {
            refundError,
            userId,
            sessionData,
          })
          refunded = false
        }

        // Про возврат говорим по факту. updateUserBalance при неудаче НЕ
        // бросает — она возвращает false (нет строки в users, не прошла
        // схема, не удалась вставка), поэтому одного try/catch мало.
        if (!refunded) {
          logger.error('💸❌ REFUND FAILED — деньги НЕ возвращены', {
            alert: 'ЧЕЛОВЕКУ НЕ ВЕРНУЛИ ЗВЁЗДЫ ПОСЛЕ НЕУДАЧНОГО ПАРСИНГА',
            userId,
            amount: sessionData.cost,
          })
        }

        await ctx.reply(
          isRu
            ? '❌ Произошла ошибка при отправке запроса на сервер.\n\n' +
                (refunded
                  ? '💰 Средства возвращены на баланс.\n'
                  : '💰 Вернуть звёзды автоматически не удалось — напишите в поддержку, приложив это сообщение.\n') +
                'Попробуйте позже или обратитесь в поддержку.'
            : '❌ Error occurred while sending request to server.\n\n' +
                (refunded
                  ? '💰 Funds have been refunded to your balance.\n'
                  : '💰 Automatic refund failed — please contact support and quote this message.\n') +
                'Try again later or contact support.'
        )
      } finally {
        ctx.session.instagramParserInProgress = false
      }

      return ctx.scene.leave()
    }

    // Неизвестный ответ
    await ctx.reply(
      isRu
        ? '❌ Неизвестный выбор. Пожалуйста, подтвердите или отмените операцию.'
        : '❌ Unknown choice. Please confirm or cancel the operation.'
    )
  }
)

// Добавляем обработчики
instagramParserWizard.start(async ctx => {
  await ctx.scene.leave()
  const { showMainMenu } = await import('@/navigation')
  await showMainMenu(ctx)
})
instagramParserWizard.help(ctx => handleHelpCancel(ctx))
instagramParserWizard.command('cancel', ctx => handleHelpCancel(ctx))
