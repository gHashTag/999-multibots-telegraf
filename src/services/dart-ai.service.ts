import axios, { AxiosResponse } from 'axios'
import { logger } from '@/utils/logger'
import { ORIGIN } from '@/config'
import {
  DartAITask,
  DartAITaskStatus,
  CreateDartAITaskRequest,
  UpdateDartAITaskRequest,
  DartAISpace,
  DartAIApiResponse,
  DartAITaskList,
  DartAISpaceList,
  DartAITaskPriority,
} from '@/interfaces/dart-ai.interface'

/**
 * Сервис для работы с Dart AI API через наш сервер
 * Обеспечивает создание, управление и синхронизацию задач в Dart AI
 */
export class DartAIService {
  private readonly baseUrl: string
  private readonly defaultSpace = 'default'

  constructor() {
    // Используем внешний API сервер на Railway (НЕ локальный!)
    this.baseUrl = 'https://ai-server-production-production-8e2d.up.railway.app'
  }

  /**
   * Проверяет, доступен ли сервер
   */
  isConfigured(): boolean {
    return !!this.baseUrl
  }

  /**
   * Создает HTTP клиент с общими настройками
   */
  private createHttpClient() {
    return axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000, // 30 секунд
    })
  }

  /**
   * Получает список пространств (spaces) пользователя
   */
  async getSpaces(): Promise<DartAISpace[]> {
    if (!this.isConfigured()) {
      throw new Error('Dart AI service not configured')
    }

    try {
      logger.info('🎯 [Dart AI] Fetching user spaces')

      const client = this.createHttpClient()
      const response: AxiosResponse<{ success: boolean; data: DartAISpace[] }> =
        await client.get('/api/dart-ai/spaces')

      if (response.data.success) {
        logger.info(
          `✅ [Dart AI] Found ${response.data.data.length} spaces`
        )
        return response.data.data
      } else {
        throw new Error('Failed to fetch spaces')
      }
    } catch (error) {
      logger.error('❌ [Dart AI] Error fetching spaces:', error)
      throw this.handleApiError(error)
    }
  }

  /**
   * Получает список задач из пространства
   */
  async getTasks(spaceId: string = this.defaultSpace): Promise<DartAITask[]> {
    if (!this.isConfigured()) {
      throw new Error('Dart AI service not configured')
    }

    try {
      logger.info(`🎯 [Dart AI] Fetching tasks from space: ${spaceId}`)

      const client = this.createHttpClient()
      const response: AxiosResponse<{ success: boolean; data: DartAITask[] }> =
        await client.get(`/api/dart-ai/tasks/${spaceId}`)

      if (response.data.success) {
        logger.info(
          `✅ [Dart AI] Found ${response.data.data.length} tasks`
        )
        return response.data.data
      } else {
        throw new Error('Failed to fetch tasks')
      }
    } catch (error) {
      logger.error('❌ [Dart AI] Error fetching tasks:', error)
      throw this.handleApiError(error)
    }
  }

  /**
   * Получает задачу по ID
   */
  async getTask(
    taskId: string,
    spaceId: string = this.defaultSpace
  ): Promise<DartAITask> {
    if (!this.isConfigured()) {
      throw new Error('Dart AI service not configured')
    }

    try {
      logger.info(`🎯 [Dart AI] Fetching task: ${taskId}`)

      const client = this.createHttpClient()
      const response: AxiosResponse<{ success: boolean; data: DartAITask }> =
        await client.get(`/api/dart-ai/tasks/${spaceId}/${taskId}`)

      if (response.data.success) {
        logger.info(`✅ [Dart AI] Task found: ${response.data.data.title}`)
        return response.data.data
      } else {
        throw new Error('Task not found')
      }
    } catch (error) {
      logger.error(`❌ [Dart AI] Error fetching task ${taskId}:`, error)
      throw this.handleApiError(error)
    }
  }

  /**
   * Создает новую задачу
   */
  async createTask(
    taskData: CreateDartAITaskRequest,
    spaceId: string = this.defaultSpace
  ): Promise<DartAITask> {
    if (!this.isConfigured()) {
      throw new Error('Dart AI service not configured')
    }

    try {
      logger.info(`🎯 [Dart AI] Creating task: ${taskData.title}`)

      const client = this.createHttpClient()
      const response: AxiosResponse<{ success: boolean; data: DartAITask }> =
        await client.post(`/api/dart-ai/tasks/${spaceId}`, taskData)

      if (response.data.success) {
        logger.info(`✅ [Dart AI] Task created: ${response.data.data.id}`)
        return response.data.data
      } else {
        throw new Error('Failed to create task')
      }
    } catch (error) {
      logger.error('❌ [Dart AI] Error creating task:', error)
      throw this.handleApiError(error)
    }
  }

  /**
   * Обновляет существующую задачу
   */
  async updateTask(
    taskId: string,
    updates: UpdateDartAITaskRequest,
    spaceId: string = this.defaultSpace
  ): Promise<DartAITask> {
    if (!this.isConfigured()) {
      throw new Error('Dart AI service not configured')
    }

    try {
      logger.info(`🎯 [Dart AI] Updating task: ${taskId}`)

      const client = this.createHttpClient()
      const response: AxiosResponse<{ success: boolean; data: DartAITask }> =
        await client.put(`/api/dart-ai/tasks/${spaceId}/${taskId}`, updates)

      if (response.data.success) {
        logger.info(`✅ [Dart AI] Task updated: ${response.data.data.title}`)
        return response.data.data
      } else {
        throw new Error('Failed to update task')
      }
    } catch (error) {
      logger.error(`❌ [Dart AI] Error updating task ${taskId}:`, error)
      throw this.handleApiError(error)
    }
  }

  /**
   * Удаляет задачу
   */
  async deleteTask(
    taskId: string,
    spaceId: string = this.defaultSpace
  ): Promise<boolean> {
    if (!this.isConfigured()) {
      throw new Error('Dart AI service not configured')
    }

    try {
      logger.info(`🎯 [Dart AI] Deleting task: ${taskId}`)

      const client = this.createHttpClient()
      const response: AxiosResponse<{ success: boolean; data: { deleted: boolean } }> =
        await client.delete(`/api/dart-ai/tasks/${spaceId}/${taskId}`)

      if (response.data.success) {
        logger.info(`✅ [Dart AI] Task deleted: ${taskId}`)
        return response.data.data.deleted
      } else {
        throw new Error('Failed to delete task')
      }
    } catch (error) {
      logger.error(`❌ [Dart AI] Error deleting task ${taskId}:`, error)
      throw this.handleApiError(error)
    }
  }

  /**
   * Обновляет статус задачи
   */
  async updateTaskStatus(
    taskId: string,
    status: DartAITaskStatus,
    spaceId: string = this.defaultSpace
  ): Promise<DartAITask> {
    return this.updateTask(taskId, { status }, spaceId)
  }

  /**
   * Обновляет приоритет задачи
   */
  async updateTaskPriority(
    taskId: string,
    priority: DartAITaskPriority,
    spaceId: string = this.defaultSpace
  ): Promise<DartAITask> {
    return this.updateTask(taskId, { priority }, spaceId)
  }

  /**
   * Создает задачу из GitHub Issue
   */
  async createTaskFromGitHubIssue(
    issue: {
      title: string
      body?: string
      number: number
      repository: string
      labels?: string[]
    },
    spaceId: string = this.defaultSpace
  ): Promise<DartAITask> {
    if (!this.isConfigured()) {
      throw new Error('Dart AI service not configured')
    }

    try {
      logger.info(`🎯 [Dart AI] Creating task from GitHub Issue #${issue.number}`)

      const client = this.createHttpClient()
      const response: AxiosResponse<{ success: boolean; data: DartAITask }> =
        await client.post('/api/dart-ai/github-issue', { issue, spaceId })

      if (response.data.success) {
        logger.info(`✅ [Dart AI] GitHub task created: ${response.data.data.id}`)
        return response.data.data
      } else {
        throw new Error('Failed to create task from GitHub issue')
      }
    } catch (error) {
      logger.error('❌ [Dart AI] Error creating GitHub task:', error)
      throw this.handleApiError(error)
    }
  }

  /**
   * Синхронизирует задачи с внешней системой
   */
  async syncWithExternalSystem(
    externalTasks: any[],
    spaceId: string = this.defaultSpace
  ): Promise<{ created: number; updated: number; errors: any[] }> {
    if (!this.isConfigured()) {
      throw new Error('Dart AI service not configured')
    }

    try {
      logger.info(`🎯 [Dart AI] Starting bulk sync of ${externalTasks.length} tasks`)

      const client = this.createHttpClient()
      const response: AxiosResponse<{
        success: boolean;
        data: { created: number; updated: number; errors: any[] }
      }> = await client.post('/api/dart-ai/bulk-sync', {
        tasks: externalTasks,
        spaceId,
      })

      if (response.data.success) {
        const results = response.data.data
        logger.info(
          `✅ [Dart AI] Bulk sync completed: ${results.created} created, ${results.updated} updated, ${results.errors.length} errors`
        )
        return results
      } else {
        throw new Error('Failed to sync tasks')
      }
    } catch (error) {
      logger.error('❌ [Dart AI] Error syncing tasks:', error)
      throw this.handleApiError(error)
    }
  }

  /**
   * Обрабатывает ошибки API
   */
  private handleApiError(error: any): Error {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        // Сервер ответил с кодом ошибки
        const status = error.response.status
        const message =
          error.response.data?.error ||
          error.response.data?.message ||
          error.message

        switch (status) {
          case 401:
            return new Error('Unauthorized access to Dart AI service')
          case 404:
            return new Error('Resource not found')
          case 429:
            return new Error('Rate limit exceeded')
          case 500:
            return new Error('Server error')
          default:
            return new Error(`API error (${status}): ${message}`)
        }
      } else if (error.request) {
        // Запрос был отправлен, но ответа не получено
        return new Error('Network error: Unable to reach server')
      } else {
        // Ошибка при настройке запроса
        return new Error(`Request error: ${error.message}`)
      }
    }

    return error instanceof Error ? error : new Error(String(error))
  }
}

// Экспортируем экземпляр для использования в приложении
export const dartAIService = new DartAIService()
