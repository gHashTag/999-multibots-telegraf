import axios, { AxiosResponse } from 'axios'
import { logger } from '@/utils/logger'
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
 * Сервис для работы с Dart AI API
 * Обеспечивает создание, управление и синхронизацию задач в Dart AI
 */
export class DartAIService {
  private readonly apiKey: string
  private readonly baseUrl = 'https://api.dart.ai'
  private readonly defaultSpace = 'default'

  constructor() {
    this.apiKey = process.env.DART_AI_API_KEY || ''
    if (!this.apiKey) {
      logger.warn('⚠️ [Dart AI] API key not configured')
    }
  }

  /**
   * Проверяет, настроен ли API ключ
   */
  isConfigured(): boolean {
    return !!this.apiKey
  }

  /**
   * Создает HTTP клиент с общими настройками
   */
  private createHttpClient() {
    return axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
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
      throw new Error('Dart AI API key not configured')
    }

    try {
      logger.info('🎯 [Dart AI] Fetching user spaces')

      const client = this.createHttpClient()
      const response: AxiosResponse<DartAIApiResponse<DartAISpaceList>> =
        await client.get('/v0/spaces')

      if (response.data.success) {
        logger.info(
          `✅ [Dart AI] Found ${response.data.data.spaces.length} spaces`
        )
        return response.data.data.spaces
      } else {
        throw new Error(response.data.error || 'Failed to fetch spaces')
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
      throw new Error('Dart AI API key not configured')
    }

    try {
      logger.info(`🎯 [Dart AI] Fetching tasks from space: ${spaceId}`)

      const client = this.createHttpClient()
      const response: AxiosResponse<DartAIApiResponse<DartAITaskList>> =
        await client.get(`/v0/spaces/${spaceId}/tasks`)

      if (response.data.success) {
        logger.info(
          `✅ [Dart AI] Found ${response.data.data.tasks.length} tasks`
        )
        return response.data.data.tasks
      } else {
        throw new Error(response.data.error || 'Failed to fetch tasks')
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
      throw new Error('Dart AI API key not configured')
    }

    try {
      logger.info(`🎯 [Dart AI] Fetching task: ${taskId}`)

      const client = this.createHttpClient()
      const response: AxiosResponse<DartAIApiResponse<DartAITask>> =
        await client.get(`/v0/spaces/${spaceId}/tasks/${taskId}`)

      if (response.data.success) {
        logger.info(`✅ [Dart AI] Task found: ${response.data.data.title}`)
        return response.data.data
      } else {
        throw new Error(response.data.error || 'Task not found')
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
      throw new Error('Dart AI API key not configured')
    }

    try {
      logger.info(`🎯 [Dart AI] Creating task: ${taskData.title}`)

      const client = this.createHttpClient()
      const response: AxiosResponse<DartAIApiResponse<DartAITask>> =
        await client.post(`/v0/spaces/${spaceId}/tasks`, taskData)

      if (response.data.success) {
        logger.info(`✅ [Dart AI] Task created: ${response.data.data.id}`)
        return response.data.data
      } else {
        throw new Error(response.data.error || 'Failed to create task')
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
      throw new Error('Dart AI API key not configured')
    }

    try {
      logger.info(`🎯 [Dart AI] Updating task: ${taskId}`)

      const client = this.createHttpClient()
      const response: AxiosResponse<DartAIApiResponse<DartAITask>> =
        await client.put(`/v0/spaces/${spaceId}/tasks/${taskId}`, updates)

      if (response.data.success) {
        logger.info(`✅ [Dart AI] Task updated: ${response.data.data.title}`)
        return response.data.data
      } else {
        throw new Error(response.data.error || 'Failed to update task')
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
      throw new Error('Dart AI API key not configured')
    }

    try {
      logger.info(`🎯 [Dart AI] Deleting task: ${taskId}`)

      const client = this.createHttpClient()
      const response: AxiosResponse<DartAIApiResponse<{ deleted: boolean }>> =
        await client.delete(`/v0/spaces/${spaceId}/tasks/${taskId}`)

      if (response.data.success) {
        logger.info(`✅ [Dart AI] Task deleted: ${taskId}`)
        return response.data.data.deleted
      } else {
        throw new Error(response.data.error || 'Failed to delete task')
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
    const taskData: CreateDartAITaskRequest = {
      title: `[GitHub #${issue.number}] ${issue.title}`,
      description: issue.body || '',
      status: 'todo',
      priority: issue.labels?.includes('high') ? 'high' : 'medium',
      tags: issue.labels || [],
      metadata: {
        github_issue: issue.number,
        repository: issue.repository,
        source: 'github',
      },
    }

    return this.createTask(taskData, spaceId)
  }

  /**
   * Синхронизирует задачи с внешней системой
   */
  async syncWithExternalSystem(
    externalTasks: any[]
  ): Promise<{ created: number; updated: number; errors: any[] }> {
    const results = {
      created: 0,
      updated: 0,
      errors: [] as any[],
    }

    for (const externalTask of externalTasks) {
      try {
        // Логика синхронизации зависит от внешней системы
        // Это базовая реализация
        const existingTasks = await this.getTasks()
        const existingTask = existingTasks.find(
          t => t.metadata?.external_id === externalTask.id
        )

        if (existingTask) {
          await this.updateTask(existingTask.id, {
            title: externalTask.title,
            description: externalTask.description,
            status: externalTask.status,
          })
          results.updated++
        } else {
          await this.createTask({
            title: externalTask.title,
            description: externalTask.description,
            status: externalTask.status || 'todo',
            metadata: {
              external_id: externalTask.id,
              source: 'sync',
            },
          })
          results.created++
        }
      } catch (error) {
        results.errors.push({ task: externalTask, error })
        logger.error('❌ [Dart AI] Sync error for task:', externalTask, error)
      }
    }

    logger.info(
      `🔄 [Dart AI] Sync completed: ${results.created} created, ${results.updated} updated, ${results.errors.length} errors`
    )
    return results
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
            return new Error('Invalid API key or unauthorized access')
          case 404:
            return new Error('Resource not found')
          case 429:
            return new Error('Rate limit exceeded')
          case 500:
            return new Error('Dart AI server error')
          default:
            return new Error(`API error (${status}): ${message}`)
        }
      } else if (error.request) {
        // Запрос был отправлен, но ответа не получено
        return new Error('Network error: Unable to reach Dart AI API')
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
