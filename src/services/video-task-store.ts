/**
 * Persistent store для отслеживания задач генерации видео
 * Маппинг taskId -> контекст пользователя для отправки результата
 *
 * Использует файловую систему для персистентности между рестартами
 */

import fs from 'fs'
import path from 'path'

interface VideoTaskContext {
  telegramId: number
  chatId: number
  messageId: number
  prompt: string
  modelId: string
  duration: number
  createdAt: number
  botName?: string // Имя бота для multi-bot режима (опционально для обратной совместимости)
}

class VideoTaskStore {
  private tasks: Map<string, VideoTaskContext> = new Map()
  private storePath: string

  constructor() {
    this.storePath = path.join(process.cwd(), '.video-tasks.json')
    this.loadFromDisk()
  }

  /**
   * Загрузить задачи с диска
   */
  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.storePath)) {
        const data = fs.readFileSync(this.storePath, 'utf-8')

        // ✅ FIX: Проверяем что файл не пустой и содержит валидный JSON
        if (!data || data.trim().length === 0) {
          console.log('📂 [VIDEO-TASK-STORE] Файл пуст, создаём новый store')
          this.tasks = new Map()
          this.saveToDisk()
          return
        }

        const tasks = JSON.parse(data)

        // ✅ FIX: Проверяем что tasks - объект
        if (tasks && typeof tasks === 'object' && !Array.isArray(tasks)) {
          this.tasks = new Map(Object.entries(tasks))
          console.log(`📂 [VIDEO-TASK-STORE] Загружено ${this.tasks.size} задач с диска`)
        } else {
          console.log('📂 [VIDEO-TASK-STORE] Невалидный формат данных, создаём новый store')
          this.tasks = new Map()
          this.saveToDisk()
        }
      } else {
        console.log('📂 [VIDEO-TASK-STORE] Файл не найден, создаём новый store')
        this.tasks = new Map()
        this.saveToDisk()
      }
    } catch (error) {
      // ✅ FIX: Не выводим полную ошибку, просто создаём новый store
      console.log('📂 [VIDEO-TASK-STORE] Ошибка чтения файла, создаём новый store')
      this.tasks = new Map()
      this.saveToDisk()
    }
  }

  /**
   * Сохранить задачи на диск
   */
  private saveToDisk(): void {
    try {
      const tasks = Object.fromEntries(this.tasks)
      fs.writeFileSync(this.storePath, JSON.stringify(tasks, null, 2))
    } catch (error) {
      console.error('❌ [VIDEO-TASK-STORE] Ошибка сохранения задач:', error)
    }
  }

  /**
   * Сохранить задачу
   */
  saveTask(taskId: string, context: VideoTaskContext): void {
    this.tasks.set(taskId, {
      ...context,
      createdAt: Date.now()
    })

    // Сохраняем на диск для персистентности
    this.saveToDisk()

    // Автоматическая очистка через 1 час (Sora обычно генерирует за 3-5 минут)
    setTimeout(() => {
      this.tasks.delete(taskId)
      this.saveToDisk()
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
    this.saveToDisk()
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
    let cleaned = 0
    for (const [taskId, context] of this.tasks.entries()) {
      if (context.createdAt < oneHourAgo) {
        this.tasks.delete(taskId)
        cleaned++
      }
    }
    if (cleaned > 0) {
      console.log(`🧹 [VIDEO-TASK-STORE] Очищено ${cleaned} старых задач`)
      this.saveToDisk()
    }
  }
}

// Singleton instance
export const videoTaskStore = new VideoTaskStore()

// Периодическая очистка старых задач (каждые 10 минут)
setInterval(() => {
  videoTaskStore.cleanOldTasks()
}, 10 * 60 * 1000)
