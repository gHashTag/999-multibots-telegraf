import { inngest } from '../client'
import { logger } from '@/utils/logger'
import { videoTaskStore } from '@/services/video-task-store'
import { ADMIN_IDS_ARRAY } from '@/config'

/**
 * Kie.ai Webhook Monitor - Inngest Function
 *
 * Отслеживает состояние webhook'ов от Kie.ai для видеогенерации:
 * - Проверяет застрявшие задачи (>10 минут без ответа)
 * - Уведомляет админа о проблемах с webhook'ами
 * - Логирует статистику по задачам
 */

interface WebhookMonitorStats {
  totalTasks: number
  staleTasks: number
  recentlyCompletedTasks: number
  averageWaitTime: number
}

/**
 * Основная функция мониторинга Kie.ai webhook'ов
 * Запускается каждые 10 минут
 */
export const kieAiWebhookMonitor = inngest.createFunction(
  {
    id: 'kie-ai-webhook-monitor',
    name: 'Kie.ai Webhook Health Monitor',
    /**
     * Запуск каждые 10 минут
     */
    cron: '*/10 * * * *',
  },
  {
    event: 'kie-ai/webhook-monitor',
  },
  async ({ event, step }) => {
    logger.info('[KieAiWebhookMonitor] 🔍 Запускаем мониторинг Kie.ai webhook\'ов')

    try {
      // Step 1: Собираем статистику по активным задачам
      const stats = await step.run('analyze-active-tasks', async () => {
        const allTasks = videoTaskStore.getAllTasks()
        const now = Date.now()

        const staleThreshold = 10 * 60 * 1000 // 10 минут
        const recentThreshold = 5 * 60 * 1000 // 5 минут

        const staleTasks = Object.entries(allTasks).filter(([taskId, context]) => {
          const age = now - context.createdAt
          return age > staleThreshold
        })

        const recentTasks = Object.entries(allTasks).filter(([taskId, context]) => {
          const age = now - context.createdAt
          return age < recentThreshold
        })

        // Вычисляем среднее время ожидания
        const allAges = Object.values(allTasks).map(context => now - context.createdAt)
        const averageWaitTime = allAges.length > 0
          ? allAges.reduce((sum, age) => sum + age, 0) / allAges.length / 1000 // в секундах
          : 0

        const stats: WebhookMonitorStats = {
          totalTasks: Object.keys(allTasks).length,
          staleTasks: staleTasks.length,
          recentlyCompletedTasks: recentTasks.length,
          averageWaitTime: Math.round(averageWaitTime)
        }

        logger.info('[KieAiWebhookMonitor] Статистика задач', stats)

        return { stats, staleTasks: staleTasks.map(([taskId, ctx]) => ({ taskId, ctx })) }
      })

      // Step 2: Если есть застрявшие задачи - логируем детали
      if (stats.staleTasks.length > 0) {
        await step.run('log-stale-tasks', async () => {
          for (const { taskId, ctx } of stats.staleTasks) {
            const ageMinutes = Math.round((Date.now() - ctx.createdAt) / 1000 / 60)

            logger.warn('[KieAiWebhookMonitor] ⚠️ Застрявшая задача', {
              taskId,
              botName: ctx.botName,
              modelId: ctx.modelId,
              duration: ctx.duration,
              ageMinutes,
              telegramId: ctx.telegramId
            })
          }

          return { logged: stats.staleTasks.length }
        })
      }

      // Step 3: Если много застрявших задач (>5) - критическое уведомление админу
      if (stats.staleTasks.length >= 5) {
        await step.run('notify-admin-critical', async () => {
          await notifyAdminAboutStuckWebhooks(stats)
          return { notified: true }
        })
      }

      // Step 4: Если webhook'и не приходят совсем (общее число задач >20) - экстренное уведомление
      if (stats.stats.totalTasks > 20 && stats.stats.averageWaitTime > 600) {
        await step.run('notify-admin-emergency', async () => {
          await notifyAdminAboutWebhookFailure(stats)
          return { notified: true }
        })
      }

      logger.info('[KieAiWebhookMonitor] ✅ Мониторинг завершен', {
        totalTasks: stats.stats.totalTasks,
        staleTasks: stats.stats.staleTasks,
        avgWaitTime: `${stats.stats.averageWaitTime}s`
      })

      return {
        success: true,
        stats: stats.stats,
        timestamp: new Date().toISOString()
      }

    } catch (error) {
      logger.error('[KieAiWebhookMonitor] ❌ Ошибка мониторинга', { error })

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      }
    }
  }
)

/**
 * Уведомление админа о застрявших webhook'ах
 */
async function notifyAdminAboutStuckWebhooks(data: {
  stats: WebhookMonitorStats
  staleTasks: Array<{ taskId: string; ctx: any }>
}): Promise<void> {
  const message = `⚠️ <b>Проблема с Kie.ai webhook'ами</b>

<b>Застрявших задач:</b> ${data.stats.staleTasks}
<b>Всего активных задач:</b> ${data.stats.totalTasks}
<b>Среднее время ожидания:</b> ${data.stats.averageWaitTime}с

<b>Детали застрявших задач:</b>
${data.staleTasks.slice(0, 5).map(({ taskId, ctx }) => {
  const ageMinutes = Math.round((Date.now() - ctx.createdAt) / 1000 / 60)
  return `• ${taskId.slice(0, 8)}... (${ctx.modelId}, ${ageMinutes} мин)`
}).join('\n')}

${data.staleTasks.length > 5 ? `\n... и еще ${data.staleTasks.length - 5} задач` : ''}

⚠️ Возможно, Kie.ai не отправляет webhook'и или URL недоступен.

Проверьте:
1. Доступность webhook URL
2. Логи Kie.ai API
3. Настройки callback URL в запросах`

  // Отправляем первому админу (чтобы не спамить всем)
  const adminId = ADMIN_IDS_ARRAY[0]
  if (adminId) {
    try {
      // TODO: Нужен bot instance для отправки
      // Пока просто логируем
      logger.warn('[KieAiWebhookMonitor] Admin notification (logged only)', { message, adminId })
    } catch (error) {
      logger.error('[KieAiWebhookMonitor] Failed to notify admin', { error })
    }
  }
}

/**
 * Критическое уведомление админа о полном отказе webhook'ов
 */
async function notifyAdminAboutWebhookFailure(data: {
  stats: WebhookMonitorStats
  staleTasks: Array<{ taskId: string; ctx: any }>
}): Promise<void> {
  const message = `🚨 <b>КРИТИЧЕСКАЯ ОШИБКА: Kie.ai webhook'и не работают!</b>

<b>Всего задач в очереди:</b> ${data.stats.totalTasks}
<b>Среднее время ожидания:</b> ${data.stats.averageWaitTime}с (>10 мин!)

<b>Симптомы:</b>
- Webhook'и от Kie.ai не приходят
- Пользователи не получают готовые видео
- Задачи накапливаются в памяти

<b>Требуется немедленное действие:</b>
1. Проверить доступность webhook URL
2. Проверить настройки Kie.ai API
3. Проверить логи сервера на ошибки
4. Возможно, нужен restart сервера

⚠️ <b>ПОЛЬЗОВАТЕЛИ НЕ ПОЛУЧАЮТ ВИДЕО!</b>`

  // Отправляем ВСЕМ админам при критической ошибке
  for (const adminId of ADMIN_IDS_ARRAY) {
    try {
      // TODO: Нужен bot instance для отправки
      // Пока просто логируем
      logger.error('[KieAiWebhookMonitor] CRITICAL admin notification (logged only)', { message, adminId })
    } catch (error) {
      logger.error('[KieAiWebhookMonitor] Failed to notify admin', { adminId, error })
    }
  }
}

/**
 * Функция для ручной проверки (можно вызвать через API)
 */
export const kieAiWebhookManualCheck = inngest.createFunction(
  {
    id: 'kie-ai-webhook-manual-check',
    name: 'Kie.ai Webhook Manual Check',
  },
  {
    event: 'kie-ai/webhook-check-manual',
  },
  async ({ event, step }) => {
    logger.info('[KieAiWebhookManualCheck] Ручная проверка webhook\'ов')

    const allTasks = videoTaskStore.getAllTasks()
    const now = Date.now()

    const taskDetails = Object.entries(allTasks).map(([taskId, context]) => ({
      taskId,
      botName: context.botName,
      modelId: context.modelId,
      duration: context.duration,
      ageSeconds: Math.round((now - context.createdAt) / 1000),
      telegramId: context.telegramId
    }))

    logger.info('[KieAiWebhookManualCheck] Активные задачи', {
      total: taskDetails.length,
      tasks: taskDetails
    })

    return {
      success: true,
      totalTasks: taskDetails.length,
      tasks: taskDetails,
      timestamp: new Date().toISOString()
    }
  }
)

/**
 * Экспортируем все функции
 */
export default [
  kieAiWebhookMonitor,
  kieAiWebhookManualCheck
]
