import { connect } from 'inngest/connect'
import { inngest } from './inngest-functions/clients'
import { logger } from './utils/logger'
import { functions } from './inngest-functions/registry'

/**
 * Запускает Inngest Connect для постоянного соединения
 * Использует WebSocket вместо HTTP endpoint для более надежного соединения
 * @see https://www.inngest.com/docs/setup/connect
 */
async function startInngestConnect() {
  try {
    logger.info({
      message: '🚀 Запуск Inngest Connect',
      description: 'Starting Inngest Connect with WebSocket connection',
      functions_count: functions.length,
      timestamp: new Date().toISOString(),
    })

    // Регистрируем все функции и устанавливаем соединение
    const connection = await connect({
      apps: [
        {
          client: inngest,
          functions: functions,
        },
      ],
      // Используем ID контейнера или хоста для идентификации экземпляра
      // можно заменить на process.env.HOSTNAME или другой уникальный идентификатор
      instanceId: `neuro-blogger-worker-${process.pid}`,
      // Обрабатываем сигналы завершения для корректного закрытия соединения
      handleShutdownSignals: ['SIGTERM', 'SIGINT'],
    })

    logger.info({
      message: `✅ Inngest Connect соединение установлено: ${connection.state}`,
      description: 'Inngest Connect connection established',
      state: connection.state,
      app_id: inngest.id,
      app_version: inngest.appVersion || 'unknown',
      timestamp: new Date().toISOString(),
    })

    // Мониторинг состояния соединения
    let lastState = connection.state
    setInterval(() => {
      if (connection.state !== lastState) {
        logger.info({
          message: `🔄 Состояние Inngest Connect изменилось: ${connection.state}`,
          description: 'Inngest Connect connection state changed',
          previous_state: lastState,
          current_state: connection.state,
          timestamp: new Date().toISOString(),
        })
        lastState = connection.state
      }
    }, 5000)

    // Ожидаем закрытия соединения
    await connection.closed
    logger.info({
      message: '👋 Inngest Connect соединение закрыто',
      description: 'Inngest Connect connection closed',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при запуске Inngest Connect',
      description: 'Error starting Inngest Connect',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    })
  }
}

// Экспортируем функцию для запуска в других местах
export { startInngestConnect }

// Если файл запущен напрямую, запускаем соединение
if (require.main === module) {
  logger.info({
    message: '🚀 Запуск Inngest Connect в отдельном процессе',
    description: 'Starting Inngest Connect in standalone process',
    timestamp: new Date().toISOString(),
  })

  startInngestConnect()
}
