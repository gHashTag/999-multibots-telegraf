import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { PaymentType } from '@/interfaces/payments.interface'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { scrapeInstagramDirect } from '@/services/instagramScraperDirect'
import { supabaseAdmin } from '@/core/supabase/client'

// ========== ИНТЕРФЕЙСЫ ==========
interface InstagramParserState {
  type?: 'competitor' | 'hashtag'
  target?: string
  count?: number
  cost?: number
}

// ========== КОНСТАНТЫ ==========
const REELS_PRICING = {
  10: 3, // 10 рилсов = 3 звезды
  25: 8, // 25 рилсов = 8 звезд
  50: 15, // 50 рилсов = 15 звезд
  100: 30, // 100 рилсов = 30 звезд
  200: 55, // 200 рилсов = 55 звезд (скидка)
}

// ========== SIMPLIFIED SCENE ==========
export const instagramParserScene = new Scenes.WizardScene<MyContext>(
  'instagram_parser_scene',

  // ШАГ 1: Главное меню + обработка выбора
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const userId = ctx.from?.id

    logger.info('🔥 [SIMPLIFIED] Step 1 entered', {
      userId,
      wizardCursor: ctx.wizard.cursor,
      wizardState: ctx.wizard.state,
      updateType: ctx.callbackQuery
        ? 'callback_query'
        : ctx.message
          ? 'message'
          : 'unknown',
    })

    // Если это callback query (пользователь выбрал опцию)
    if (ctx.callbackQuery) {
      const action = (ctx.callbackQuery as any).data
      const state = ctx.wizard.state as InstagramParserState

      logger.info('Instagram parser scene - Processing callback', {
        userId,
        action,
      })

      if (action === 'parse_competitor') {
        state.type = 'competitor'
        await ctx.answerCbQuery()
        await ctx.editMessageText(
          isRu
            ? '👤 Введите username аккаунта (без @):\n\n📝 Примеры: nike, adidas, zara'
            : '👤 Enter account username (without @):\n\n📝 Examples: nike, adidas, zara',
          Markup.inlineKeyboard([
            [
              Markup.button.callback(
                isRu ? '❌ Отмена' : '❌ Cancel',
                'cancel'
              ),
            ],
          ])
        )
        return ctx.wizard.next()
      }

      if (action === 'parse_hashtag') {
        state.type = 'hashtag'
        await ctx.answerCbQuery()
        await ctx.editMessageText(
          isRu
            ? '#️⃣ Введите хештег (без #):\n\n📝 Примеры: fitness, travel, food'
            : '#️⃣ Enter hashtag (without #):\n\n📝 Examples: fitness, travel, food',
          Markup.inlineKeyboard([
            [
              Markup.button.callback(
                isRu ? '❌ Отмена' : '❌ Cancel',
                'cancel'
              ),
            ],
          ])
        )
        return ctx.wizard.next()
      }

      if (action === 'my_stats') {
        await ctx.answerCbQuery()
        await showStats(ctx)
        return ctx.wizard.selectStep(0) // Остаёмся на первом шаге для обработки следующих действий
      }

      if (action === 'help') {
        await ctx.answerCbQuery()
        await showHelp(ctx)
        return ctx.wizard.selectStep(0) // Остаёмся на первом шаге для обработки следующих действий
      }

      if (action === 'exit') {
        await ctx.answerCbQuery()
        await ctx.editMessageText(isRu ? '👋 До встречи!' : '👋 See you!')
        return ctx.scene.leave()
      }

      // Обработка кнопки "Назад" из статистики или помощи
      if (action === 'back_to_menu') {
        await ctx.answerCbQuery()
        // Показываем главное меню
        const menuText = isRu
          ? '🎬 Instagram Парсер\n\n📱 Собирайте рилсы конкурентов и по хештегам\n⚡ Быстро и эффективно\n\nВыберите действие:'
          : '🎬 Instagram Parser\n\n📱 Collect competitor reels and by hashtags\n⚡ Fast and efficient\n\nChoose action:'

        await ctx.editMessageText(
          menuText,
          Markup.inlineKeyboard([
            [
              Markup.button.callback(
                isRu ? '👤 Парсинг конкурента' : '👤 Parse competitor',
                'parse_competitor'
              ),
            ],
            [
              Markup.button.callback(
                isRu ? '#️⃣ Парсинг по хештегу' : '#️⃣ Parse by hashtag',
                'parse_hashtag'
              ),
            ],
            [
              Markup.button.callback(
                isRu ? '📊 Моя статистика' : '📊 My statistics',
                'my_stats'
              ),
            ],
            [Markup.button.callback(isRu ? '❓ Помощь' : '❓ Help', 'help')],
            [Markup.button.callback(isRu ? '❌ Выход' : '❌ Exit', 'exit')],
          ])
        )
        return ctx.wizard.selectStep(0) // Остаёмся на первом шаге
      }
    } else {
      // Показываем главное меню при входе
      const menuText = isRu
        ? '🎬 Instagram Парсер\n\n📱 Собирайте рилсы конкурентов и по хештегам\n⚡ Быстро и эффективно\n\nВыберите действие:'
        : '🎬 Instagram Parser\n\n📱 Collect competitor reels and by hashtags\n⚡ Fast and efficient\n\nChoose action:'

      await ctx.reply(
        menuText,
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              isRu ? '👤 Парсинг конкурента' : '👤 Parse competitor',
              'parse_competitor'
            ),
          ],
          [
            Markup.button.callback(
              isRu ? '#️⃣ Парсинг по хештегу' : '#️⃣ Parse by hashtag',
              'parse_hashtag'
            ),
          ],
          [
            Markup.button.callback(
              isRu ? '📊 Моя статистика' : '📊 My statistics',
              'my_stats'
            ),
          ],
          [Markup.button.callback(isRu ? '❓ Помощь' : '❓ Help', 'help')],
          [Markup.button.callback(isRu ? '❌ Выход' : '❌ Exit', 'exit')],
        ])
      )
    }
  },

  // ШАГ 2: Обработка ввода + выбор количества + выполнение парсинга
  async ctx => {
    const userId = ctx.from?.id
    const isRu = isRussianFromState(ctx)
    const state = ctx.wizard.state as InstagramParserState

    logger.info('🔥 [SIMPLIFIED] Step 2 entered', {
      userId,
      wizardCursor: ctx.wizard.cursor,
      updateType: ctx.callbackQuery
        ? 'callback_query'
        : ctx.message
          ? 'message'
          : 'unknown',
    })

    // Обработка отмены
    if (ctx.callbackQuery && (ctx.callbackQuery as any).data === 'cancel') {
      await ctx.answerCbQuery()
      return ctx.wizard.selectStep(0)
    }

    // Если это выбор количества рилсов
    if (ctx.callbackQuery) {
      const action = (ctx.callbackQuery as any).data
      const match = action.match(/count_(\d+)/)

      if (match) {
        const count = parseInt(match[1])
        const cost = REELS_PRICING[count as keyof typeof REELS_PRICING]

        state.count = count
        state.cost = cost

        if (!userId) {
          await ctx.answerCbQuery(
            isRu ? '❌ Ошибка авторизации' : '❌ Authorization error'
          )
          return ctx.scene.leave()
        }

        // Проверяем баланс
        const currentBalance = await getUserBalance(
          userId.toString(),
          ctx.botInfo?.username
        )

        if (currentBalance < cost) {
          await ctx.answerCbQuery()
          await ctx.editMessageText(
            isRu
              ? `❌ Недостаточно звезд\n\nНеобходимо: ${cost} ⭐\nВаш баланс: ${currentBalance} ⭐`
              : `❌ Not enough stars\n\nRequired: ${cost} ⭐\nYour balance: ${currentBalance} ⭐`,
            Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  isRu ? '💳 Пополнить баланс' : '💳 Top up balance',
                  'top_up'
                ),
              ],
              [Markup.button.callback(isRu ? '⬅️ Назад' : '⬅️ Back', 'back')],
            ])
          )
          return
        }

        await ctx.answerCbQuery(
          isRu ? '🚀 Запускаю парсинг...' : '🚀 Starting parsing...'
        )

        try {
          // Списываем баланс
          await updateUserBalance(
            userId.toString(),
            cost as any,
            PaymentType.MONEY_OUTCOME,
            isRu
              ? `Instagram парсинг: ${state.type === 'competitor' ? '@' : '#'}${state.target} (${count} рилсов)`
              : `Instagram parsing: ${state.type === 'competitor' ? '@' : '#'}${state.target} (${count} reels)`,
            {
              service_type: 'instagram_parser',
              target: state.target,
              count,
              stars: cost,
            }
          )

          // Запускаем парсинг
          const { generateInstagramScraping } = await import(
            '@/services/generateInstagramScraping'
          )
          const result = await generateInstagramScraping(
            state.target,
            1,
            count,
            count,
            true,
            userId.toString(),
            ctx,
            ctx.botInfo?.username || 'telegram_bot'
          )

          if (result?.success) {
            // Сохраняем запись о парсинге для статистики
            try {
              const { error: saveError } = await supabaseAdmin
                .from('instagram_scrapings')
                .insert({
                  telegram_id: userId.toString(),
                  user_id: userId.toString(),
                  target: state.target,
                  source_type: state.type,
                  reels_count: count,
                  cost: cost,
                  status: 'pending',
                  bot_name: ctx.botInfo?.username || 'telegram_bot',
                  created_at: new Date().toISOString(),
                })

              if (saveError) {
                logger.error('Failed to save scraping record', {
                  error: saveError,
                  userId,
                })
              } else {
                logger.info('Scraping record saved for statistics', {
                  userId,
                  target: state.target,
                })
              }
            } catch (err) {
              logger.error('Error saving scraping record', {
                error: err,
                userId,
              })
            }
            await ctx.editMessageText(
              isRu
                ? `✅ Парсинг запущен!\n\n🎯 Цель: ${state.type === 'competitor' ? '@' : '#'}${state.target}\n📊 Количество: ${count} рилсов\n💰 Списано: ${cost} ⭐\n\n📬 Результаты придут автоматически через 3-10 минут`
                : `✅ Parsing started!\n\n🎯 Target: ${state.type === 'competitor' ? '@' : '#'}${state.target}\n📊 Count: ${count} reels\n💰 Charged: ${cost} ⭐\n\n📬 Results will arrive automatically in 3-10 minutes`,
              Markup.inlineKeyboard([
                [
                  Markup.button.callback(
                    isRu ? '🔄 Новый парсинг' : '🔄 New parsing',
                    'restart'
                  ),
                ],
                [
                  Markup.button.callback(
                    isRu ? '🏠 В главное меню' : '🏠 Main menu',
                    'main_menu'
                  ),
                ],
              ])
            )
          } else {
            await ctx.editMessageText(
              isRu ? '❌ Ошибка запуска парсинга' : '❌ Parsing start error'
            )
          }
        } catch (error) {
          logger.error('Parsing error', { error, userId })
          await ctx.editMessageText(
            isRu ? '❌ Ошибка парсинга' : '❌ Parsing error'
          )
        }

        ;(ctx.wizard as any).state = {}
        return ctx.scene.leave()
      }

      // Обработка служебных кнопок
      if (action === 'restart') {
        await ctx.answerCbQuery()
        ;(ctx.wizard as any).state = {}
        return ctx.wizard.selectStep(0)
      }

      if (action === 'main_menu') {
        await ctx.answerCbQuery()
        await ctx.scene.enter('menuScene')
        return
      }

      if (action === 'top_up') {
        await ctx.answerCbQuery()
        await ctx.scene.enter('payment_scene')
        return
      }

      if (action === 'back') {
        await ctx.answerCbQuery()
        return ctx.wizard.selectStep(0)
      }
    }

    // Если это ввод текста (target)
    if (ctx.message && 'text' in ctx.message) {
      const target = ctx.message.text.replace(/[@#]/g, '').trim().toLowerCase()

      // Валидация
      if (
        target.length < 2 ||
        target.length > 30 ||
        !/^[a-z0-9._]+$/.test(target)
      ) {
        await ctx.reply(
          isRu
            ? '❌ Некорректное название. Используйте 2-30 символов: буквы, цифры, точки, подчеркивания'
            : '❌ Invalid name. Use 2-30 characters: letters, numbers, dots, underscores'
        )
        return
      }

      state.target = target

      const typeText =
        state.type === 'competitor'
          ? isRu
            ? 'Аккаунт'
            : 'Account'
          : isRu
            ? 'Хештег'
            : 'Hashtag'
      const prefix = state.type === 'competitor' ? '@' : '#'

      await ctx.reply(
        isRu
          ? `✅ ${typeText}: ${prefix}${target}\n\n⚙️ Выберите количество рилсов:`
          : `✅ ${typeText}: ${prefix}${target}\n\n⚙️ Choose number of reels:`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback(`10 (${REELS_PRICING[10]}⭐)`, 'count_10'),
            Markup.button.callback(`25 (${REELS_PRICING[25]}⭐)`, 'count_25'),
            Markup.button.callback(`50 (${REELS_PRICING[50]}⭐)`, 'count_50'),
          ],
          [
            Markup.button.callback(
              `100 (${REELS_PRICING[100]}⭐)`,
              'count_100'
            ),
            Markup.button.callback(
              `200 (${REELS_PRICING[200]}⭐)`,
              'count_200'
            ),
          ],
          [Markup.button.callback(isRu ? '❌ Отмена' : '❌ Cancel', 'cancel')],
        ])
      )
    }
  }
)

// ========== MIDDLEWARE ДЛЯ ДИАГНОСТИКИ ==========
instagramParserScene.use(async (ctx, next) => {
  const userId = ctx.from?.id
  logger.info(
    '🔥 [SCENE MIDDLEWARE] Processing update in Instagram Parser Scene',
    {
      userId,
      updateType: ctx.callbackQuery
        ? 'callback_query'
        : ctx.message
          ? 'message'
          : 'unknown',
      callbackData: ctx.callbackQuery
        ? (ctx.callbackQuery as any).data
        : 'no callback',
      messageText:
        ctx.message && 'text' in ctx.message ? ctx.message.text : 'no text',
      wizardCursor: ctx.wizard.cursor,
      wizardState: ctx.wizard.state,
      sceneSession: ctx.scene.session,
    }
  )

  return next()
})

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
async function showStats(ctx: MyContext) {
  const isRu = isRussianFromState(ctx)
  const userId = ctx.from?.id

  if (!userId) return

  try {
    logger.info('📊 [STATS] Fetching Instagram stats', {
      userId,
      userIdString: userId.toString(),
      table: 'instagram_apify_reels',
    })

    // Проверим обе таблицы для статистики

    // 1. Проверяем instagram_apify_reels (новые данные от Apify)
    const { data: apifyReels, error: apifyError } = await supabaseAdmin
      .from('instagram_apify_reels')
      .select('*')
      .or(`telegram_id.eq.${userId.toString()},telegram_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(100)

    logger.info('📊 [STATS] instagram_apify_reels query', {
      userId,
      count: apifyReels?.length || 0,
      error: apifyError,
    })

    // 2. Проверяем instagram_scrapings (старые записи о парсингах)
    const { data: scrapings, error: scrapingsError } = await supabaseAdmin
      .from('instagram_scrapings')
      .select('*')
      .eq('telegram_id', userId.toString())
      .order('created_at', { ascending: false })
      .limit(100)

    logger.info('📊 [STATS] instagram_scrapings query', {
      userId,
      count: scrapings?.length || 0,
      error: scrapingsError,
    })

    // Используем данные из обеих таблиц
    const reels = apifyReels || []
    const hasScrapings = scrapings && scrapings.length > 0

    logger.info('📊 [STATS] Combined results', {
      userId,
      apifyReelsCount: apifyReels?.length || 0,
      scrapingsCount: scrapings?.length || 0,
      firstApifyReel: apifyReels?.[0] || 'no data',
      firstScraping: scrapings?.[0] || 'no data',
    })

    // Если есть данные в instagram_scrapings, используем их
    if (hasScrapings) {
      const total_parsings = scrapings.length
      const total_reels = scrapings.reduce(
        (sum, s) => sum + (s.reels_count || 0),
        0
      )
      const total_cost = scrapings.reduce((sum, s) => sum + (s.cost || 0), 0)

      // Последние парсинги
      const recent = scrapings.slice(0, 3)
      const recentText = recent
        .map(
          s =>
            `${s.source_type === 'competitor' ? '@' : '#'}${s.target} - ${s.reels_count} ${isRu ? 'рилсов' : 'reels'}`
        )
        .join('\n')

      await ctx.editMessageText(
        isRu
          ? `📊 Ваша статистика Instagram парсера\n\n` +
              `📈 Всего парсингов: ${total_parsings}\n` +
              `🎬 Всего рилсов: ${total_reels}\n` +
              `💰 Потрачено звезд: ${total_cost} ⭐\n` +
              (recent.length > 0
                ? `\n📝 Последние парсинги:\n${recentText}`
                : '')
          : `📊 Your Instagram parser statistics\n\n` +
              `📈 Total parsings: ${total_parsings}\n` +
              `🎬 Total reels: ${total_reels}\n` +
              `💰 Stars spent: ${total_cost} ⭐\n` +
              (recent.length > 0 ? `\n📝 Recent parsings:\n${recentText}` : ''),
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              isRu ? '⬅️ Назад' : '⬅️ Back',
              'back_to_menu'
            ),
          ],
        ])
      )
      return
    }

    // Если данных в instagram_scrapings нет, проверяем instagram_apify_reels
    // Группируем по источникам для подсчёта парсингов
    const sourcesMap = new Map()
    reels?.forEach(reel => {
      const key = `${reel.source_type || 'competitor'}:${reel.source_username || reel.owner_username || 'unknown'}`
      if (!sourcesMap.has(key)) {
        sourcesMap.set(key, {
          count: 0,
          type: reel.source_type || 'competitor',
          username: reel.source_username || reel.owner_username || 'unknown',
        })
      }
      sourcesMap.get(key).count++
    })

    const total_parsings = sourcesMap.size // Количество уникальных источников
    const total_reels = reels?.length || 0
    // Приблизительная стоимость (3 звезды за 10 рилсов)
    const total_cost = Math.ceil(total_reels / 10) * 3

    // Последние источники парсинга
    const recentSources = Array.from(sourcesMap.values()).slice(0, 3)
    const recentText = recentSources
      .map(
        s =>
          `${s.type === 'hashtag' ? '#' : '@'}${s.username} - ${s.count} ${isRu ? 'рилсов' : 'reels'}`
      )
      .join('\n')

    await ctx.editMessageText(
      isRu
        ? `📊 Ваша статистика Instagram парсера\n\n` +
            `📈 Всего парсингов: ${total_parsings}\n` +
            `🎬 Всего рилсов: ${total_reels}\n` +
            `💰 Потрачено звезд: ${total_cost} ⭐\n` +
            (recentSources.length > 0
              ? `\n📝 Последние парсинги:\n${recentText}`
              : '')
        : `📊 Your Instagram parser statistics\n\n` +
            `📈 Total parsings: ${total_parsings}\n` +
            `🎬 Total reels: ${total_reels}\n` +
            `💰 Stars spent: ${total_cost} ⭐\n` +
            (recentSources.length > 0
              ? `\n📝 Recent parsings:\n${recentText}`
              : ''),
      Markup.inlineKeyboard([
        [Markup.button.callback(isRu ? '⬅️ Назад' : '⬅️ Back', 'back_to_menu')],
      ])
    )
  } catch (error) {
    logger.error('Error showing stats', { error, userId })
    await ctx.editMessageText(
      isRu ? '❌ Ошибка загрузки статистики' : '❌ Error loading statistics'
    )
  }
}

async function showHelp(ctx: MyContext) {
  const isRu = isRussianFromState(ctx)

  await ctx.editMessageText(
    isRu
      ? `❓ Помощь по Instagram парсеру\n\n` +
          `🎯 Что это?\n` +
          `Парсер собирает рилсы из Instagram по вашему запросу.\n\n` +
          `📱 Как работает?\n` +
          `1. Выберите тип парсинга (аккаунт или хештег)\n` +
          `2. Введите цель (username или hashtag)\n` +
          `3. Выберите количество рилсов\n` +
          `4. Подтвердите оплату\n` +
          `5. Получите результат через 5-15 минут\n\n` +
          `💰 Стоимость:\n` +
          `• 10 рилсов - 3 ⭐\n` +
          `• 25 рилсов - 8 ⭐\n` +
          `• 50 рилсов - 15 ⭐\n` +
          `• 100 рилсов - 30 ⭐\n` +
          `• 200 рилсов - 55 ⭐\n\n` +
          `⚠️ Важно:\n` +
          `• Аккаунты должны быть открытыми\n` +
          `• Результат зависит от доступности контента\n` +
          `• Парсинг занимает время`
      : `❓ Instagram parser help\n\n` +
          `🎯 What is it?\n` +
          `Parser collects reels from Instagram by your request.\n\n` +
          `📱 How it works?\n` +
          `1. Choose parsing type (account or hashtag)\n` +
          `2. Enter target (username or hashtag)\n` +
          `3. Choose number of reels\n` +
          `4. Confirm payment\n` +
          `5. Get result in 5-15 minutes\n\n` +
          `💰 Pricing:\n` +
          `• 10 reels - 3 ⭐\n` +
          `• 25 reels - 8 ⭐\n` +
          `• 50 reels - 15 ⭐\n` +
          `• 100 reels - 30 ⭐\n` +
          `• 200 reels - 55 ⭐\n\n` +
          `⚠️ Important:\n` +
          `• Accounts must be public\n` +
          `• Result depends on content availability\n` +
          `• Parsing takes time`,
    Markup.inlineKeyboard([
      [Markup.button.callback(isRu ? '⬅️ Назад' : '⬅️ Back', 'back_to_menu')],
    ])
  )
}

// ========== ОБРАБОТЧИКИ ACTION ==========
// Все обработчики перенесены в основной код wizard сцены для корректной работы
