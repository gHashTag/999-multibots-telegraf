import { logger } from '@/utils/logger'

/**
 * Кеш для предотвращения дублирующихся генераций видео
 * Структура: Map<userId_modelId, { taskId: string, timestamp: number, prompt: string }>
 */
class VideoTaskCache {
  private cache = new Map<
    string,
    {
      taskId: string
      timestamp: number
      prompt: string
      modelId: string
      imageUrl?: string
    }
  >()

  // Время жизни записи в кеше (15 минут)
  private readonly TTL = 15 * 60 * 1000

  // Интервал очистки устаревших записей (каждые 5 минут)
  private cleanupInterval: NodeJS.Timeout

  constructor() {
    // Автоматическая очистка кеша каждые 5 минут
    this.cleanupInterval = setInterval(
      () => {
        this.cleanup()
      },
      5 * 60 * 1000
    )

    logger.info('[VideoTaskCache] Initialized with automatic cleanup')
  }

  /**
   * Проверяет, есть ли активная генерация для пользователя и модели
   */
  hasActiveTask(userId: string, modelId: string): boolean {
    const key = `${userId}_${modelId}`
    const task = this.cache.get(key)

    if (!task) return false

    // Проверяем, не устарела ли запись
    const age = Date.now() - task.timestamp
    if (age > this.TTL) {
      this.cache.delete(key)
      logger.info('[VideoTaskCache] Removed expired task', {
        userId,
        modelId,
        taskId: task.taskId,
        ageMinutes: Math.floor(age / 60000),
      })
      return false
    }

    return true
  }

  /**
   * Добавляет новую задачу в кеш
   */
  addTask(
    userId: string,
    modelId: string,
    taskId: string,
    prompt: string,
    imageUrl?: string
  ): void {
    const key = `${userId}_${modelId}`

    // Проверяем, нет ли уже активной задачи
    if (this.hasActiveTask(userId, modelId)) {
      const existing = this.cache.get(key)
      logger.warn('[VideoTaskCache] ⚠️ Attempt to add duplicate task blocked', {
        userId,
        modelId,
        newTaskId: taskId,
        existingTaskId: existing?.taskId,
        existingAge: existing
          ? Math.floor((Date.now() - existing.timestamp) / 60000)
          : 0,
      })
      return
    }

    this.cache.set(key, {
      taskId,
      timestamp: Date.now(),
      prompt: prompt.substring(0, 100), // Сохраняем только начало промпта
      modelId,
      imageUrl: imageUrl?.substring(0, 100),
    })

    logger.info('[VideoTaskCache] Task added', {
      userId,
      modelId,
      taskId,
      cacheSize: this.cache.size,
    })
  }

  /**
   * Удаляет задачу из кеша (при успешном завершении или ошибке)
   */
  removeTask(userId: string, modelId: string): void {
    const key = `${userId}_${modelId}`
    const task = this.cache.get(key)

    if (task) {
      this.cache.delete(key)
      const ageMinutes = Math.floor((Date.now() - task.timestamp) / 60000)

      logger.info('[VideoTaskCache] Task removed', {
        userId,
        modelId,
        taskId: task.taskId,
        ageMinutes,
        remainingTasks: this.cache.size,
      })
    }
  }

  /**
   * Получает информацию об активной задаче
   */
  getActiveTask(userId: string, modelId: string) {
    const key = `${userId}_${modelId}`
    return this.cache.get(key)
  }

  /**
   * Очищает устаревшие записи
   */
  private cleanup(): void {
    const before = this.cache.size
    const now = Date.now()
    let removed = 0

    for (const [key, task] of this.cache.entries()) {
      if (now - task.timestamp > this.TTL) {
        this.cache.delete(key)
        removed++
      }
    }

    if (removed > 0) {
      logger.info('[VideoTaskCache] Cleanup completed', {
        before,
        after: this.cache.size,
        removed,
      })
    }
  }

  /**
   * Полностью очищает кеш
   */
  clear(): void {
    const size = this.cache.size
    this.cache.clear()
    logger.info('[VideoTaskCache] Cache cleared', { clearedTasks: size })
  }

  /**
   * Останавливает автоматическую очистку
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      logger.info('[VideoTaskCache] Cleanup interval stopped')
    }
  }

  /**
   * Получает статистику кеша
   */
  getStats() {
    const tasks = Array.from(this.cache.entries()).map(([key, task]) => ({
      key,
      taskId: task.taskId,
      modelId: task.modelId,
      ageMinutes: Math.floor((Date.now() - task.timestamp) / 60000),
    }))

    return {
      totalTasks: this.cache.size,
      tasks,
    }
  }
}

// Создаем глобальный экземпляр кеша
export const videoTaskCache = new VideoTaskCache()
