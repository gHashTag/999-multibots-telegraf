import { MyContext } from '@/interfaces'
import { dartAIService } from '@/services/dart-ai.service'
import { logger } from '@/utils/logger'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import {
  validateCreateDartAITask,
  validateUpdateDartAITask,
  DartAITaskStatus,
  DartAITaskPriority,
  CreateDartAITaskRequest,
  UpdateDartAITaskRequest,
} from '@/interfaces/dart-ai.interface'

/**
 * Команда для работы с Dart AI задачами: /dartai <action> [params]
 *
 * Доступные действия:
 * - spaces - показать список пространств
 * - tasks [space_id] - показать задачи в пространстве
 * - create <title> [description] - создать задачу
 * - get <task_id> - получить задачу
 * - update <task_id> <field> <value> - обновить задачу
 * - delete <task_id> - удалить задачу
 * - status <task_id> <status> - изменить статус
 * - priority <task_id> <priority> - изменить приоритет
 * - sync - синхронизировать с внешними системами
 * - stats - показать статистику
 */
export async function handleDartAICommand(ctx: MyContext) {
  const isRu = isRussianFromState(ctx)

  // Проверяем, настроен ли Dart AI сервис
  if (!dartAIService.isConfigured()) {
    await ctx.reply(
      isRu
        ? '❌ Dart AI не настроен. Требуется переменная окружения DART_AI_API_KEY'
        : '❌ Dart AI is not configured. DART_AI_API_KEY environment variable is required'
    )
    return
  }

  const message = ctx.message
  if (!message || !('text' in message)) {
    await ctx.reply(
      isRu ? '❌ Неверный формат команды' : '❌ Invalid command format'
    )
    return
  }

  const parts = message.text.split(' ')
  if (parts.length < 2) {
    await showDartAIHelp(ctx, isRu)
    return
  }

  const action = parts[1].toLowerCase()

  try {
    switch (action) {
      case 'spaces':
        await handleSpacesCommand(ctx, isRu)
        break
      case 'tasks':
        await handleTasksCommand(ctx, parts.slice(2), isRu)
        break
      case 'create':
        await handleCreateTaskCommand(ctx, parts.slice(2), isRu)
        break
      case 'get':
        await handleGetTaskCommand(ctx, parts.slice(2), isRu)
        break
      case 'update':
        await showDartAIHelp(ctx, isRu) // Пока не реализовано
        break
      case 'delete':
        await handleDeleteTaskCommand(ctx, parts.slice(2), isRu)
        break
      case 'status':
        await handleStatusCommand(ctx, parts.slice(2), isRu)
        break
      case 'priority':
        await handlePriorityCommand(ctx, parts.slice(2), isRu)
        break
      case 'sync':
        await handleSyncCommand(ctx, parts.slice(2), isRu)
        break
      case 'stats':
        await handleStatsCommand(ctx, isRu)
        break
      default:
        await showDartAIHelp(ctx, isRu)
    }
  } catch (error) {
    logger.error('❌ [Dart AI Admin] Command error:', error)
    await ctx.reply(
      isRu
        ? `❌ Ошибка выполнения команды: ${
            error instanceof Error ? error.message : 'Неизвестная ошибка'
          }`
        : `❌ Command execution error: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
    )
  }
}

/**
 * Показывает помощь по командам Dart AI
 */
async function showDartAIHelp(ctx: MyContext, isRu: boolean) {
  const helpText = isRu
    ? `
🎯 **Dart AI Task Manager**

**Доступные команды:**
• \`/dartai spaces\` - список пространств
• \`/dartai tasks [space_id]\` - список задач
• \`/dartai create <title> [description]\` - создать задачу
• \`/dartai get <task_id>\` - получить задачу
• \`/dartai update <task_id> <field> <value>\` - обновить задачу
• \`/dartai delete <task_id>\` - удалить задачу
• \`/dartai status <task_id> <status>\` - изменить статус
• \`/dartai priority <task_id> <priority>\` - изменить приоритет
• \`/dartai sync\` - синхронизация
• \`/dartai stats\` - статистика

**Примеры:**
\`/dartai create "Новая задача" "Описание задачи"\`
\`/dartai status abc123 done\`
\`/dartai priority abc123 high\`

**Статусы:** todo, in_progress, done, cancelled
**Приоритеты:** low, medium, high, critical
`
    : `
🎯 **Dart AI Task Manager**

**Available commands:**
• \`/dartai spaces\` - list spaces
• \`/dartai tasks [space_id]\` - list tasks
• \`/dartai create <title> [description]\` - create task
• \`/dartai get <task_id>\` - get task
• \`/dartai update <task_id> <field> <value>\` - update task
• \`/dartai delete <task_id>\` - delete task
• \`/dartai status <task_id> <status>\` - change status
• \`/dartai priority <task_id> <priority>\` - change priority
• \`/dartai sync\` - synchronization
• \`/dartai stats\` - statistics

**Examples:**
\`/dartai create "New task" "Task description"\`
\`/dartai status abc123 done\`
\`/dartai priority abc123 high\`

**Statuses:** todo, in_progress, done, cancelled
**Priorities:** low, medium, high, critical
`

  await ctx.reply(helpText, { parse_mode: 'Markdown' })
}

/**
 * Обрабатывает команду spaces
 */
async function handleSpacesCommand(ctx: MyContext, isRu: boolean) {
  await ctx.reply(
    isRu ? '⏳ Загружаю список пространств...' : '⏳ Loading spaces...'
  )

  const spaces = await dartAIService.getSpaces()

  if (spaces.length === 0) {
    await ctx.reply(isRu ? '📭 Пространства не найдены' : '📭 No spaces found')
    return
  }

  const spacesList = spaces
    .map(
      space =>
        `• **${space.name}** (${space.id})${
          space.description ? `\n  ${space.description}` : ''
        }`
    )
    .join('\n')

  await ctx.reply(
    isRu
      ? `🏢 **Пространства (${spaces.length}):**\n\n${spacesList}`
      : `🏢 **Spaces (${spaces.length}):**\n\n${spacesList}`,
    { parse_mode: 'Markdown' }
  )
}

/**
 * Обрабатывает команду tasks
 */
async function handleTasksCommand(
  ctx: MyContext,
  args: string[],
  isRu: boolean
) {
  const spaceId = args[0] || 'default'

  await ctx.reply(isRu ? '⏳ Загружаю задачи...' : '⏳ Loading tasks...')

  const tasks = await dartAIService.getTasks(spaceId)

  if (tasks.length === 0) {
    await ctx.reply(isRu ? '📭 Задачи не найдены' : '📭 No tasks found')
    return
  }

  // Группируем задачи по статусу
  const tasksByStatus = tasks.reduce((acc, task) => {
    if (!acc[task.status]) acc[task.status] = []
    acc[task.status].push(task)
    return acc
  }, {} as Record<string, typeof tasks>)

  let response = isRu
    ? `📋 **Задачи в пространстве "${spaceId}" (${tasks.length}):**\n\n`
    : `📋 **Tasks in space "${spaceId}" (${tasks.length}):**\n\n`

  // Показываем задачи по статусам
  for (const [status, statusTasks] of Object.entries(tasksByStatus)) {
    const statusEmoji = getStatusEmoji(status as DartAITaskStatus)
    const statusName = isRu
      ? getStatusNameRu(status as DartAITaskStatus)
      : status

    response += `${statusEmoji} **${statusName}** (${statusTasks.length}):\n`

    statusTasks.slice(0, 5).forEach(task => {
      const priorityEmoji = getPriorityEmoji(task.priority)
      response += `  ${priorityEmoji} \`${task.id.slice(0, 8)}\` ${
        task.title
      }\n`
    })

    if (statusTasks.length > 5) {
      response += `  ... и еще ${statusTasks.length - 5} задач\n`
    }

    response += '\n'
  }

  // Обрезаем сообщение, если оно слишком длинное
  if (response.length > 4000) {
    response = response.slice(0, 3900) + '\n\n... (сообщение обрезано)'
  }

  await ctx.reply(response, { parse_mode: 'Markdown' })
}

/**
 * Обрабатывает команду create
 */
async function handleCreateTaskCommand(
  ctx: MyContext,
  args: string[],
  isRu: boolean
) {
  if (args.length === 0) {
    await ctx.reply(
      isRu
        ? '❌ Укажите название задачи: `/dartai create "Название" ["Описание"]`'
        : '❌ Specify task title: `/dartai create "Title" ["Description"]`',
      { parse_mode: 'Markdown' }
    )
    return
  }

  const title = args[0]
  const description = args.slice(1).join(' ') || ''

  try {
    const taskData: CreateDartAITaskRequest = validateCreateDartAITask({
      title,
      description,
      status: 'todo',
      priority: 'medium',
      metadata: {
        created_by: 'telegram_bot',
        telegram_user: ctx.from?.id,
        telegram_username: ctx.from?.username,
      },
    })

    await ctx.reply(isRu ? '⏳ Создаю задачу...' : '⏳ Creating task...')

    const task = await dartAIService.createTask(taskData)

    await ctx.reply(
      isRu
        ? `✅ Задача создана!\n\n📝 **${task.title}**\n🆔 \`${
            task.id
          }\`\n📊 Статус: ${getStatusNameRu(
            task.status
          )}\n⚡ Приоритет: ${getPriorityNameRu(task.priority)}`
        : `✅ Task created!\n\n📝 **${task.title}**\n🆔 \`${task.id}\`\n📊 Status: ${task.status}\n⚡ Priority: ${task.priority}`,
      { parse_mode: 'Markdown' }
    )
  } catch (error) {
    await ctx.reply(
      isRu
        ? `❌ Ошибка создания задачи: ${
            error instanceof Error ? error.message : 'Неизвестная ошибка'
          }`
        : `❌ Error creating task: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
    )
  }
}

/**
 * Обрабатывает команду get
 */
async function handleGetTaskCommand(
  ctx: MyContext,
  args: string[],
  isRu: boolean
) {
  if (args.length === 0) {
    await ctx.reply(
      isRu
        ? '❌ Укажите ID задачи: `/dartai get <task_id>`'
        : '❌ Specify task ID: `/dartai get <task_id>`',
      { parse_mode: 'Markdown' }
    )
    return
  }

  const taskId = args[0]

  await ctx.reply(isRu ? '⏳ Загружаю задачу...' : '⏳ Loading task...')

  const task = await dartAIService.getTask(taskId)

  const statusEmoji = getStatusEmoji(task.status)
  const priorityEmoji = getPriorityEmoji(task.priority)
  const statusName = isRu ? getStatusNameRu(task.status) : task.status
  const priorityName = isRu ? getPriorityNameRu(task.priority) : task.priority

  const response = isRu
    ? `
📝 **${task.title}**

🆔 ID: \`${task.id}\`
📊 Статус: ${statusEmoji} ${statusName}
⚡ Приоритет: ${priorityEmoji} ${priorityName}
📅 Создана: ${new Date(task.created_at).toLocaleString('ru')}
${task.description ? `\n📄 Описание:\n${task.description}` : ''}
${task.tags.length > 0 ? `\n🏷️ Теги: ${task.tags.join(', ')}` : ''}
${task.assignee ? `\n👤 Исполнитель: ${task.assignee.name}` : ''}
`
    : `
📝 **${task.title}**

🆔 ID: \`${task.id}\`
📊 Status: ${statusEmoji} ${statusName}
⚡ Priority: ${priorityEmoji} ${priorityName}
📅 Created: ${new Date(task.created_at).toLocaleString('en')}
${task.description ? `\n📄 Description:\n${task.description}` : ''}
${task.tags.length > 0 ? `\n🏷️ Tags: ${task.tags.join(', ')}` : ''}
${task.assignee ? `\n👤 Assignee: ${task.assignee.name}` : ''}
`

  await ctx.reply(response, { parse_mode: 'Markdown' })
}

/**
 * Обрабатывает команду status
 */
async function handleStatusCommand(
  ctx: MyContext,
  args: string[],
  isRu: boolean
) {
  if (args.length < 2) {
    await ctx.reply(
      isRu
        ? '❌ Использование: `/dartai status <task_id> <status>`\nСтатусы: todo, in_progress, done, cancelled'
        : '❌ Usage: `/dartai status <task_id> <status>`\nStatuses: todo, in_progress, done, cancelled',
      { parse_mode: 'Markdown' }
    )
    return
  }

  const taskId = args[0]
  const newStatus = args[1] as DartAITaskStatus

  if (!['todo', 'in_progress', 'done', 'cancelled'].includes(newStatus)) {
    await ctx.reply(
      isRu
        ? '❌ Неверный статус. Доступные: todo, in_progress, done, cancelled'
        : '❌ Invalid status. Available: todo, in_progress, done, cancelled'
    )
    return
  }

  await ctx.reply(isRu ? '⏳ Обновляю статус...' : '⏳ Updating status...')

  const updatedTask = await dartAIService.updateTaskStatus(taskId, newStatus)
  const statusEmoji = getStatusEmoji(updatedTask.status)
  const statusName = isRu
    ? getStatusNameRu(updatedTask.status)
    : updatedTask.status

  await ctx.reply(
    isRu
      ? `✅ Статус обновлен!\n📝 **${updatedTask.title}**\n📊 Новый статус: ${statusEmoji} ${statusName}`
      : `✅ Status updated!\n📝 **${updatedTask.title}**\n📊 New status: ${statusEmoji} ${statusName}`,
    { parse_mode: 'Markdown' }
  )
}

/**
 * Обрабатывает команду priority
 */
async function handlePriorityCommand(
  ctx: MyContext,
  args: string[],
  isRu: boolean
) {
  if (args.length < 2) {
    await ctx.reply(
      isRu
        ? '❌ Использование: `/dartai priority <task_id> <priority>`\nПриоритеты: low, medium, high, critical'
        : '❌ Usage: `/dartai priority <task_id> <priority>`\nPriorities: low, medium, high, critical',
      { parse_mode: 'Markdown' }
    )
    return
  }

  const taskId = args[0]
  const newPriority = args[1] as DartAITaskPriority

  if (!['low', 'medium', 'high', 'critical'].includes(newPriority)) {
    await ctx.reply(
      isRu
        ? '❌ Неверный приоритет. Доступные: low, medium, high, critical'
        : '❌ Invalid priority. Available: low, medium, high, critical'
    )
    return
  }

  await ctx.reply(isRu ? '⏳ Обновляю приоритет...' : '⏳ Updating priority...')

  const updatedTask = await dartAIService.updateTaskPriority(
    taskId,
    newPriority
  )
  const priorityEmoji = getPriorityEmoji(updatedTask.priority)
  const priorityName = isRu
    ? getPriorityNameRu(updatedTask.priority)
    : updatedTask.priority

  await ctx.reply(
    isRu
      ? `✅ Приоритет обновлен!\n📝 **${updatedTask.title}**\n⚡ Новый приоритет: ${priorityEmoji} ${priorityName}`
      : `✅ Priority updated!\n📝 **${updatedTask.title}**\n⚡ New priority: ${priorityEmoji} ${priorityName}`,
    { parse_mode: 'Markdown' }
  )
}

/**
 * Обрабатывает команду delete
 */
async function handleDeleteTaskCommand(
  ctx: MyContext,
  args: string[],
  isRu: boolean
) {
  if (args.length === 0) {
    await ctx.reply(
      isRu
        ? '❌ Укажите ID задачи: `/dartai delete <task_id>`'
        : '❌ Specify task ID: `/dartai delete <task_id>`',
      { parse_mode: 'Markdown' }
    )
    return
  }

  const taskId = args[0]

  // Сначала получаем задачу для отображения информации
  const task = await dartAIService.getTask(taskId)

  await ctx.reply(isRu ? '⏳ Удаляю задачу...' : '⏳ Deleting task...')

  const deleted = await dartAIService.deleteTask(taskId)

  if (deleted) {
    await ctx.reply(
      isRu
        ? `✅ Задача удалена!\n📝 **${task.title}**\n🆔 ID: \`${task.id}\``
        : `✅ Task deleted!\n📝 **${task.title}**\n🆔 ID: \`${task.id}\``,
      { parse_mode: 'Markdown' }
    )
  } else {
    await ctx.reply(
      isRu ? '❌ Не удалось удалить задачу' : '❌ Failed to delete task'
    )
  }
}

/**
 * Обрабатывает команду sync
 */
async function handleSyncCommand(
  ctx: MyContext,
  args: string[],
  isRu: boolean
) {
  await ctx.reply(
    isRu
      ? '⏳ Синхронизация пока не реализована. Эта функция будет добавлена позже.'
      : '⏳ Synchronization is not implemented yet. This feature will be added later.'
  )
}

/**
 * Обрабатывает команду stats
 */
async function handleStatsCommand(ctx: MyContext, isRu: boolean) {
  await ctx.reply(
    isRu ? '⏳ Собираю статистику...' : '⏳ Gathering statistics...'
  )

  try {
    const tasks = await dartAIService.getTasks()

    // Подсчитываем статистику
    const stats = {
      total: tasks.length,
      byStatus: tasks.reduce((acc, task) => {
        acc[task.status] = (acc[task.status] || 0) + 1
        return acc
      }, {} as Record<string, number>),
      byPriority: tasks.reduce((acc, task) => {
        acc[task.priority] = (acc[task.priority] || 0) + 1
        return acc
      }, {} as Record<string, number>),
    }

    const response = isRu
      ? `
📊 **Статистика Dart AI**

📋 Всего задач: ${stats.total}

📊 **По статусам:**
${Object.entries(stats.byStatus)
  .map(
    ([status, count]) =>
      `${getStatusEmoji(status as DartAITaskStatus)} ${getStatusNameRu(
        status as DartAITaskStatus
      )}: ${count}`
  )
  .join('\n')}

⚡ **По приоритетам:**
${Object.entries(stats.byPriority)
  .map(
    ([priority, count]) =>
      `${getPriorityEmoji(priority as DartAITaskPriority)} ${getPriorityNameRu(
        priority as DartAITaskPriority
      )}: ${count}`
  )
  .join('\n')}
`
      : `
📊 **Dart AI Statistics**

📋 Total tasks: ${stats.total}

📊 **By status:**
${Object.entries(stats.byStatus)
  .map(
    ([status, count]) =>
      `${getStatusEmoji(status as DartAITaskStatus)} ${status}: ${count}`
  )
  .join('\n')}

⚡ **By priority:**
${Object.entries(stats.byPriority)
  .map(
    ([priority, count]) =>
      `${getPriorityEmoji(
        priority as DartAITaskPriority
      )} ${priority}: ${count}`
  )
  .join('\n')}
`

    await ctx.reply(response, { parse_mode: 'Markdown' })
  } catch (error) {
    await ctx.reply(
      isRu
        ? `❌ Ошибка получения статистики: ${
            error instanceof Error ? error.message : 'Неизвестная ошибка'
          }`
        : `❌ Error getting statistics: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
    )
  }
}

// Утилиты для отображения

function getStatusEmoji(status: DartAITaskStatus): string {
  switch (status) {
    case 'todo':
      return '📋'
    case 'in_progress':
      return '🔄'
    case 'done':
      return '✅'
    case 'cancelled':
      return '❌'
    default:
      return '📋'
  }
}

function getPriorityEmoji(priority: DartAITaskPriority): string {
  switch (priority) {
    case 'low':
      return '🟢'
    case 'medium':
      return '🟡'
    case 'high':
      return '🟠'
    case 'critical':
      return '🔴'
    default:
      return '🟡'
  }
}

function getStatusNameRu(status: DartAITaskStatus): string {
  switch (status) {
    case 'todo':
      return 'К выполнению'
    case 'in_progress':
      return 'В работе'
    case 'done':
      return 'Выполнено'
    case 'cancelled':
      return 'Отменено'
    default:
      return status
  }
}

function getPriorityNameRu(priority: DartAITaskPriority): string {
  switch (priority) {
    case 'low':
      return 'Низкий'
    case 'medium':
      return 'Средний'
    case 'high':
      return 'Высокий'
    case 'critical':
      return 'Критический'
    default:
      return priority
  }
}

// Дополнительная команда для быстрого создания задачи из GitHub Issue
export async function handleCreateDartAITaskFromGithub(ctx: MyContext) {
  const isRu = isRussianFromState(ctx)

  if (!dartAIService.isConfigured()) {
    await ctx.reply(
      isRu ? '❌ Dart AI не настроен' : '❌ Dart AI is not configured'
    )
    return
  }

  const message = ctx.message
  if (!message || !('text' in message)) {
    await ctx.reply(
      isRu ? '❌ Неверный формат команды' : '❌ Invalid command format'
    )
    return
  }

  // Ожидаем формат: /dartai_github <repo> <issue_number>
  const parts = message.text.split(' ')
  if (parts.length < 3) {
    await ctx.reply(
      isRu
        ? '📝 Использование: `/dartai_github <repository> <issue_number>`\n\nПример: `/dartai_github owner/repo 123`'
        : '📝 Usage: `/dartai_github <repository> <issue_number>`\n\nExample: `/dartai_github owner/repo 123`',
      { parse_mode: 'Markdown' }
    )
    return
  }

  const repository = parts[1]
  const issueNumber = parseInt(parts[2])

  if (isNaN(issueNumber)) {
    await ctx.reply(
      isRu ? '❌ Неверный номер Issue' : '❌ Invalid issue number'
    )
    return
  }

  try {
    await ctx.reply(
      isRu
        ? '⏳ Создаю задачу из GitHub Issue...'
        : '⏳ Creating task from GitHub Issue...'
    )

    // Здесь можно добавить интеграцию с GitHub API для получения данных Issue
    // Пока создаем задачу с базовой информацией
    const task = await dartAIService.createTaskFromGitHubIssue({
      title: `Issue #${issueNumber}`,
      body: `GitHub Issue from ${repository}`,
      number: issueNumber,
      repository: repository,
      labels: [],
    })

    await ctx.reply(
      isRu
        ? `✅ Задача создана из GitHub Issue!\n\n📝 **${task.title}**\n🆔 \`${task.id}\`\n🔗 Repository: ${repository}\n#️⃣ Issue: #${issueNumber}`
        : `✅ Task created from GitHub Issue!\n\n📝 **${task.title}**\n🆔 \`${task.id}\`\n🔗 Repository: ${repository}\n#️⃣ Issue: #${issueNumber}`,
      { parse_mode: 'Markdown' }
    )
  } catch (error) {
    logger.error('❌ [Dart AI Admin] GitHub integration error:', error)
    await ctx.reply(
      isRu
        ? `❌ Ошибка создания задачи: ${
            error instanceof Error ? error.message : 'Неизвестная ошибка'
          }`
        : `❌ Error creating task: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
    )
  }
}
