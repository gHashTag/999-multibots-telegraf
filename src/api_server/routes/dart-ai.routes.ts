import express from 'express'
import axios from 'axios'
import { logger } from '@/utils/logger'
import {
  DartAITask,
  DartAISpace,
  CreateDartAITaskRequest,
  UpdateDartAITaskRequest,
  validateCreateDartAITask,
  validateUpdateDartAITask,
} from '@/interfaces/dart-ai.interface'

const router = express.Router()

// Dart AI API configuration
const DART_AI_API_KEY = process.env.DART_AI_API_KEY || ''
const DART_AI_BASE_URL = 'https://api.dart.ai'

// HTTP клиент для Dart AI
const dartAIClient = axios.create({
  baseURL: DART_AI_BASE_URL,
  headers: {
    'Authorization': `Bearer ${DART_AI_API_KEY}`,
    'Content-Type': 'application/json',
  },
  timeout: 30000,
})

/**
 * Middleware для проверки конфигурации Dart AI
 */
const checkDartAIConfig = (req: any, res: any, next: any) => {
  if (!DART_AI_API_KEY) {
    return res.status(500).json({
      success: false,
      error: 'Dart AI API key not configured',
      message: 'DART_AI_API_KEY environment variable is required',
    })
  }
  next()
}

/**
 * Обработчик ошибок Dart AI API
 */
const handleDartAIError = (error: any, res: any) => {
  logger.error('❌ [Dart AI API] Error:', error)

  if (axios.isAxiosError(error)) {
    if (error.response) {
      const status = error.response.status
      const message = error.response.data?.error || error.response.data?.message || error.message

      switch (status) {
        case 401:
          return res.status(401).json({
            success: false,
            error: 'unauthorized',
            message: 'Invalid API key or unauthorized access',
          })
        case 404:
          return res.status(404).json({
            success: false,
            error: 'not_found',
            message: 'Resource not found',
          })
        case 429:
          return res.status(429).json({
            success: false,
            error: 'rate_limit',
            message: 'Rate limit exceeded',
          })
        default:
          return res.status(status).json({
            success: false,
            error: 'api_error',
            message: `Dart AI API error: ${message}`,
          })
      }
    } else if (error.request) {
      return res.status(503).json({
        success: false,
        error: 'network_error',
        message: 'Unable to reach Dart AI API',
      })
    }
  }

  return res.status(500).json({
    success: false,
    error: 'internal_error',
    message: 'Internal server error',
  })
}

// ====== SPACES ENDPOINTS ======

/**
 * GET /api/dart-ai/spaces
 * Получить список пространств
 */
router.get('/dart-ai/spaces', checkDartAIConfig, async (req: any, res: any) => {
  try {
    logger.info('🎯 [Dart AI API] Fetching spaces')

    const response = await dartAIClient.get('/v0/spaces')

    if (response.data.success) {
      logger.info(`✅ [Dart AI API] Found ${response.data.data.spaces.length} spaces`)
      res.json({
        success: true,
        data: response.data.data.spaces,
      })
    } else {
      res.status(400).json({
        success: false,
        error: response.data.error || 'Failed to fetch spaces',
      })
    }
  } catch (error) {
    handleDartAIError(error, res)
  }
})

// ====== TASKS ENDPOINTS ======

/**
 * GET /api/dart-ai/tasks/:spaceId
 * Получить задачи из пространства
 */
router.get('/dart-ai/tasks/:spaceId', checkDartAIConfig, async (req: any, res: any) => {
  try {
    const { spaceId } = req.params
    logger.info(`🎯 [Dart AI API] Fetching tasks from space: ${spaceId}`)

    const response = await dartAIClient.get(`/v0/spaces/${spaceId}/tasks`)

    if (response.data.success) {
      logger.info(`✅ [Dart AI API] Found ${response.data.data.tasks.length} tasks`)
      res.json({
        success: true,
        data: response.data.data.tasks,
      })
    } else {
      res.status(400).json({
        success: false,
        error: response.data.error || 'Failed to fetch tasks',
      })
    }
  } catch (error) {
    handleDartAIError(error, res)
  }
})

/**
 * GET /api/dart-ai/tasks/:spaceId/:taskId
 * Получить задачу по ID
 */
router.get('/dart-ai/tasks/:spaceId/:taskId', checkDartAIConfig, async (req: any, res: any) => {
  try {
    const { spaceId, taskId } = req.params
    logger.info(`🎯 [Dart AI API] Fetching task: ${taskId}`)

    const response = await dartAIClient.get(`/v0/spaces/${spaceId}/tasks/${taskId}`)

    if (response.data.success) {
      logger.info(`✅ [Dart AI API] Task found: ${response.data.data.title}`)
      res.json({
        success: true,
        data: response.data.data,
      })
    } else {
      res.status(400).json({
        success: false,
        error: response.data.error || 'Task not found',
      })
    }
  } catch (error) {
    handleDartAIError(error, res)
  }
})

/**
 * POST /api/dart-ai/tasks/:spaceId
 * Создать новую задачу
 */
router.post('/dart-ai/tasks/:spaceId', checkDartAIConfig, async (req: any, res: any) => {
  try {
    const { spaceId } = req.params
    const taskData = req.body

    // Валидация входных данных
    try {
      validateCreateDartAITask(taskData)
    } catch (validationError) {
      return res.status(400).json({
        success: false,
        error: 'validation_error',
        message: validationError instanceof Error ? validationError.message : 'Invalid task data',
        details: validationError,
      })
    }

    logger.info(`🎯 [Dart AI API] Creating task: ${taskData.title}`)

    const response = await dartAIClient.post(`/v0/spaces/${spaceId}/tasks`, taskData)

    if (response.data.success) {
      logger.info(`✅ [Dart AI API] Task created: ${response.data.data.id}`)
      res.status(201).json({
        success: true,
        data: response.data.data,
      })
    } else {
      res.status(400).json({
        success: false,
        error: response.data.error || 'Failed to create task',
      })
    }
  } catch (error) {
    handleDartAIError(error, res)
  }
})

/**
 * PUT /api/dart-ai/tasks/:spaceId/:taskId
 * Обновить существующую задачу
 */
router.put('/dart-ai/tasks/:spaceId/:taskId', checkDartAIConfig, async (req: any, res: any) => {
  try {
    const { spaceId, taskId } = req.params
    const updates = req.body

    // Валидация входных данных
    try {
      validateUpdateDartAITask(updates)
    } catch (validationError) {
      return res.status(400).json({
        success: false,
        error: 'validation_error',
        message: validationError instanceof Error ? validationError.message : 'Invalid update data',
        details: validationError,
      })
    }

    logger.info(`🎯 [Dart AI API] Updating task: ${taskId}`)

    const response = await dartAIClient.put(`/v0/spaces/${spaceId}/tasks/${taskId}`, updates)

    if (response.data.success) {
      logger.info(`✅ [Dart AI API] Task updated: ${response.data.data.title}`)
      res.json({
        success: true,
        data: response.data.data,
      })
    } else {
      res.status(400).json({
        success: false,
        error: response.data.error || 'Failed to update task',
      })
    }
  } catch (error) {
    handleDartAIError(error, res)
  }
})

/**
 * DELETE /api/dart-ai/tasks/:spaceId/:taskId
 * Удалить задачу
 */
router.delete('/dart-ai/tasks/:spaceId/:taskId', checkDartAIConfig, async (req: any, res: any) => {
  try {
    const { spaceId, taskId } = req.params
    logger.info(`🎯 [Dart AI API] Deleting task: ${taskId}`)

    const response = await dartAIClient.delete(`/v0/spaces/${spaceId}/tasks/${taskId}`)

    if (response.data.success) {
      logger.info(`✅ [Dart AI API] Task deleted: ${taskId}`)
      res.json({
        success: true,
        data: { deleted: response.data.data.deleted },
      })
    } else {
      res.status(400).json({
        success: false,
        error: response.data.error || 'Failed to delete task',
      })
    }
  } catch (error) {
    handleDartAIError(error, res)
  }
})

// ====== HELPER ENDPOINTS ======

/**
 * POST /api/dart-ai/github-issue
 * Создать задачу из GitHub Issue
 */
router.post('/dart-ai/github-issue', checkDartAIConfig, async (req: any, res: any) => {
  try {
    const { issue, spaceId = 'default' } = req.body

    if (!issue || !issue.title || !issue.number || !issue.repository) {
      return res.status(400).json({
        success: false,
        error: 'validation_error',
        message: 'Invalid GitHub issue data. Required: title, number, repository',
      })
    }

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

    logger.info(`🎯 [Dart AI API] Creating task from GitHub Issue #${issue.number}`)

    const response = await dartAIClient.post(`/v0/spaces/${spaceId}/tasks`, taskData)

    if (response.data.success) {
      logger.info(`✅ [Dart AI API] GitHub task created: ${response.data.data.id}`)
      res.status(201).json({
        success: true,
        data: response.data.data,
        source: 'github_issue',
      })
    } else {
      res.status(400).json({
        success: false,
        error: response.data.error || 'Failed to create task from GitHub issue',
      })
    }
  } catch (error) {
    handleDartAIError(error, res)
  }
})

/**
 * GET /api/dart-ai/status
 * Проверить статус интеграции с Dart AI
 */
router.get('/dart-ai/status', (req: any, res: any) => {
  const isConfigured = !!DART_AI_API_KEY
  
  res.json({
    success: true,
    data: {
      configured: isConfigured,
      api_key_present: isConfigured,
      base_url: DART_AI_BASE_URL,
      timestamp: new Date().toISOString(),
    },
  })
})

// ====== BULK OPERATIONS ======

/**
 * POST /api/dart-ai/bulk-sync
 * Массовая синхронизация задач
 */
router.post('/dart-ai/bulk-sync', checkDartAIConfig, async (req: any, res: any) => {
  try {
    const { tasks, spaceId = 'default' } = req.body

    if (!Array.isArray(tasks)) {
      return res.status(400).json({
        success: false,
        error: 'validation_error',
        message: 'Tasks must be an array',
      })
    }

    const results = {
      created: 0,
      updated: 0,
      errors: [] as any[],
    }

    logger.info(`🎯 [Dart AI API] Starting bulk sync of ${tasks.length} tasks`)

    // Получаем существующие задачи
    const existingTasksResponse = await dartAIClient.get(`/v0/spaces/${spaceId}/tasks`)
    const existingTasks = existingTasksResponse.data.success ? existingTasksResponse.data.data.tasks : []

    for (const task of tasks) {
      try {
        const existingTask = existingTasks.find((t: any) => t.metadata?.external_id === task.id)

        if (existingTask) {
          // Обновляем существующую задачу
          const updateData = {
            title: task.title,
            description: task.description,
            status: task.status || 'todo',
          }
          
          await dartAIClient.put(`/v0/spaces/${spaceId}/tasks/${existingTask.id}`, updateData)
          results.updated++
        } else {
          // Создаем новую задачу
          const createData = {
            title: task.title,
            description: task.description,
            status: task.status || 'todo',
            metadata: {
              external_id: task.id,
              source: 'bulk_sync',
            },
          }
          
          await dartAIClient.post(`/v0/spaces/${spaceId}/tasks`, createData)
          results.created++
        }
      } catch (error) {
        results.errors.push({
          task: task,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    logger.info(`✅ [Dart AI API] Bulk sync completed: ${results.created} created, ${results.updated} updated, ${results.errors.length} errors`)

    res.json({
      success: true,
      data: results,
    })
  } catch (error) {
    handleDartAIError(error, res)
  }
})

export default router