/**
 * In-memory store для отслеживания задач генерации видео
 * Маппинг taskId -> контекст пользователя для отправки результата
 */

interface VideoTaskContext {
  telegramId: number
  chatId: number
  messageId: number
  prompt: string
  modelId: string
  duration: number
  createdAt: number
}

class VideoTaskStore {
  private tasks: Map<string, VideoTaskContext> = new Map()

  /**
   * Сохранить задачу
   */
  saveTask(taskId: string, context: VideoTaskContext): void {
    this.tasks.set(taskId, {
      ...context,
      createdAt: Date.now()
    })

    // Автоматическая очистка через 1 час (Sora обычно генерирует за 3-5 минут)
    setTimeout(() => {
      this.tasks.delete(taskId)
    }, 60 * 60 * 1000)
  }

  /**
   * Получить контекст по taskId
   */
  getTask(taskId: string): VideoTaskContext | undefined {
    return this.tasks.get(taskId)
  }

  /**
   * Удалить задачу после обработки
   */
  deleteTask(taskId: string): void {
    this.tasks.delete(taskId)
  }

  /**
   * Получить все активные задачи (для отладки)
   */
  getAllTasks(): Map<string, VideoTaskContext> {
    return new Map(this.tasks)
  }

  /**
   * Очистить старые задачи (старше 1 часа)
   */
  cleanOldTasks(): void {
    const oneHourAgo = Date.now() - 60 * 60 * 1000
    for (const [taskId, context] of this.tasks.entries()) {
      if (context.createdAt < oneHourAgo) {
        this.tasks.delete(taskId)
      }
    }
  }
}

// Singleton instance
export const videoTaskStore = new VideoTaskStore()

// Периодическая очистка старых задач (каждые 10 минут)
setInterval(() => {
  videoTaskStore.cleanOldTasks()
}, 10 * 60 * 1000)
