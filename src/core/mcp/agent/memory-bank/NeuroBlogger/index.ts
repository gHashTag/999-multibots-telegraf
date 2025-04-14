import { AutonomousSystem, Task } from '../../autonomous-system'
import { TaskType } from '../../state'
import { logger } from '../../../logger'

/**
 * Запускает автономную систему NeuroBlogger
 */
async function startNeuroBlogger() {
  logger.info('🤖 Инициализация NeuroBlogger...')
  
  // Создаем экземпляр автономной системы
  const system = new AutonomousSystem()
  
  // Добавляем начальные задачи
  system.addTask({
    type: TaskType.SELF_IMPROVEMENT,
    description: 'Анализ и оптимизация текущей кодовой базы',
    priority: 1
  })
  
  system.addTask({
    type: TaskType.CODE_GENERATION,
    description: 'Создание базовых компонентов для работы с контентом',
    priority: 2
  })
  
  system.addTask({
    type: TaskType.CODE_ANALYSIS,
    description: 'Анализ производительности системы',
    priority: 1
  })
  
  // Подписываемся на события
  system.on('taskCompleted', (task: Task) => {
    logger.info('✅ Задача выполнена:', {
      taskId: task.id,
      type: task.type,
      description: task.description
    })
  })
  
  system.on('taskFailed', (task: Task, error: Error | unknown) => {
    logger.error('❌ Ошибка при выполнении задачи:', {
      taskId: task.id,
      type: task.type,
      error: error instanceof Error ? error.message : String(error)
    })
  })
  
  // Запускаем систему
  system.start()
  
  logger.info('🚀 NeuroBlogger запущен и работает автономно')
  
  // Обработка завершения работы
  process.on('SIGINT', async () => {
    logger.info('🛑 Получен сигнал завершения, останавливаем NeuroBlogger...')
    system.stop()
    process.exit(0)
  })
}

// Запускаем систему
startNeuroBlogger().catch((error: Error | unknown) => {
  logger.error('❌ Ошибка при запуске NeuroBlogger:', {
    error: error instanceof Error ? error.message : String(error)
  })
  process.exit(1)
}) 