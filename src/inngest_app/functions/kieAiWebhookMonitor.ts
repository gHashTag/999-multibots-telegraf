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

interface MonitorResult {
  stats: WebhookMonitorStats
  staleTasks: Array<{ taskId: string; ctx: any }>
}

/**
 * Уведомление админа о застрявших webhook'ах
 */
async function notifyAdminAboutStuckWebhooks(
  data: MonitorResult
): Promise<void> {
  const message = `⚠️ <b>Проблема с Kie.ai webhook'ами</b>

<b>Застрявших задач:</b> ${data.stats.staleTasks}
<b>Всего активных задач:</b> ${data.stats.totalTasks}
<b>Среднее время ожидания:</b> ${data.stats.averageWaitTime}с

<b>Детали застрявших задач:</b>
${data.staleTasks
  .slice(0, 5)
  .map(({ taskId, ctx }) => {
    const ageMinutes = Math.round((Date.now() - ctx.createdAt) / 1000 / 60)
    return `• ${taskId.slice(0, 8)}... (${ctx.modelId}, ${ageMinutes} мин)`
  })
  .join('\n')}

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
      // Отправляем через Inngest event (bot instance будет доступен в webhook handler)
      const { inngest } = await import('../client')
      await inngest.send({
        name: 'telegram/send-admin-notification',
        data: {
          adminId,
          message,
          priority: 'warning',
        },
      })
      logger.info('[KieAiWebhookMonitor] Admin notification event sent', {
        adminId,
      })
    } catch (error) {
      logger.error(
        '[KieAiWebhookMonitor] Failed to send admin notification event',
        { error }
      )
    }
  }
}

/**
 * Критическое уведомление админа о полном отказе webhook'ов
 */
async function notifyAboutWebhookFailure(data: MonitorResult): Promise<void> {
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
      logger.error(
        '[KieAiWebhookMonitor] CRITICAL admin notification (logged only)',
        { message, adminId }
      )
    } catch (error) {
      logger.error('[KieAiWebhookMonitor] Failed to notify admin', {
        adminId,
        error,
      })
    }
  }
}

// ✅ LAZY FUNCTION: Создаем функции только после загрузки секретов
function createWebhookMonitorFunctions() {
  // ❗ По требованию продакшена отключаем периодический мониторинг по cron.
  //    Kie.ai Webhook Health Monitor больше не запускается каждые 10 минут,
  //    чтобы не засорять логи и не жечь ресурсы. Оставляем только ручную
  //    проверку через событие kie-ai/webhook-check-manual.
  /**
   * Функция для ручной проверки (можно вызвать через API)
   */
  const kieAiWebhookManualCheck = inngest.createFunction(
    {
      id: 'kie-ai-webhook-manual-check',
      name: '🤖 Kie.ai Webhook',
    },
    {
      event: 'kie-ai/webhook-check-manual',
    },
    async ({ event, step }) => {
      logger.info("[KieAiWebhookManualCheck] Ручная проверка webhook'ов")

      const allTasks = videoTaskStore.getAllTasks()
      const now = Date.now()

      const taskDetails = Object.entries(allTasks).map(([taskId, context]) => ({
        taskId,
        botName: context.botName,
        modelId: context.modelId,
        duration: context.duration,
        ageSeconds: Math.round((now - context.createdAt) / 1000),
        telegramId: context.telegramId,
      }))

      logger.info('[KieAiWebhookManualCheck] Активные задачи', {
        total: taskDetails.length,
        tasks: taskDetails,
      })

      return {
        success: true,
        totalTasks: taskDetails.length,
        tasks: taskDetails,
        timestamp: new Date().toISOString(),
      }
    }
  )

  /**
   * Экспортируем все функции как массив
   */
  const kieAiWebhookMonitorFunctions = [kieAiWebhookManualCheck]

  return kieAiWebhookMonitorFunctions
}

export { createWebhookMonitorFunctions }
export default createWebhookMonitorFunctions
