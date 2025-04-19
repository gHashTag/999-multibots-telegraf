/**
 * Интеграция с Telegram для автономного агента
 * Реализовано в функциональном стиле
 */

import { Telegraf, Context } from 'telegraf'
import { createAgent, AgentConfig } from '../agent/index.js'
import { TaskType, TaskStatus } from '../agent/state.js'
import { config } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { getLatestChangelogEntry, getNewChangelogEntries } from './utils.js'

// Загружаем переменные окружения
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '../../../')

config({ path: path.join(rootDir, '.env') })

// Типы для работы с Telegram
type TelegramTask = {
  userId: number
  messageId: number
}

// Состояние бота
type BotState = {
  agent: ReturnType<typeof createAgent>
  allowedUsers: number[]
  tasks: Map<string, TelegramTask>
  initialized: boolean
  config: {
    repositories?: { path: string; name: string }[]
  }
  notifications: {
    changelog: Map<number, boolean> // userId -> enabled
    lastCheckedChangelog: Date
  }
}

/**
 * Создать начальное состояние бота
 */
const createBotState = (): BotState => {
  // Если есть переменная окружения ALLOWED_USERS, парсим её
  const allowedUsersEnv = process.env.ALLOWED_USERS || ''
  const allowedUsers = allowedUsersEnv
    .split(',')
    .map(id => parseInt(id.trim()))
    .filter(id => !isNaN(id))

  // Создаем экземпляр агента
  const agentConfig: AgentConfig = {
    id: process.env.AGENT_ID || 'telegram-agent',
    maxConcurrentTasks: Number(process.env.MAX_CONCURRENT_TASKS || 3),
    mcpConfig: {
      serverUrl: process.env.MCP_SERVER_URL || 'ws://localhost:8888',
      apiKey: process.env.MCP_API_KEY || 'test-key',
    },
  }

  return {
    agent: createAgent(agentConfig),
    allowedUsers,
    tasks: new Map<string, TelegramTask>(),
    initialized: false,
    config: {
      repositories: process.env.REPOSITORIES
        ? process.env.REPOSITORIES.split(',').map(repo => ({
            path: repo.trim(),
            name: path.basename(repo.trim()),
          }))
        : undefined,
    },
    notifications: {
      changelog: new Map<number, boolean>(),
      lastCheckedChangelog: new Date(),
    },
  }
}

/**
 * Проверка, является ли пользователь разрешенным
 */
const isAllowedUser = (ctx: Context, state: BotState): boolean => {
  // Если список разрешенных пользователей пуст, разрешаем всем
  if (state.allowedUsers.length === 0) {
    return true
  }

  // Проверяем, есть ли пользователь в списке разрешенных
  const userId = ctx.from?.id
  return userId !== undefined && state.allowedUsers.includes(userId)
}

/**
 * Настройка обработчиков сообщений
 */
const setupHandlers = (bot: Telegraf<Context>, state: BotState): void => {
  // Обработка команды /start
  bot.start(async ctx => {
    if (!isAllowedUser(ctx, state)) {
      return ctx.reply('⛔ У вас нет доступа к этому боту.')
    }

    await ctx.reply(
      '👋 Привет! Я автономный агент-разработчик, который может помочь вам с различными задачами программирования.\n\n' +
        'Вот что я могу делать:\n' +
        '🔍 /analyze - Анализ кода\n' +
        '💻 /generate - Генерация кода\n' +
        '🔄 /refactor - Рефакторинг кода\n' +
        '🧪 /test - Генерация тестов\n' +
        '📝 /docs - Создание документации\n' +
        '📦 /deps - Управление зависимостями\n' +
        '🔧 /git - Операции с Git\n' +
        '🧠 /improve - Запрос на улучшение\n' +
        '🔄 /background - Запустить фоновое улучшение\n' +
        '📋 /check_tasks - Проверить статус фоновых задач\n\n' +
        'Также вы можете просто отправить мне сообщение с описанием задачи!'
    )
  })

  // Обработка команды /help
  bot.help(async ctx => {
    if (!isAllowedUser(ctx, state)) {
      return ctx.reply('⛔ У вас нет доступа к этому боту.')
    }

    await ctx.reply(
      '🤖 Автономный агент-разработчик\n\n' +
        'Инструкции по использованию:\n\n' +
        '1. Используйте команды для конкретных типов задач:\n' +
        '   🔍 /analyze - Анализ кода\n' +
        '   💻 /generate - Генерация кода\n' +
        '   🔄 /refactor - Рефакторинг кода\n' +
        '   🧪 /test - Генерация тестов\n' +
        '   📝 /docs - Создание документации\n' +
        '   📦 /deps - Управление зависимостями\n' +
        '   🔧 /git - Операции с Git\n' +
        '   🧠 /improve - Запрос на улучшение\n' +
        '   🔄 /background - Запустить фоновое улучшение\n' +
        '   📋 /check_tasks - Проверить статус фоновых задач\n' +
        '2. После выбора команды, отправьте сообщение с деталями задачи\n' +
        '3. Дождитесь выполнения задачи и получения результата\n\n' +
        '🤔 Если у вас есть вопросы или предложения, пожалуйста, сообщите об этом.'
    )
  })

  // Обработка команды /status
  bot.command('status', async ctx => {
    if (!isAllowedUser(ctx, state)) {
      return ctx.reply('⛔ У вас нет доступа к этому боту.')
    }

    await ctx.reply('🔄 Статус агента: активен')
    // TODO: Добавить вывод информации о текущих задачах и статистике
  })

  // Обработка команды /analyze (анализ кода)
  bot.command('analyze', async ctx => {
    if (!isAllowedUser(ctx, state)) {
      return ctx.reply('⛔ У вас нет доступа к этому боту.')
    }

    await ctx.reply('🔍 Отправьте код для анализа:')
  })

  // Обработка команды /generate (генерация кода)
  bot.command('generate', async ctx => {
    if (!isAllowedUser(ctx, state)) {
      return ctx.reply('⛔ У вас нет доступа к этому боту.')
    }

    await ctx.reply('💻 Опишите, какой код нужно сгенерировать:')
  })

  // Обработка команды /refactor (рефакторинг кода)
  bot.command('refactor', async ctx => {
    if (!isAllowedUser(ctx, state)) {
      return ctx.reply('⛔ У вас нет доступа к этому боту.')
    }

    await ctx.reply(
      '🔄 Отправьте код для рефакторинга и опишите, что нужно изменить:'
    )
  })

  // Обработка команды /improve (самосовершенствование)
  bot.command('improve', async ctx => {
    if (!isAllowedUser(ctx, state)) {
      return ctx.reply('⛔ У вас нет доступа к этому боту.')
    }

    await ctx.reply(
      '🧠 Опишите, чему мне нужно научиться или что улучшить в моей работе:'
    )
  })

  // Обработка команды /background (фоновое улучшение)
  bot.command('background', async ctx => {
    if (!isAllowedUser(ctx, state)) {
      return ctx.reply('⛔ У вас нет доступа к этому боту.')
    }

    await ctx.reply('🔄 Опишите задачу фонового улучшения:')
  })

  // Обработка команды /check_tasks (проверка статуса фоновых задач)
  bot.command('check_tasks', async ctx => {
    if (!isAllowedUser(ctx, state)) {
      return ctx.reply('⛔ У вас нет доступа к этому боту.')
    }

    if (!state.initialized) {
      return ctx.reply(
        '⚠️ Агент не инициализирован. Сначала запустите его, отправив какое-либо сообщение.'
      )
    }

    try {
      // Получаем все фоновые задачи
      const allTasks = state.agent.getAllTasks()
      const backgroundTasks = allTasks.filter(
        task => task.type === TaskType.BACKGROUND_IMPROVEMENT
      )

      if (backgroundTasks.length === 0) {
        await ctx.reply('📊 Нет активных фоновых задач.')
        return
      }

      let statusMessage = '📊 Статус фоновых задач:\n\n'

      for (const task of backgroundTasks) {
        statusMessage += `ID: ${task.id}\n`
        statusMessage += `Статус: ${task.status}\n`
        statusMessage += `Создана: ${task.created.toLocaleString()}\n`
        statusMessage += `Задача: ${task.description.substring(0, 50)}${
          task.description.length > 50 ? '...' : ''
        }\n`

        if (task.status === TaskStatus.COMPLETED && task.result) {
          const createdFiles = task.result.createdFiles || []
          if (createdFiles.length > 0) {
            statusMessage += `\nСозданные файлы:\n`
            createdFiles.forEach((file: string) => {
              statusMessage += `- ${file}\n`
            })
          }

          const updatedFiles = task.result.updatedFiles || []
          if (updatedFiles.length > 0) {
            statusMessage += `\nОбновленные файлы:\n`
            updatedFiles.forEach((file: string) => {
              statusMessage += `- ${file}\n`
            })
          }
        }

        statusMessage += '\n-----------------\n\n'
      }

      await ctx.reply(statusMessage)
    } catch (error) {
      console.error('Error checking tasks:', error)
      await ctx.reply(
        `❌ Ошибка при проверке задач: ${
          error instanceof Error ? error.message : 'Неизвестная ошибка'
        }`
      )
    }
  })

  // Обработка команды /scan_improvements (сканирование потенциальных улучшений)
  bot.command('scan_improvements', async ctx => {
    if (!isAllowedUser(ctx, state)) {
      return ctx.reply('⛔ У вас нет доступа к этому боту.')
    }

    if (!state.initialized) {
      return ctx.reply(
        '⚠️ Агент не инициализирован. Сначала запустите его, отправив какое-либо сообщение.'
      )
    }

    try {
      await ctx.reply(
        '🔍 Начинаю сканирование кодовой базы для поиска потенциальных улучшений...'
      )

      // Запускаем сканирование в отдельном потоке, чтобы не блокировать бота
      setTimeout(async () => {
        try {
          const scanResults = await state.agent.scanForImprovements('src', {
            saveResults: true,
            limit: 10,
          })

          const replyMessage = `✅ Сканирование завершено!\n\n📊 Статистика:\n- Проанализировано файлов: ${scanResults.total_files_analyzed}\n- Найдено предложений: ${scanResults.suggestions.length}\n\nИспользуйте /list_improvements для просмотра результатов.`

          if (scanResults.stats) {
            let statsMessage = '\n\n📈 Распределение по типам:'
            for (const type in scanResults.stats.by_type) {
              statsMessage += `\n- ${type}: ${scanResults.stats.by_type[type]}`
            }

            statsMessage += '\n\n🔢 Распределение по приоритету:'
            for (const priority in scanResults.stats.by_priority) {
              statsMessage += `\n- ${priority}: ${scanResults.stats.by_priority[priority]}`
            }

            await ctx.reply(replyMessage + statsMessage)
          } else {
            await ctx.reply(replyMessage)
          }
        } catch (error) {
          console.error('Error during improvement scanning:', error)
          await ctx.reply(
            `❌ Ошибка при сканировании: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        }
      }, 0)
    } catch (error) {
      console.error('Error handling scan_improvements command:', error)
      await ctx.reply('❌ Произошла ошибка при выполнении команды')
    }
  })

  // Обработка команды /scan_multi_repo для сканирования нескольких репозиториев
  bot.command('scan_multi_repo', async ctx => {
    if (!isAllowedUser(ctx, state)) {
      return ctx.reply('⛔ У вас нет доступа к этому боту.')
    }

    if (!state.initialized) {
      return ctx.reply(
        '⚠️ Агент не инициализирован. Сначала запустите его, отправив какое-либо сообщение.'
      )
    }

    // Получаем аргументы команды
    const args = ctx.message.text.split(' ').slice(1)

    if (args.length === 0) {
      // Если аргументы не указаны, выводим инструкцию
      return ctx.reply(
        '📋 Использование: /scan_multi_repo [опции]\n\n' +
          'Опции:\n' +
          '  repo1,repo2,...  - Список путей к репозиториям через запятую\n\n' +
          'Пример: /scan_multi_repo /path/to/repo1,/path/to/repo2\n\n' +
          'Примечание: Если репозитории не указаны, будет использован список из конфигурации бота.'
      )
    }

    try {
      await ctx.reply('🔄 Начинаю сканирование нескольких репозиториев...')

      // Запускаем сканирование в отдельном потоке
      setTimeout(async () => {
        try {
          // Парсим список репозиториев
          let repositories: { path: string; name: string }[] = []

          if (args[0]) {
            // Если указаны пути к репозиториям, используем их
            const repoPaths = args[0].split(',')
            repositories = repoPaths.map(repoPath => ({
              path: repoPath.trim(),
              name: path.basename(repoPath.trim()),
            }))
          } else {
            // Иначе используем репозитории из конфигурации
            repositories = state.config.repositories || [
              {
                path: process.cwd(),
                name: path.basename(process.cwd()),
              },
            ]
          }

          // Запускаем сканирование нескольких репозиториев
          const scanResults = await state.agent.scanMultipleRepositories(
            repositories,
            {
              limit: 20,
              aspectTypes: ['code_quality', 'performance', 'security'],
            }
          )

          let replyMessage =
            `✅ Сканирование нескольких репозиториев завершено!\n\n` +
            `📊 Статистика:\n` +
            `- Проанализировано репозиториев: ${
              scanResults.analyzed_repositories?.length || 0
            }\n` +
            `- Проанализировано файлов: ${scanResults.total_files_analyzed}\n` +
            `- Найдено предложений: ${scanResults.suggestions.length}\n\n`

          // Добавляем сводку по репозиториям
          if (
            scanResults.analyzed_repositories &&
            scanResults.analyzed_repositories.length > 0
          ) {
            replyMessage +=
              `📂 Репозитории:\n` +
              scanResults.analyzed_repositories
                .map(repo => `- ${repo}`)
                .join('\n') +
              '\n\n'
          }

          replyMessage += `Используйте /list_multi_improvements для просмотра результатов.`

          await ctx.reply(replyMessage)

          // Если найдены высокоприоритетные предложения, показываем их
          const highPriorityItems = scanResults.suggestions
            .filter(s => s.priority >= 8)
            .slice(0, 5)

          if (highPriorityItems.length > 0) {
            let priorityMessage = `🚨 Топ-${highPriorityItems.length} высокоприоритетных улучшений:\n\n`

            highPriorityItems.forEach((item, index) => {
              priorityMessage +=
                `${index + 1}. [${item.id}] ${item.title}\n` +
                `   📂 Репозиторий: ${item.repository || 'Неизвестно'}\n` +
                `   🔍 Тип: ${item.type}\n` +
                `   ⭐ Приоритет: ${item.priority}/10\n` +
                `   🔧 Сложность: ${item.estimate_complexity}\n\n`
            })

            await ctx.reply(priorityMessage)
          }
        } catch (error) {
          console.error('Error during multi-repo scanning:', error)
          await ctx.reply(
            `❌ Ошибка при сканировании: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        }
      }, 0)
    } catch (error) {
      console.error('Error handling scan_multi_repo command:', error)
      await ctx.reply('❌ Произошла ошибка при выполнении команды')
    }
  })

  // Обработка команды /improvement_details [id] (получение деталей улучшения)
  bot.command('improvement_details', async ctx => {
    if (!isAllowedUser(ctx, state)) {
      return ctx.reply('⛔ У вас нет доступа к этому боту.')
    }

    if (!state.initialized) {
      return ctx.reply(
        '⚠️ Агент не инициализирован. Сначала запустите его, отправив какое-либо сообщение.'
      )
    }

    // Получаем аргументы команды
    const args = ctx.message.text.split(' ').slice(1)
    const improvementId = args[0]

    if (!improvementId) {
      return ctx.reply(
        '⚠️ Необходимо указать ID улучшения. Например: /improvement_details imp_123456'
      )
    }

    try {
      // Получаем детали улучшения
      const improvement = await state.agent.getImprovementDetails(improvementId)

      if (!improvement) {
        return ctx.reply(`⚠️ Улучшение с ID "${improvementId}" не найдено.`)
      }

      // Формируем детальное сообщение об улучшении
      let detailsMessage =
        `📝 Детали улучшения [${improvement.id}]\n\n` +
        `Название: ${improvement.title}\n` +
        `Тип: ${improvement.type}\n` +
        `Приоритет: ${improvement.priority}/10\n` +
        `Сложность: ${improvement.estimate_complexity}\n`

      if (improvement.repository) {
        detailsMessage += `Репозиторий: ${improvement.repository}\n`
      }

      if (improvement.tags && improvement.tags.length > 0) {
        detailsMessage += `Теги: ${improvement.tags.join(', ')}\n`
      }

      if (improvement.confidence_score !== undefined) {
        detailsMessage += `Уверенность: ${(
          improvement.confidence_score * 100
        ).toFixed(1)}%\n`
      }

      if (improvement.potential_impact) {
        detailsMessage += `Потенциальное влияние: ${improvement.potential_impact}\n`
      }

      if (improvement.estimated_effort_hours !== undefined) {
        detailsMessage += `Оценка трудозатрат: ${improvement.estimated_effort_hours} ч.\n`
      }

      detailsMessage +=
        `\nОписание:\n${improvement.description}\n\n` +
        `Затронутые файлы:\n${improvement.affected_files
          .map(file => `- ${file}`)
          .join('\n')}\n\n` +
        `Рекомендуемое действие:\n${improvement.suggested_action}\n\n` +
        `Обнаружено: ${improvement.detected_at.toLocaleString()}\n`

      if (improvement.is_implemented) {
        detailsMessage += `\n✅ Статус: РЕАЛИЗОВАНО`
      } else {
        detailsMessage += `\n⏳ Статус: ОЖИДАЕТ РЕАЛИЗАЦИИ`
      }

      await ctx.reply(detailsMessage)

      // Предлагаем применить улучшение
      if (!improvement.is_implemented) {
        await ctx.reply(
          `Хотите применить это улучшение?\n` +
            `Используйте команду: /apply_improvement ${improvement.id}`
        )
      }
    } catch (error) {
      console.error('Error getting improvement details:', error)
      await ctx.reply(
        `❌ Ошибка при получении деталей: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  })

  // Обработка команды /apply_improvement [id] (применение улучшения)
  bot.command('apply_improvement', async ctx => {
    if (!isAllowedUser(ctx, state)) {
      return ctx.reply('⛔ У вас нет доступа к этому боту.')
    }

    if (!state.initialized) {
      return ctx.reply(
        '⚠️ Агент не инициализирован. Сначала запустите его, отправив какое-либо сообщение.'
      )
    }

    // Получаем аргументы команды
    const args = ctx.message.text.split(' ').slice(1)
    const improvementId = args[0]

    if (!improvementId) {
      return ctx.reply(
        '⚠️ Необходимо указать ID улучшения. Например: /apply_improvement imp_123456'
      )
    }

    try {
      await ctx.reply(`🔧 Начинаю применение улучшения ${improvementId}...`)

      // Применяем улучшение
      const taskId = await state.agent.applyImprovement(improvementId, {
        feedbackRequired: true,
        notifyOnCompletion: true,
      })

      await ctx.reply(
        `✅ Задача по применению улучшения создана!\n` +
          `ID задачи: ${taskId}\n\n` +
          `Используйте /check_tasks для проверки статуса.`
      )
    } catch (error) {
      console.error('Error applying improvement:', error)
      await ctx.reply(
        `❌ Ошибка при применении улучшения: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  })

  // Обработка команды /rate_improvement [id] [score 1-5] [feedback] (оценка улучшения для обучения системы)
  bot.command('rate_improvement', async ctx => {
    if (!isAllowedUser(ctx, state)) {
      return ctx.reply('⛔ У вас нет доступа к этому боту.')
    }

    if (!state.initialized) {
      return ctx.reply(
        '⚠️ Агент не инициализирован. Сначала запустите его, отправив какое-либо сообщение.'
      )
    }

    // Получаем аргументы команды
    const args = ctx.message.text.split(' ').slice(1)
    const improvementId = args[0]
    const scoreStr = args[1]
    const feedback = args.slice(2).join(' ')

    if (!improvementId || !scoreStr) {
      return ctx.reply(
        '⚠️ Необходимо указать ID улучшения и оценку (1-5).\n' +
          'Использование: /rate_improvement [id] [оценка 1-5] [отзыв]\n' +
          'Например: /rate_improvement imp_123456 4 Хорошее улучшение, но требует доработки'
      )
    }

    const score = parseInt(scoreStr)
    if (isNaN(score) || score < 1 || score > 5) {
      return ctx.reply('⚠️ Оценка должна быть числом от 1 до 5.')
    }

    try {
      await ctx.reply(`📊 Сохраняю оценку для улучшения ${improvementId}...`)

      // Сохраняем оценку и обратную связь
      await state.agent.rateImprovement(improvementId, score, feedback)

      await ctx.reply(
        `✅ Оценка сохранена!\n\n` +
          `ID улучшения: ${improvementId}\n` +
          `Оценка: ${'⭐'.repeat(score)}\n` +
          `Отзыв: ${feedback || 'Не указан'}\n\n` +
          `Спасибо за обратную связь! Эта информация поможет улучшить качество предложений.`
      )
    } catch (error) {
      console.error('Error rating improvement:', error)
      await ctx.reply(
        `❌ Ошибка при сохранении оценки: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  })

  // Обработка команды /enable_periodic_scan [интервал в минутах] (включение периодического сканирования)
  bot.command('enable_periodic_scan', async ctx => {
    if (!isAllowedUser(ctx, state)) {
      return ctx.reply('⛔ У вас нет доступа к этому боту.')
    }

    if (!state.initialized) {
      return ctx.reply(
        '⚠️ Агент не инициализирован. Сначала запустите его, отправив какое-либо сообщение.'
      )
    }

    // Получаем аргументы команды
    const args = ctx.message.text.split(' ').slice(1)
    const intervalStr = args[0]

    let interval = 60 // По умолчанию 60 минут

    if (intervalStr) {
      const parsedInterval = parseInt(intervalStr)
      if (!isNaN(parsedInterval) && parsedInterval >= 1) {
        interval = parsedInterval
      } else {
        return ctx.reply('⚠️ Интервал должен быть числом (минуты) не менее 1.')
      }
    }

    try {
      // Включаем периодическое сканирование
      state.agent.startPeriodicScanning(interval)

      await ctx.reply(
        `✅ Периодическое сканирование включено!\n\n` +
          `Интервал: ${interval} минут\n\n` +
          `Система будет автоматически сканировать кодовую базу каждые ${interval} минут и отправлять уведомления о найденных высокоприоритетных улучшениях.\n\n` +
          `Для отключения используйте команду /disable_periodic_scan`
      )
    } catch (error) {
      console.error('Error enabling periodic scanning:', error)
      await ctx.reply(
        `❌ Ошибка при включении периодического сканирования: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  })

  // Обработка команды /disable_periodic_scan (отключение периодического сканирования)
  bot.command('disable_periodic_scan', async ctx => {
    if (!isAllowedUser(ctx, state)) {
      return ctx.reply('⛔ У вас нет доступа к этому боту.')
    }

    if (!state.initialized) {
      return ctx.reply(
        '⚠️ Агент не инициализирован. Сначала запустите его, отправив какое-либо сообщение.'
      )
    }

    try {
      // Отключаем периодическое сканирование
      state.agent.stopPeriodicScanning()

      await ctx.reply('✅ Периодическое сканирование отключено.')
    } catch (error) {
      console.error('Error disabling periodic scanning:', error)
      await ctx.reply(
        `❌ Ошибка при отключении периодического сканирования: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  })

  // Обработка команды /improvement_report (генерация отчета по улучшениям)
  bot.command('improvement_report', async ctx => {
    if (!isAllowedUser(ctx, state)) {
      return ctx.reply('⛔ У вас нет доступа к этому боту.')
    }

    if (!state.initialized) {
      return ctx.reply(
        '⚠️ Агент не инициализирован. Сначала запустите его, отправив какое-либо сообщение.'
      )
    }

    try {
      await ctx.reply('📊 Генерирую отчет по улучшениям...')

      // Генерируем отчет
      const report = await state.agent.generateImprovementReport()

      if (!report) {
        return ctx.reply(
          '⚠️ Не удалось сгенерировать отчет. Возможно, нет данных по улучшениям.'
        )
      }

      // Отправляем отчет пользователю
      await ctx.reply(report.summary)

      // Если есть полный отчет, отправляем его как файл
      if (report.fullReportPath) {
        await ctx.replyWithDocument({
          source: report.fullReportPath,
          filename: 'improvement_report.md',
        })
      }
    } catch (error) {
      console.error('Error generating improvement report:', error)
      await ctx.reply(
        `❌ Ошибка при генерации отчета: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  })

  // Обработка команды /subscribe_changelog (подписка на уведомления из CG Log)
  bot.command('subscribe_changelog', async ctx => {
    if (!isAllowedUser(ctx, state)) {
      return ctx.reply('⛔ У вас нет доступа к этому боту.')
    }

    if (!state.initialized) {
      return ctx.reply(
        '⚠️ Агент не инициализирован. Сначала запустите его, отправив какое-либо сообщение.'
      )
    }

    try {
      const userId = ctx.from.id
      state.notifications.changelog.set(userId, true)

      await ctx.reply(
        '✅ Вы успешно подписались на уведомления из CG Log!\n\n' +
          'Вы будете получать уведомления при каждом новом изменении в журнале самосовершенствования агента.\n\n' +
          'Для отмены подписки используйте команду /unsubscribe_changelog'
      )

      // Отправляем последнюю запись для подтверждения
      const lastEntry = await getLatestChangelogEntry()
      if (lastEntry) {
        await ctx.reply('📝 Последняя запись в CG Log:\n\n' + lastEntry)
      }
    } catch (error) {
      console.error('Error subscribing to changelog:', error)
      await ctx.reply('❌ Произошла ошибка при подписке на уведомления')
    }
  })

  // Обработка команды /unsubscribe_changelog (отписка от уведомлений из CG Log)
  bot.command('unsubscribe_changelog', async ctx => {
    if (!isAllowedUser(ctx, state)) {
      return ctx.reply('⛔ У вас нет доступа к этому боту.')
    }

    if (!state.initialized) {
      return ctx.reply(
        '⚠️ Агент не инициализирован. Сначала запустите его, отправив какое-либо сообщение.'
      )
    }

    try {
      const userId = ctx.from.id
      state.notifications.changelog.set(userId, false)

      await ctx.reply(
        '✅ Вы успешно отписались от уведомлений из CG Log.\n\n' +
          'Вы больше не будете получать уведомления при изменениях в журнале самосовершенствования.\n\n' +
          'Для возобновления подписки используйте команду /subscribe_changelog'
      )
    } catch (error) {
      console.error('Error unsubscribing from changelog:', error)
      await ctx.reply('❌ Произошла ошибка при отписке от уведомлений')
    }
  })

  // Обработка команды /get_last_changelog (получение последней записи из CG Log)
  bot.command('get_last_changelog', async ctx => {
    if (!isAllowedUser(ctx, state)) {
      return ctx.reply('⛔ У вас нет доступа к этому боту.')
    }

    if (!state.initialized) {
      return ctx.reply(
        '⚠️ Агент не инициализирован. Сначала запустите его, отправив какое-либо сообщение.'
      )
    }

    try {
      await ctx.reply('🔍 Получаю последнюю запись из CG Log...')

      const lastEntry = await getLatestChangelogEntry()
      if (lastEntry) {
        await ctx.reply('📝 Последняя запись в CG Log:\n\n' + lastEntry)
      } else {
        await ctx.reply(
          '⚠️ Не удалось найти записи в CG Log. Возможно, файл пуст или не существует.'
        )
      }
    } catch (error) {
      console.error('Error getting latest changelog entry:', error)
      await ctx.reply(
        '❌ Произошла ошибка при получении последней записи из CG Log'
      )
    }
  })

  // Обработка обычных текстовых сообщений
  bot.on('text', async ctx => {
    if (!isAllowedUser(ctx, state)) {
      return ctx.reply('⛔ У вас нет доступа к этому боту.')
    }

    if ('text' in ctx.message) {
      const text = ctx.message.text

      try {
        // Отправляем сообщение о начале обработки
        const statusMessage = await ctx.reply('🤔 Обрабатываю ваш запрос...')

        // Ключевые слова для распознавания различных типов запросов
        const selfImprovementKeywords = [
          'научись',
          'улучши себя',
          'стань лучше',
          'совершенствуйся',
          'развивайся',
          'обучись',
          'изучи',
          'добавь функцию',
          'обнови',
          'оптимизируй',
          'улучши свой код',
        ]

        const backgroundKeywords = [
          'фоновый',
          'фоном',
          'заднем плане',
          'фоновом',
          'фоновое',
          'автоматическое улучшение',
        ]

        const isSelfImprovement = selfImprovementKeywords.some(keyword =>
          text.toLowerCase().includes(keyword.toLowerCase())
        )

        const isBackground = backgroundKeywords.some(keyword =>
          text.toLowerCase().includes(keyword.toLowerCase())
        )

        // Определяем тип задачи (для демонстрации используем CODE_GENERATION)
        let taskType = TaskType.CODE_GENERATION

        // Инициализируем агента при необходимости
        if (!state.initialized) {
          await ctx.reply('🚀 Инициализация агента...')
          await state.agent.initialize()
          state.initialized = true
        }

        if (isBackground) {
          try {
            await ctx.reply(
              '🔄 Понял, вы хотите запустить фоновую задачу улучшения. Начинаю работу...'
            )

            if (!state.initialized) {
              await ctx.reply('🚀 Инициализация агента...')
              await state.agent.initialize()
              state.initialized = true
            }

            const backgroundTask = await state.agent.startBackgroundImprovement(
              text,
              ctx.from.id.toString()
            )

            await ctx.reply(
              `🔄 Запущена фоновая задача самосовершенствования (ID: ${backgroundTask.taskId})\n\n` +
                `Я буду работать над этим в фоновом режиме и сообщу о результатах. ` +
                `Вы можете проверить статус, используя команду /check_tasks.`
            )

            // Добавляем задачу в состояние бота для отслеживания
            state.tasks.set(backgroundTask.taskId, {
              userId: ctx.from.id,
              messageId: ctx.message.message_id,
            })
          } catch (error) {
            console.error('Error starting background improvement:', error)
            await ctx.reply(
              `❌ Ошибка при запуске фонового самосовершенствования: ${
                error instanceof Error ? error.message : 'Неизвестная ошибка'
              }`
            )
          }
          return
        } else if (isSelfImprovement) {
          // Если это запрос на самосовершенствование, но не фоновый, обрабатываем как обычную задачу
          await ctx.reply(
            '🧠 Понял, вы хотите, чтобы я улучшил свои возможности. Работаю над этим...'
          )
          taskType = TaskType.SELF_IMPROVEMENT
        }

        // Добавляем задачу
        const task = await state.agent.addTask(taskType, text, {
          priority: 1,
          metadata: {
            telegramUser: ctx.from?.id,
            messageId: ctx.message.message_id,
          },
        })

        // Сохраняем информацию о задаче
        if (ctx.from) {
          state.tasks.set(task.id, {
            userId: ctx.from.id,
            messageId: statusMessage.message_id,
          })
        }

        // В реальном приложении здесь должен быть механизм ожидания завершения задачи
        // Для демонстрации мы просто ждем некоторое время
        await new Promise(resolve => setTimeout(resolve, 3000))

        // Отправляем результат (демо-версия)
        if (ctx.chat?.id) {
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            statusMessage.message_id,
            undefined,
            `✅ Задача выполнена!\n\nВаш запрос: "${text}"\n\nРезультат: В настоящее время я работаю в демо-режиме. В полной версии здесь будет результат выполнения вашей задачи.`
          )
        }
      } catch (error: unknown) {
        console.error('Error processing message:', error)
        const errorMessage =
          error instanceof Error ? error.message : 'Неизвестная ошибка'
        await ctx.reply(`❌ Произошла ошибка: ${errorMessage}`)
      }
    }
  })

  // Обработка ошибок
  bot.catch((err: unknown, ctx: Context) => {
    console.error(`Error for ${ctx.updateType}:`, err)
    ctx.reply(
      '❌ Ой! Произошла ошибка при обработке вашего запроса. Пожалуйста, попробуйте позже.'
    )
  })

  // Функция для периодической проверки завершенных задач
  const checkCompletedTasks = async () => {
    if (!state.initialized) {
      return
    }

    try {
      // Получаем все фоновые задачи
      const allTasks = state.agent.getAllTasks()
      const backgroundTasks = allTasks.filter(
        task =>
          task.type === TaskType.BACKGROUND_IMPROVEMENT &&
          task.status === TaskStatus.COMPLETED &&
          !task.metadata.notificationSent // Флаг для отслеживания отправленных уведомлений
      )

      for (const task of backgroundTasks) {
        // Получаем информацию о задаче из состояния бота
        const taskInfo = state.tasks.get(task.id)

        if (taskInfo && taskInfo.userId) {
          try {
            // Отправляем уведомление пользователю
            await bot.telegram.sendMessage(
              taskInfo.userId,
              `✅ Фоновая задача завершена!\n\n` +
                `Задача: ${task.description}\n\n` +
                `Результаты:\n${JSON.stringify(task.result, null, 2)}`
            )

            // Отправляем уведомление администраторам, если это не сам администратор
            const adminUsers = process.env.ADMIN_USERS
              ? process.env.ADMIN_USERS.split(',').map(id => Number(id))
              : []

            if (
              process.env.ADMIN_NOTIFICATION_ENABLED === 'true' &&
              adminUsers.length > 0 &&
              !adminUsers.includes(taskInfo.userId)
            ) {
              for (const adminId of adminUsers) {
                await bot.telegram.sendMessage(
                  adminId,
                  `🔔 Уведомление администратора:\n\n` +
                    `Пользователь ID: ${taskInfo.userId}\n` +
                    `Завершена фоновая задача: ${task.description}\n\n` +
                    `Результаты:\n${JSON.stringify(task.result, null, 2)}`
                )
              }
            }

            // Помечаем задачу как уведомленную
            task.metadata.notificationSent = true
          } catch (error) {
            console.error(
              `Error sending notification for task ${task.id}:`,
              error
            )
          }
        }
      }

      // Очистка старых завершенных задач (старше 24 часов)
      const oneDayAgo = new Date()
      oneDayAgo.setDate(oneDayAgo.getDate() - 1)

      const oldTasks = allTasks.filter(
        task => task.status === TaskStatus.COMPLETED && task.updated < oneDayAgo
      )

      for (const task of oldTasks) {
        // Удаляем информацию о задаче из состояния бота
        state.tasks.delete(task.id)
        console.log(`Cleaned up old task: ${task.id}`)
      }
    } catch (error) {
      console.error('Error checking completed tasks:', error)
    }
  }

  // Запускаем периодическую проверку каждые 30 секунд
  const taskCheckInterval = setInterval(checkCompletedTasks, 30000)

  // Останавливаем интервал при остановке бота
  bot.telegram.getMe().then(() => {
    console.log('Task completion check started')

    // Очищаем интервал при выключении бота
    process.once('SIGINT', () => {
      clearInterval(taskCheckInterval)
      console.log('Task completion check stopped')
    })

    process.once('SIGTERM', () => {
      clearInterval(taskCheckInterval)
      console.log('Task completion check stopped')
    })
  })

  // Настраиваем периодическую проверку CG Log на наличие новых записей
  const startChangelogMonitoring = () => {
    // Проверяем каждые 5 минут
    const MONITORING_INTERVAL = 5 * 60 * 1000

    console.log('📝 Запуск мониторинга CG Log...')

    const checkForChangelogUpdates = async () => {
      try {
        // Получаем новые записи из CG Log
        const newEntries = await getNewChangelogEntries(
          state.notifications.lastCheckedChangelog
        )

        if (newEntries.length > 0) {
          console.log(
            `📝 Обнаружено ${newEntries.length} новых записей в CG Log`
          )

          // Обновляем время последней проверки
          state.notifications.lastCheckedChangelog = new Date()

          // Отправляем уведомления подписчикам
          const subscribedUsers = [...state.notifications.changelog.entries()]
            .filter(([_, enabled]) => enabled)
            .map(([userId, _]) => userId)

          if (subscribedUsers.length > 0) {
            for (const entry of newEntries) {
              // Формируем сообщение с записью
              const message = `📝 *Новая запись в CG Log:*\n\n${entry}`

              // Отправляем каждому подписчику
              for (const userId of subscribedUsers) {
                try {
                  await bot.telegram.sendMessage(userId, message, {
                    parse_mode: 'Markdown',
                  })
                  // Небольшая задержка между сообщениями
                  await new Promise(resolve => setTimeout(resolve, 500))
                } catch (sendError) {
                  console.error(
                    `Error sending changelog notification to user ${userId}:`,
                    sendError
                  )
                }
              }
            }
          }
        }
      } catch (error) {
        console.error('Error monitoring changelog:', error)
      }
    }

    // Проверяем изменения периодически
    setInterval(checkForChangelogUpdates, MONITORING_INTERVAL)

    // И один раз сразу после запуска
    checkForChangelogUpdates()
  }

  // Запускаем мониторинг при инициализации бота
  if (state.initialized) {
    startChangelogMonitoring()
  } else {
    // Заменяем bot.once на стандартный обработчик с флагом первого запуска
    let monitoringStarted = false
    bot.on('text', () => {
      if (state.initialized && !monitoringStarted) {
        monitoringStarted = true
        startChangelogMonitoring()
      }
    })
  }
}

/**
 * Запуск бота
 */
const startBot = async (token: string): Promise<void> => {
  try {
    const bot = new Telegraf(token)
    const state = createBotState()

    // Настраиваем обработчики
    setupHandlers(bot, state)

    // Инициализируем агента
    await state.agent.initialize()
    state.initialized = true
    console.log('✅ Агент успешно инициализирован')

    // Устанавливаем команды бота для отображения в меню
    await bot.telegram.setMyCommands([
      { command: 'start', description: 'Начать диалог' },
      { command: 'help', description: 'Получить помощь' },
      { command: 'analyze', description: 'Анализ кода' },
      { command: 'generate', description: 'Генерация кода' },
      { command: 'refactor', description: 'Рефакторинг кода' },
      { command: 'test', description: 'Генерация тестов' },
      { command: 'docs', description: 'Создание документации' },
      { command: 'deps', description: 'Управление зависимостями' },
      { command: 'git', description: 'Операции с Git' },
      { command: 'improve', description: 'Запрос на улучшение' },
      { command: 'background', description: 'Запустить фоновое улучшение' },
      { command: 'check_tasks', description: 'Проверить статус фоновых задач' },
      { command: 'scan_improvements', description: 'Сканировать улучшения' },
      { command: 'list_improvements', description: 'Список улучшений' },
      { command: 'improvement_report', description: 'Отчет по улучшениям' },
    ])
    console.log('✅ Команды бота установлены')

    // Запускаем бота
    await bot.launch()
    console.log('🚀 Telegram бот запущен')

    // Обработка остановки
    const stopBot = async (): Promise<void> => {
      try {
        // Останавливаем бота
        bot.stop()
        console.log('🛑 Telegram бот остановлен')

        // Останавливаем агента
        await state.agent.shutdown()
        console.log('✅ Агент успешно завершил работу')
      } catch (error: unknown) {
        console.error('❌ Ошибка остановки:', error)
      }
    }

    process.once('SIGINT', stopBot)
    process.once('SIGTERM', stopBot)
  } catch (error: unknown) {
    console.error('❌ Ошибка запуска:', error)
    throw error
  }
}

/**
 * Основная функция
 */
const main = async (): Promise<void> => {
  try {
    // Получаем токен бота из переменных окружения
    const token = process.env.TELEGRAM_BOT_TOKEN

    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN не указан в .env файле')
    }

    await startBot(token)
  } catch (error: unknown) {
    console.error('❌ Критическая ошибка:', error)
    process.exit(1)
  }
}

// Запускаем бота
main()
