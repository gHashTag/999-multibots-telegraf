import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { handleHelpCancel, createHelpCancelKeyboard } from '@/navigation'
import { generateInstagramScraping } from '@/services/generateInstagramScraping'
import { getBotNameByToken } from '@/core/bot'
import { getBotToken } from '@/handlers/getBotToken'
import { logger } from '@/utils/logger'
import { getUserProjects, UserProject } from '@/core/supabase/getUserProjects'
import { getParsingAccess } from '@/navigation'

// Интерфейс для сессии Instagram Scraping
interface InstagramScrapingSessionData {
  selectedProject?: UserProject
  projectId?: number
  targetUsername?: string
  maxCompetitors?: number
  includeReels?: boolean
  maxReelsPerUser?: number
  waitingForCustomCount?: boolean
}

// Функция фильтрации проектов по доступу для конкретного бота
function filterProjectsByBotAccess(
  projects: UserProject[],
  userId: string,
  botToken: string
): UserProject[] {
  const { bot_name } = getBotNameByToken(botToken)
  const parsingAccess = getParsingAccess(userId, botToken)

  // 👑 Если полный доступ ко всем проектам - возвращаем все
  if (
    parsingAccess.allowedProjects &&
    parsingAccess.allowedProjects.includes('all')
  ) {
    return projects
  }

  // 🤖 Для HaimGroupMedia_bot показываем только определенные проекты
  if (bot_name === 'HaimGroupMedia_bot') {
    const allowedProjectNames = [
      'coco age',
      'cocoage',
      'vyacheslav_nekludov',
      'вячеслав неклюдов',
    ]

    return projects.filter(project =>
      allowedProjectNames.some(allowed =>
        project.name.toLowerCase().includes(allowed)
      )
    )
  }

  // 🌐 Для всех остальных ботов показываем все проекты (если есть доступ)
  return projects
}

export const instagramScrapingWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.InstagramScrapingWizard,

  // ==========================================
  // ШАГ 0: ПЕРСОНАЛИЗИРОВАННЫЙ ВЫБОР ПРОЕКТА ПО БОТАМ
  // ==========================================
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const sessionData = ctx.wizard.state as InstagramScrapingSessionData
    const userId = ctx.from?.id?.toString()
    const botToken = ctx.telegram.token

    // Если это callback от выбора проекта
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      console.log('🚨 [DEBUG] STEP 0 - CALLBACK QUERY DETECTED:', {
        data: ctx.callbackQuery.data,
      })

      const callbackData = ctx.callbackQuery.data

      if (callbackData === 'cancel') {
        console.log('🚨 [DEBUG] CANCEL selected - leaving scene')
        await ctx.answerCbQuery()
        await ctx.reply(isRu ? '❌ Анализ отменен.' : '❌ Analysis cancelled.')
        await ctx.scene.leave()
        return
      }

      if (callbackData.startsWith('project_')) {
        console.log('🚨 [DEBUG] PROJECT callback detected in Step 0!')

        const projectId = parseInt(callbackData.replace('project_', ''))
        console.log('🚨 [DEBUG] Parsed project ID:', projectId)

        // Получаем проекты еще раз и находим выбранный
        console.log('🚨 [DEBUG] Getting projects to find selected one...')
        const allProjects = await getUserProjects(ctx.from!.id.toString())

        // 🔍 Фильтруем проекты по доступу для бота
        const filteredProjects = filterProjectsByBotAccess(
          allProjects,
          userId!,
          botToken
        )
        const selectedProject = filteredProjects.find(p => p.id === projectId)

        console.log('🚨 [DEBUG] Selected project search result:', {
          foundProject: !!selectedProject,
          selectedProject: selectedProject
            ? { id: selectedProject.id, name: selectedProject.name }
            : null,
        })

        if (!selectedProject) {
          console.log('🚨 [DEBUG] ERROR: Project not found!')
          await ctx.answerCbQuery('Проект не найден')
          return
        }

        console.log('🚨 [DEBUG] Saving project to session...')
        sessionData.selectedProject = selectedProject
        sessionData.projectId = selectedProject.id

        console.log('🚨 [DEBUG] Answering callback and editing message...')
        try {
          await ctx.answerCbQuery()
          await ctx.editMessageText(
            isRu
              ? `✅ Выбран проект: ${selectedProject.name}`
              : `✅ Selected project: ${selectedProject.name}`
          )
          console.log('🚨 [DEBUG] Message edited successfully!')
        } catch (error) {
          console.error('🚨 [ERROR] Failed to edit message:', error)

          // Fallback - отправляем новое сообщение
          await ctx.reply(
            isRu
              ? `✅ Выбран проект: ${selectedProject.name}`
              : `✅ Selected project: ${selectedProject.name}`
          )
        }

        // Переходим к запросу username
        console.log('🚨 [DEBUG] Sending username request message...')
        try {
          await ctx.reply(
            isRu
              ? '👤 Введите Instagram username для анализа конкурентов:\n\n💡 Введите без символа @ (например: neuro_sage)'
              : '👤 Enter Instagram username for competitor analysis:\n\n💡 Enter without @ symbol (example: neuro_sage)',
            createHelpCancelKeyboard(isRu)
          )
          console.log('🚨 [DEBUG] Username request message sent successfully!')
        } catch (error) {
          console.error('🚨 [ERROR] Failed to send username request:', error)

          // Fallback
          await ctx.reply(
            isRu
              ? '👤 Введите Instagram username:'
              : '👤 Enter Instagram username:'
          )
        }

        console.log('🚨 [DEBUG] Moving to next step (username input)...')
        return ctx.wizard.next()
      }

      // Неизвестный callback
      console.log('🚨 [DEBUG] Unknown callback received:', callbackData)
      await ctx.answerCbQuery()
      return
    }

    // Если это не callback, значит это первый вход в сцену - показываем проекты
    console.log('🚨 [DEBUG] INSTAGRAM WIZARD SCENE ENTERED - STEP 0!')

    console.log(
      'Instagram Scraping Wizard: Step 0 - Project selection started',
      {
        userId: ctx.from?.id,
      }
    )
    logger.info(
      'Instagram Scraping Wizard: Step 0 - Project selection started',
      {
        userId: ctx.from?.id,
        botName: getBotNameByToken(botToken).bot_name,
      }
    )

    try {
      const userId = ctx.from!.id.toString()
      const botToken = ctx.telegram.token
      const { bot_name } = getBotNameByToken(botToken)

      logger.info('Instagram Scraping Wizard: Starting step 0', {
        telegramId: ctx.from!.id,
        botName: bot_name,
      })

      // 🔍 Проверяем доступ к парсингу для текущего бота
      const parsingAccess = getParsingAccess(userId, botToken)

      if (!parsingAccess.hasAccess) {
        logger.warn('Instagram Scraping Wizard: No parsing access for user', {
          telegramId: ctx.from!.id,
          botName: bot_name,
          reason: 'No parsing access',
        })

        const noAccessMessage = isRu
          ? '❌ У вас нет доступа к функции парсинга Instagram.'
          : '❌ You have no access to Instagram parsing function.'

        await ctx.reply(noAccessMessage, createHelpCancelKeyboard(isRu))
        return
      }

      // Получаем все проекты пользователя
      const allProjects = await getUserProjects(userId)

      if (allProjects.length === 0) {
        const noProjectsMessage = isRu
          ? '❌ У вас нет проектов для анализа.\n\n💡 Сначала создайте проект в системе.'
          : '❌ You have no projects for analysis.\n\n💡 Please create a project in the system first.'

        await ctx.reply(noProjectsMessage, createHelpCancelKeyboard(isRu))
        return
      }

      // 🔍 Фильтруем проекты по доступу для бота
      const filteredProjects = filterProjectsByBotAccess(
        allProjects,
        userId!,
        botToken
      )

      if (filteredProjects.length === 0) {
        console.log(
          '🚨 [DEBUG] NO ACCESSIBLE PROJECTS - sending error message to user'
        )
        logger.warn(
          'Instagram Scraping Wizard: No accessible projects for user',
          {
            telegramId: ctx.from!.id,
            botName: bot_name,
          }
        )

        const noAccessMessage =
          bot_name === 'HaimGroupMedia_bot'
            ? isRu
              ? '❌ У вас нет доступных проектов для анализа.\n\n🔍 Доступные проекты для @HaimGroupMedia_bot:\n• Coco Age\n• Вячеслав Неклюдов\n'
              : '❌ You have no available projects for analysis.\n\n🔍 Available projects for @HaimGroupMedia_bot:\n• Coco Age\n• Vyacheslav Nekludov\n'
            : isRu
              ? '❌ У вас нет доступных проектов для анализа Instagram.'
              : '❌ You have no available projects for Instagram analysis.'

        await ctx.reply(noAccessMessage, createHelpCancelKeyboard(isRu))
        return
      }

      console.log(
        '🚨 [DEBUG] ACCESSIBLE PROJECTS FOUND - proceeding with project selection'
      )

      // Создаем inline кнопки для выбора проекта
      console.log('🚨 [DEBUG] Creating project buttons...')
      const projectButtons = filteredProjects.map(project => [
        Markup.button.callback(
          `📁 ${project.name} | ${project.industry}`,
          `project_${project.id}`
        ),
      ])

      console.log('🚨 [DEBUG] Sending project selection message to user...')

      const botSpecificTitle =
        bot_name === 'HaimGroupMedia_bot'
          ? isRu
            ? '📁 Выберите проект для анализа конкурентов (только Cocoáge и Вячеслав Неклюдов):'
            : '📁 Select project for competitor analysis (Cocoáge and Vyacheslav Nekludov only):'
          : isRu
            ? '📁 Выберите проект для анализа конкурентов Instagram:'
            : '📁 Select project for Instagram competitor analysis:'

      try {
        await ctx.reply(
          botSpecificTitle +
            '\n\n' +
            filteredProjects
              .map((p, index) => `${index + 1}. ${p.name} - ${p.industry}`)
              .join('\n'),
          {
            ...Markup.inlineKeyboard([
              ...projectButtons,
              [Markup.button.callback(isRu ? 'Отмена' : 'Cancel', 'cancel')],
            ]),
          }
        )

        console.log('🚨 [DEBUG] Project selection message sent successfully!')
      } catch (error) {
        console.error('🚨 [ERROR] Failed to send project selection message:', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          projectsCount: filteredProjects.length,
        })

        // Отправляем простое сообщение как fallback
        await ctx.reply(
          isRu
            ? `❌ Ошибка отображения проектов. Найдено проектов: ${filteredProjects.length}`
            : `❌ Error displaying projects. Found projects: ${filteredProjects.length}`
        )
      }

      console.log('🚨 [DEBUG] Waiting for user to select project...')

      // ❌ УБИРАЕМ ЭТУ СТРОКУ - она заставляла бота перейти дальше сразу!
      // return ctx.wizard.next()
    } catch (error) {
      console.error('🚨 [ERROR] Exception in step 0:', error)
      logger.error('Instagram Scraping Wizard: Step 0 failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: ctx.from?.id,
      })

      try {
        await ctx.reply(
          isRu
            ? '❌ Произошла ошибка при загрузке проектов.\n\nПожалуйста, попробуйте позже или обратитесь в поддержку.'
            : '❌ An error occurred while loading projects.\n\nPlease try again later or contact support.'
        )
        console.log('🚨 [DEBUG] Exception error message sent successfully!')
      } catch (replyError) {
        console.error(
          '🚨 [ERROR] Failed to send exception error message:',
          replyError
        )
      }
    }
  },

  // ==========================================
  // ШАГ 1: ОБРАБОТКА ВВОДА USERNAME
  // ==========================================
  async ctx => {
    console.log('🚨 [DEBUG] STEP 1 ENTERED - Processing username input')

    const isRu = isRussianFromState(ctx)
    const sessionData = ctx.wizard.state as InstagramScrapingSessionData

    console.log('🚨 [DEBUG] Checking message type...', {
      hasText: 'text' in (ctx.message || {}),
      messageType: ctx.message ? Object.keys(ctx.message) : 'no message',
    })

    // Обрабатываем ввод username
    if (ctx.message && 'text' in ctx.message) {
      console.log('🚨 [DEBUG] Processing text message for username...')

      const username = ctx.message.text.trim().replace('@', '')
      console.log('🚨 [DEBUG] Extracted username:', {
        originalText: ctx.message.text,
        processedUsername: username,
      })

      // Валидация Instagram username
      const instagramUsernameRegex = /^[a-zA-Z0-9._]{1,30}$/
      console.log('🚨 [DEBUG] Starting username validation...', {
        username,
        regex: instagramUsernameRegex.toString(),
      })

      if (!instagramUsernameRegex.test(username)) {
        console.log('🚨 [DEBUG] VALIDATION FAILED - invalid username format')
        try {
          await ctx.reply(
            isRu
              ? '❌ Некорректный Instagram username!\n\n✅ Должен содержать только буквы, цифры, точки и подчеркивания (1-30 символов)\n💡 Попробуйте еще раз:'
              : '❌ Invalid Instagram username!\n\n✅ Must contain only letters, numbers, dots and underscores (1-30 characters)\n💡 Try again:',
            createHelpCancelKeyboard(isRu)
          )
          console.log('🚨 [DEBUG] Validation error message sent successfully')
        } catch (error) {
          console.error(
            '🚨 [ERROR] Failed to send validation error message:',
            error
          )
        }
        return
      }

      console.log('🚨 [DEBUG] VALIDATION PASSED - username is valid')
      console.log('🚨 [DEBUG] Saving username to session...')
      sessionData.targetUsername = username
      console.log('🚨 [DEBUG] Username saved to session successfully!')

      console.log('🚨 [DEBUG] Sending competitors count selection message...')
      try {
        await ctx.reply(
          isRu
            ? `✅ Username: @${username}\n\n📊 Сколько конкурентов анализировать?`
            : `✅ Username: @${username}\n\n📊 How many competitors to analyze?`,
          Markup.inlineKeyboard([
            [
              Markup.button.callback('10', 'competitors_10'),
              Markup.button.callback('25', 'competitors_25'),
              Markup.button.callback('50', 'competitors_50'),
            ],
            [
              Markup.button.callback('100', 'competitors_100'),
              Markup.button.callback('250', 'competitors_250'),
              Markup.button.callback('500', 'competitors_500'),
            ],
            [
              Markup.button.callback('1000', 'competitors_1000'),
              Markup.button.callback('2500', 'competitors_2500'),
            ],
            [
              Markup.button.callback(
                isRu ? '⚙️ Другое' : '⚙️ Custom',
                'competitors_custom'
              ),
            ],
            [Markup.button.callback(isRu ? 'Отмена' : 'Cancel', 'cancel')],
          ])
        )
        console.log(
          '🚨 [DEBUG] Competitors count selection message sent successfully!'
        )
      } catch (error) {
        console.error(
          '🚨 [ERROR] Failed to send competitors count selection message:',
          error
        )

        // Fallback
        await ctx.reply(
          isRu
            ? '👤 Введите Instagram username:'
            : '👤 Enter Instagram username:'
        )
      }

      console.log(
        '🚨 [DEBUG] Moving to next step (competitors count selection)...'
      )
      return ctx.wizard.next()
    }

    // Handle cancel from help/cancel buttons
    console.log('🚨 [DEBUG] Checking for help/cancel buttons...')
    if (await handleHelpCancel(ctx)) {
      console.log('🚨 [DEBUG] Help/Cancel handled - exiting step')
      return
    }

    console.log('🚨 [DEBUG] No text message received - sending error message')
    await ctx.reply(
      isRu
        ? '⚠️ Пожалуйста, введите корректный Instagram username.'
        : '⚠️ Please enter a valid Instagram username.'
    )
  },

  // ==========================================
  // ШАГ 2: ОБРАБОТКА КОЛИЧЕСТВА КОНКУРЕНТОВ + ВЫБОР РИЛСОВ
  // ==========================================
  async ctx => {
    console.log(
      '🚨 [DEBUG] STEP 2 ENTERED - Processing competitors count selection'
    )
    const isRu = isRussianFromState(ctx)
    const sessionData = ctx.wizard.state as InstagramScrapingSessionData

    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      console.log('🚨 [DEBUG] CALLBACK QUERY in Step 2:', {
        data: ctx.callbackQuery.data,
      })

      const callbackData = ctx.callbackQuery.data

      if (callbackData === 'cancel') {
        console.log('🚨 [DEBUG] Cancel selected - leaving scene')
        await ctx.answerCbQuery()
        await ctx.reply(isRu ? '❌ Анализ отменен.' : '❌ Analysis cancelled.')
        await ctx.scene.leave()
        return
      }

      if (callbackData === 'competitors_custom') {
        console.log('🚨 [DEBUG] Custom competitors count selected')
        await ctx.answerCbQuery()
        await ctx.editMessageText(
          isRu
            ? '🔢 Введите желаемое количество конкурентов для анализа:\n\n💡 Рекомендуется: от 10 до 5000\n⚠️ Большие числа увеличат время анализа'
            : '🔢 Enter desired number of competitors to analyze:\n\n💡 Recommended: from 10 to 5000\n⚠️ Large numbers will increase analysis time'
        )

        // Остаемся в том же шаге, но теперь ожидаем текстовый ввод
        sessionData.waitingForCustomCount = true
        return
      }

      if (callbackData.startsWith('competitors_')) {
        console.log('🚨 [DEBUG] Fixed competitors count selected')
        const competitorsCountStr = callbackData.replace('competitors_', '')
        const competitorsCount = parseInt(competitorsCountStr)
        console.log('🚨 [DEBUG] Parsed competitors count:', {
          original: competitorsCountStr,
          parsed: competitorsCount,
        })

        if (isNaN(competitorsCount) || competitorsCount < 1) {
          console.log('🚨 [DEBUG] Invalid competitors count')
          await ctx.answerCbQuery('❌ Некорректное количество')
          return
        }

        sessionData.maxCompetitors = competitorsCount
        console.log(
          '🚨 [DEBUG] Competitors count saved to session:',
          competitorsCount
        )

        await ctx.answerCbQuery()
        await ctx.editMessageText(
          isRu
            ? `✅ Количество конкурентов: **${competitorsCount}**\n\n🎬 *Анализировать рилсы конкурентов?*\n\n💡 _Анализ рилсов поможет понять контент-стратегию конкурентов_`
            : `✅ Competitors count: **${competitorsCount}**\n\n🎬 *Analyze competitor reels?*\n\n💡 _Reels analysis will help understand competitors' content strategy_`,
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  isRu ? '✅ Да, с рилсами' : '✅ Yes, with reels',
                  'reels_yes'
                ),
                Markup.button.callback(
                  isRu ? '❌ Нет, без рилсов' : '❌ No, without reels',
                  'reels_no'
                ),
              ],
              [
                Markup.button.callback(
                  isRu ? '🔙 Назад' : '🔙 Back',
                  'back_to_competitors'
                ),
                Markup.button.callback(isRu ? 'Отмена' : 'Cancel', 'cancel'),
              ],
            ]),
          }
        )

        console.log('🚨 [DEBUG] Moving to next step (reels selection)...')
        return ctx.wizard.next()
      }
    }

    // Handle custom count input (text message)
    if (
      sessionData.waitingForCustomCount &&
      ctx.message &&
      'text' in ctx.message
    ) {
      console.log('🚨 [DEBUG] Processing custom competitors count input...')

      const customCountStr = ctx.message.text.trim()
      const customCount = parseInt(customCountStr)
      console.log('🚨 [DEBUG] Parsed custom count:', {
        original: customCountStr,
        parsed: customCount,
      })

      if (isNaN(customCount) || customCount < 1 || customCount > 10000) {
        console.log('🚨 [DEBUG] Invalid custom count')
        await ctx.reply(
          isRu
            ? '❌ Некорректное число!\n\n💡 Введите число от 1 до 10000:'
            : '❌ Invalid number!\n\n💡 Enter a number from 1 to 10000:'
        )
        return
      }

      sessionData.maxCompetitors = customCount
      sessionData.waitingForCustomCount = false
      console.log('🚨 [DEBUG] Custom competitors count saved:', customCount)

      try {
        await ctx.reply(
          isRu
            ? `✅ Количество конкурентов: **${customCount}**\n\n🎬 *Анализировать рилсы конкурентов?*\n\n💡 _Анализ рилсов поможет понять контент-стратегию конкурентов_`
            : `✅ Competitors count: **${customCount}**\n\n🎬 *Analyze competitor reels?*\n\n💡 _Reels analysis will help understand competitors' content strategy_`,
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  isRu ? '✅ Да, с рилсами' : '✅ Yes, with reels',
                  'reels_yes'
                ),
                Markup.button.callback(
                  isRu ? '❌ Нет, без рилсов' : '❌ No, without reels',
                  'reels_no'
                ),
              ],
              [
                Markup.button.callback(
                  isRu ? '🔙 Назад' : '🔙 Back',
                  'back_to_competitors'
                ),
                Markup.button.callback(isRu ? 'Отмена' : 'Cancel', 'cancel'),
              ],
            ]),
          }
        )
        console.log('🚨 [DEBUG] Custom count reels selection message sent!')
      } catch (error) {
        console.error(
          '🚨 [ERROR] Failed to send reels selection message:',
          error
        )

        // Fallback
        await ctx.reply(
          isRu
            ? `✅ Количество: ${customCount}\n🎬 Анализировать рилсы? (да/нет)`
            : `✅ Count: ${customCount}\n🎬 Analyze reels? (yes/no)`
        )
      }

      console.log('🚨 [DEBUG] Moving to next step (reels selection)...')
      return ctx.wizard.next()
    }

    // Handle cancel from help/cancel buttons
    console.log('🚨 [DEBUG] Checking for help/cancel buttons in Step 2...')
    if (await handleHelpCancel(ctx)) {
      console.log('🚨 [DEBUG] Help/Cancel handled - exiting step')
      return
    }

    console.log('🚨 [DEBUG] Invalid input in Step 2')
    await ctx.reply(
      isRu
        ? '⚠️ Пожалуйста, выберите количество конкурентов или введите число.'
        : '⚠️ Please select competitors count or enter a number.'
    )
  },

  // ==========================================
  // ШАГ 3: ОБРАБОТКА РИЛСОВ + ЗАПУСК АНАЛИЗА
  // ==========================================
  async ctx => {
    console.log(
      '🚨 [DEBUG] STEP 3 ENTERED - Final processing and scraping launch'
    )

    const isRu = isRussianFromState(ctx)
    const sessionData = ctx.wizard.state as InstagramScrapingSessionData

    console.log('🚨 [DEBUG] Current session data:', {
      projectId: sessionData.projectId,
      targetUsername: sessionData.targetUsername,
      maxCompetitors: sessionData.maxCompetitors,
      includeReels: sessionData.includeReels,
    })

    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      console.log('🚨 [DEBUG] CALLBACK QUERY in Step 3:', {
        data: ctx.callbackQuery.data,
      })

      const callbackData = ctx.callbackQuery.data

      if (callbackData === 'cancel') {
        console.log('🚨 [DEBUG] Cancel selected - leaving scene')
        await ctx.answerCbQuery()
        await ctx.reply(isRu ? '❌ Анализ отменен.' : '❌ Analysis cancelled.')
        await ctx.scene.leave()
        return
      }

      /*
       * Two ids, one Back button. The keyboard at :550 and :613 sends
       * `back_to_competitors`; this check only knew `back`, so the arrow at the
       * end of step two spun and stopped. Same intent, same step back.
       */
      if (callbackData === 'back' || callbackData === 'back_to_competitors') {
        console.log('🚨 [DEBUG] Back selected - going to previous step')
        await ctx.answerCbQuery()
        return ctx.wizard.back()
      }

      if (callbackData === 'reels_yes' || callbackData === 'reels_no') {
        console.log('🚨 [DEBUG] Reels selection callback detected:', {
          callbackData,
          currentIncludeReels: sessionData.includeReels,
        })

        // Защита от двойного вызова callback - УБИРАЕМ ЭТУ БЛОКИРОВКУ
        if (sessionData.includeReels !== undefined) {
          console.log(
            '🚨 [DEBUG] WARNING: includeReels already set, but proceeding anyway'
          )
        }

        const includeReels = callbackData === 'reels_yes'
        console.log('🚨 [DEBUG] Setting includeReels to:', includeReels)
        sessionData.includeReels = includeReels
        sessionData.maxReelsPerUser = sessionData.includeReels ? 5 : 0
        console.log(
          '🚨 [DEBUG] maxReelsPerUser set to:',
          sessionData.maxReelsPerUser
        )

        console.log('🚨 [DEBUG] Answering callback query...')
        await ctx.answerCbQuery()

        // Показываем финальное резюме
        console.log('🚨 [DEBUG] Creating summary text...')
        const summaryText = isRu
          ? `🎯 Запуск анализа конкурентов Instagram\n\n📁 Проект: ${
              sessionData.selectedProject!.name
            }\n👤 Username: @${sessionData.targetUsername}\n📊 Конкурентов: ${
              sessionData.maxCompetitors
            }\n🎬 Рилсы: ${
              sessionData.includeReels ? '✅ Да' : '❌ Нет'
            }\n\n⏳ Запускаем анализ...`
          : `🎯 Starting Instagram competitor analysis\n\n📁 Project: ${
              sessionData.selectedProject!.name
            }\n👤 Username: @${sessionData.targetUsername}\n📊 Competitors: ${
              sessionData.maxCompetitors
            }\n🎬 Reels: ${
              sessionData.includeReels ? '✅ Yes' : '❌ No'
            }\n\n⏳ Starting analysis...`

        console.log('🚨 [DEBUG] Editing message with summary...')
        try {
          await ctx.editMessageText(summaryText)
          console.log('🚨 [DEBUG] Summary message edited successfully!')
        } catch (error) {
          console.error('🚨 [ERROR] Failed to edit summary message:', error)

          // Fallback - send new message
          await ctx.reply(summaryText)
          console.log('🚨 [DEBUG] Fallback summary message sent!')
        }

        console.log(
          '🚨 [DEBUG] Starting Instagram scraping generation process...'
        )
        try {
          logger.info(
            'Instagram Scraping Wizard: Starting generation process',
            {
              userId: ctx.from?.id,
              sessionData,
            }
          )

          console.log('🚨 [DEBUG] Getting bot token and name...')
          const botToken = getBotToken(ctx)
          console.log('🚨 [DEBUG] Bot token retrieved:', {
            tokenExists: !!botToken,
            tokenLength: botToken?.length,
          })

          if (!botToken) {
            console.log('🚨 [DEBUG] ERROR: Bot token not found!')
            throw new Error('Bot token not found')
          }

          const { bot_name } = getBotNameByToken(botToken)
          console.log('🚨 [DEBUG] Bot name resolved:', { bot_name })
          logger.info('Instagram Scraping Wizard: Bot name resolved', {
            bot_name,
          })

          // Запускаем скрапинг через Inngest
          console.log(
            '🚨 [DEBUG] Calling generateInstagramScraping with params:',
            {
              targetUsername: sessionData.targetUsername,
              projectId: sessionData.projectId,
              maxCompetitors: sessionData.maxCompetitors,
              maxReelsPerUser: sessionData.maxReelsPerUser,
              includeReels: sessionData.includeReels,
              telegramId: ctx.from!.id.toString(),
              botName: bot_name,
            }
          )

          const result = await generateInstagramScraping(
            sessionData.targetUsername!,
            sessionData.projectId!,
            sessionData.maxCompetitors!, // Здесь используется правильное имя из сессии
            sessionData.maxReelsPerUser!,
            sessionData.includeReels!,
            ctx.from!.id.toString(),
            ctx,
            bot_name
          )

          console.log('🚨 [DEBUG] generateInstagramScraping result:', result)

          if (result.success) {
            console.log(
              '🚨 [DEBUG] SUCCESS! Sending success message to user...'
            )
            try {
              await ctx.reply(
                isRu
                  ? `🚀 Анализ конкурентов запущен успешно!\n\n📁 Проект: ${
                      sessionData.selectedProject!.name
                    }\n👤 Username: @${
                      sessionData.targetUsername
                    }\n📊 Конкурентов: ${
                      sessionData.maxCompetitors
                    }\n\n⏰ Время обработки: 5-15 минут\n📬 Мы уведомим вас, когда анализ будет готов!\n\n💡 Вы можете продолжить использовать бота`
                  : `🚀 Competitor analysis started successfully!\n\n📁 Project: ${
                      sessionData.selectedProject!.name
                    }\n👤 Username: @${
                      sessionData.targetUsername
                    }\n📊 Competitors: ${
                      sessionData.maxCompetitors
                    }\n\n⏰ Processing time: 5-15 minutes\n📬 We'll notify you when the analysis is ready!\n\n💡 You can continue using the bot`
              )
              console.log('🚨 [DEBUG] Success message sent successfully!')
            } catch (error) {
              console.error('🚨 [ERROR] Failed to send success message:', error)
            }

            console.log('🚨 [DEBUG] Logging success completion...')
            logger.info('✅ Instagram Scraping Wizard completed successfully', {
              userId: ctx.from?.id,
              project: sessionData.selectedProject!.name,
              username: sessionData.targetUsername,
            })
          } else {
            console.log('🚨 [DEBUG] FAILURE! Sending error message to user...')
            try {
              await ctx.reply(
                isRu
                  ? `❌ Ошибка при запуске анализа\n\n${result.message}`
                  : `❌ Error starting analysis\n\n${result.message}`
              )
              console.log('🚨 [DEBUG] Error message sent successfully!')
            } catch (error) {
              console.error('🚨 [ERROR] Failed to send error message:', error)
            }
          }
        } catch (error) {
          console.error('🚨 [ERROR] Exception in generation process:', error)
          logger.error('Instagram Scraping Wizard: Generation failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
            userId: ctx.from?.id,
            sessionData,
          })

          try {
            await ctx.reply(
              isRu
                ? '❌ Произошла ошибка при запуске анализа\n\nПожалуйста, попробуйте позже или обратитесь в поддержку.'
                : '❌ An error occurred while starting the analysis\n\nPlease try again later or contact support.'
            )
            console.log('🚨 [DEBUG] Exception error message sent successfully!')
          } catch (replyError) {
            console.error(
              '🚨 [ERROR] Failed to send exception error message:',
              replyError
            )
          }
        } finally {
          console.log('🚨 [DEBUG] Leaving Instagram scraping scene...')
          await ctx.scene.leave()
          console.log('🚨 [DEBUG] Scene left successfully!')
        }

        return
      }
    }

    // Handle help/cancel
    if (await handleHelpCancel(ctx)) {
      return
    }

    await ctx.reply(
      isRu
        ? '⚠️ Пожалуйста, выберите опцию для анализа рилсов.'
        : '⚠️ Please choose an option for reels analysis.'
    )
  }
)

// Добавляем обработчики help и cancel
instagramScrapingWizard.start(async ctx => {
  await ctx.scene.leave()
  const { showMainMenu } = await import('@/navigation')
  await showMainMenu(ctx)
})
instagramScrapingWizard.help(ctx => handleHelpCancel(ctx))
instagramScrapingWizard.command('cancel', ctx => handleHelpCancel(ctx))
