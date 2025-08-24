import { describe, it, expect, beforeEach, mock, beforeAll, afterAll } from 'bun:test'
import { DartAIService } from '../../src/services/dart-ai.service'
import { handleDartAICommand, handleCreateDartAITaskFromGithub } from '../../src/handlers/dartAIAdminCommands'
import { makeMockContext } from '../utils/mockTelegrafContext'
import {
  validateCreateDartAITask,
  validateUpdateDartAITask,
  DartAITask,
  DartAITaskStatus,
  DartAITaskPriority,
} from '../../src/interfaces/dart-ai.interface'

// Mock переменных окружения для тестов
const originalEnv = process.env
const testApiKey = 'test_dart_ai_api_key_12345'

beforeAll(() => {
  process.env.DART_AI_API_KEY = testApiKey
})

afterAll(() => {
  process.env = originalEnv
})

// Mock axios для тестирования без реальных API вызовов
const mockAxiosCreate = mock(() => ({
  get: mock(),
  post: mock(),
  put: mock(),
  delete: mock(),
}))

const mockAxiosClient = {
  get: mock(),
  post: mock(),
  put: mock(),
  delete: mock(),
}

mock.module('axios', () => ({
  default: {
    create: mockAxiosCreate.mockReturnValue(mockAxiosClient),
    isAxiosError: mock((error: any) => error.isAxiosError === true),
  },
}))

// Mock других зависимостей
const mockIsRussianFromState = mock(() => true)
const mockLogger = {
  info: mock(),
  warn: mock(),
  error: mock(),
}

mock.module('../../src/helpers/centralizedLanguage', () => ({
  isRussianFromState: mockIsRussianFromState,
}))

mock.module('../../src/utils/logger', () => ({
  logger: mockLogger,
}))

// Тестовые данные
const mockDartAITask: DartAITask = {
  id: 'test-task-123',
  title: 'Test Task',
  description: 'Test task description',
  status: 'todo',
  priority: 'medium',
  type: 'task',
  tags: ['test', 'integration'],
  due_date: null,
  start_date: null,
  completed_at: null,
  assignee: null,
  assignees: [],
  reporter: null,
  parent_id: null,
  subtasks: [],
  dependencies: [],
  blocks: [],
  estimate_minutes: null,
  time_spent_minutes: 0,
  metadata: { source: 'test' },
  space_id: 'default',
  created_at: '2025-08-24T10:00:00Z',
  updated_at: '2025-08-24T10:00:00Z',
  created_by: null,
  updated_by: null,
  external_id: null,
  external_url: null,
}

const mockDartAISpaces = [
  {
    id: 'default',
    name: 'Default Space',
    description: 'Default workspace',
    color: '#4285f4',
    is_archived: false,
    created_at: '2025-08-24T09:00:00Z',
    updated_at: '2025-08-24T09:00:00Z',
    members_count: 5,
  },
  {
    id: 'test-space',
    name: 'Test Space',
    description: 'Test workspace for integration tests',
    color: '#34a853',
    is_archived: false,
    created_at: '2025-08-24T09:00:00Z',
    updated_at: '2025-08-24T09:00:00Z',
    members_count: 2,
  },
]

describe('Dart AI Integration Tests', () => {
  let dartAIService: DartAIService

  beforeEach(() => {
    // Сбрасываем все моки
    mockAxiosClient.get.mockClear?.()
    mockAxiosClient.post.mockClear?.()
    mockAxiosClient.put.mockClear?.()
    mockAxiosClient.delete.mockClear?.()
    mockIsRussianFromState.mockClear?.()
    mockLogger.info.mockClear?.()
    mockLogger.warn.mockClear?.()
    mockLogger.error.mockClear?.()

    // Создаем новый экземпляр сервиса
    dartAIService = new DartAIService()
  })

  describe('🔧 DartAIService Configuration', () => {
    it('should be properly configured with API key', () => {
      expect(dartAIService.isConfigured()).toBe(true)
    })

    it('should create HTTP client with correct configuration', () => {
      expect(mockAxiosCreate).toHaveBeenCalledWith({
        baseURL: 'https://api.dart.ai',
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      })
    })
  })

  describe('🏢 Spaces Management', () => {
    it('should fetch spaces successfully', async () => {
      mockAxiosClient.get.mockResolvedValueOnce({
        data: {
          success: true,
          data: { spaces: mockDartAISpaces },
        },
      })

      const spaces = await dartAIService.getSpaces()

      expect(mockAxiosClient.get).toHaveBeenCalledWith('/v0/spaces')
      expect(spaces).toEqual(mockDartAISpaces)
      expect(mockLogger.info).toHaveBeenCalledWith('🎯 [Dart AI] Fetching user spaces')
      expect(mockLogger.info).toHaveBeenCalledWith('✅ [Dart AI] Found 2 spaces')
    })

    it('should handle API error when fetching spaces', async () => {
      mockAxiosClient.get.mockRejectedValueOnce({
        isAxiosError: true,
        response: {
          status: 401,
          data: { error: 'Invalid API key' },
        },
      })

      await expect(dartAIService.getSpaces()).rejects.toThrow('Invalid API key or unauthorized access')
    })
  })

  describe('📋 Task Management', () => {
    it('should fetch tasks successfully', async () => {
      mockAxiosClient.get.mockResolvedValueOnce({
        data: {
          success: true,
          data: { tasks: [mockDartAITask] },
        },
      })

      const tasks = await dartAIService.getTasks('default')

      expect(mockAxiosClient.get).toHaveBeenCalledWith('/v0/spaces/default/tasks')
      expect(tasks).toEqual([mockDartAITask])
      expect(mockLogger.info).toHaveBeenCalledWith('🎯 [Dart AI] Fetching tasks from space: default')
      expect(mockLogger.info).toHaveBeenCalledWith('✅ [Dart AI] Found 1 tasks')
    })

    it('should get specific task by ID', async () => {
      mockAxiosClient.get.mockResolvedValueOnce({
        data: {
          success: true,
          data: mockDartAITask,
        },
      })

      const task = await dartAIService.getTask('test-task-123')

      expect(mockAxiosClient.get).toHaveBeenCalledWith('/v0/spaces/default/tasks/test-task-123')
      expect(task).toEqual(mockDartAITask)
      expect(mockLogger.info).toHaveBeenCalledWith('🎯 [Dart AI] Fetching task: test-task-123')
      expect(mockLogger.info).toHaveBeenCalledWith('✅ [Dart AI] Task found: Test Task')
    })

    it('should create task successfully', async () => {
      const createTaskData = {
        title: 'New Test Task',
        description: 'New task for testing',
        status: 'todo' as DartAITaskStatus,
        priority: 'high' as DartAITaskPriority,
        tags: ['new', 'test'],
      }

      mockAxiosClient.post.mockResolvedValueOnce({
        data: {
          success: true,
          data: { ...mockDartAITask, ...createTaskData },
        },
      })

      const task = await dartAIService.createTask(createTaskData)

      expect(mockAxiosClient.post).toHaveBeenCalledWith('/v0/spaces/default/tasks', createTaskData)
      expect(task.title).toBe(createTaskData.title)
      expect(task.priority).toBe(createTaskData.priority)
      expect(mockLogger.info).toHaveBeenCalledWith('🎯 [Dart AI] Creating task: New Test Task')
    })

    it('should update task successfully', async () => {
      const updateData = {
        status: 'done' as DartAITaskStatus,
        description: 'Updated task description',
      }

      const updatedTask = { ...mockDartAITask, ...updateData }

      mockAxiosClient.put.mockResolvedValueOnce({
        data: {
          success: true,
          data: updatedTask,
        },
      })

      const task = await dartAIService.updateTask('test-task-123', updateData)

      expect(mockAxiosClient.put).toHaveBeenCalledWith('/v0/spaces/default/tasks/test-task-123', updateData)
      expect(task.status).toBe('done')
      expect(task.description).toBe('Updated task description')
      expect(mockLogger.info).toHaveBeenCalledWith('🎯 [Dart AI] Updating task: test-task-123')
    })

    it('should delete task successfully', async () => {
      mockAxiosClient.delete.mockResolvedValueOnce({
        data: {
          success: true,
          data: { deleted: true },
        },
      })

      const result = await dartAIService.deleteTask('test-task-123')

      expect(mockAxiosClient.delete).toHaveBeenCalledWith('/v0/spaces/default/tasks/test-task-123')
      expect(result).toBe(true)
      expect(mockLogger.info).toHaveBeenCalledWith('🎯 [Dart AI] Deleting task: test-task-123')
      expect(mockLogger.info).toHaveBeenCalledWith('✅ [Dart AI] Task deleted: test-task-123')
    })
  })

  describe('🔄 Status and Priority Management', () => {
    it('should update task status', async () => {
      const updatedTask = { ...mockDartAITask, status: 'in_progress' as DartAITaskStatus }

      mockAxiosClient.put.mockResolvedValueOnce({
        data: {
          success: true,
          data: updatedTask,
        },
      })

      const task = await dartAIService.updateTaskStatus('test-task-123', 'in_progress')

      expect(mockAxiosClient.put).toHaveBeenCalledWith('/v0/spaces/default/tasks/test-task-123', {
        status: 'in_progress',
      })
      expect(task.status).toBe('in_progress')
    })

    it('should update task priority', async () => {
      const updatedTask = { ...mockDartAITask, priority: 'critical' as DartAITaskPriority }

      mockAxiosClient.put.mockResolvedValueOnce({
        data: {
          success: true,
          data: updatedTask,
        },
      })

      const task = await dartAIService.updateTaskPriority('test-task-123', 'critical')

      expect(mockAxiosClient.put).toHaveBeenCalledWith('/v0/spaces/default/tasks/test-task-123', {
        priority: 'critical',
      })
      expect(task.priority).toBe('critical')
    })
  })

  describe('🐙 GitHub Integration', () => {
    it('should create task from GitHub issue', async () => {
      const githubIssue = {
        title: 'Bug in API',
        body: 'There is a bug in the API endpoint',
        number: 123,
        repository: 'owner/repo',
        labels: ['bug', 'high'],
      }

      const expectedTask = {
        ...mockDartAITask,
        title: '[GitHub #123] Bug in API',
        description: 'There is a bug in the API endpoint',
        priority: 'high',
        tags: ['bug', 'high'],
        metadata: {
          github_issue: 123,
          repository: 'owner/repo',
          source: 'github',
        },
      }

      mockAxiosClient.post.mockResolvedValueOnce({
        data: {
          success: true,
          data: expectedTask,
        },
      })

      const task = await dartAIService.createTaskFromGitHubIssue(githubIssue)

      expect(task.title).toContain('#123')
      expect(task.title).toContain('Bug in API')
      expect(task.priority).toBe('high')
      expect(task.metadata).toMatchObject({
        github_issue: 123,
        repository: 'owner/repo',
        source: 'github',
      })
    })
  })

  describe('❌ Error Handling', () => {
    it('should handle network errors', async () => {
      mockAxiosClient.get.mockRejectedValueOnce({
        isAxiosError: true,
        request: {},
        message: 'Network Error',
      })

      await expect(dartAIService.getTasks()).rejects.toThrow('Network error: Unable to reach Dart AI API')
    })

    it('should handle rate limiting', async () => {
      mockAxiosClient.get.mockRejectedValueOnce({
        isAxiosError: true,
        response: {
          status: 429,
          data: { error: 'Rate limit exceeded' },
        },
      })

      await expect(dartAIService.getTasks()).rejects.toThrow('Rate limit exceeded')
    })

    it('should handle server errors', async () => {
      mockAxiosClient.get.mockRejectedValueOnce({
        isAxiosError: true,
        response: {
          status: 500,
          data: { error: 'Internal server error' },
        },
      })

      await expect(dartAIService.getTasks()).rejects.toThrow('Dart AI server error')
    })
  })

  describe('🤖 Admin Commands Integration', () => {
    it('should handle dartai spaces command', async () => {
      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai spaces',
        chat: ctx.chat,
        from: ctx.from,
      }

      mockAxiosClient.get.mockResolvedValueOnce({
        data: {
          success: true,
          data: { spaces: mockDartAISpaces },
        },
      })

      await handleDartAICommand(ctx)

      expect(ctx.reply).toHaveBeenCalledWith('⏳ Загружаю список пространств...')
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('🏢 **Пространства (2):**'),
        { parse_mode: 'Markdown' }
      )
    })

    it('should handle dartai create command', async () => {
      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai create "New Task" "Task description"',
        chat: ctx.chat,
        from: ctx.from,
      }

      const createdTask = {
        ...mockDartAITask,
        title: 'New Task',
        description: 'Task description',
      }

      mockAxiosClient.post.mockResolvedValueOnce({
        data: {
          success: true,
          data: createdTask,
        },
      })

      await handleDartAICommand(ctx)

      expect(ctx.reply).toHaveBeenCalledWith('⏳ Создаю задачу...')
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('✅ Задача создана!'),
        { parse_mode: 'Markdown' }
      )
    })

    it('should handle dartai_github command', async () => {
      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai_github owner/repo 123',
        chat: ctx.chat,
        from: ctx.from,
      }

      const githubTask = {
        ...mockDartAITask,
        title: '[GitHub #123] Issue #123',
        metadata: {
          github_issue: 123,
          repository: 'owner/repo',
          source: 'github',
        },
      }

      mockAxiosClient.post.mockResolvedValueOnce({
        data: {
          success: true,
          data: githubTask,
        },
      })

      await handleCreateDartAITaskFromGithub(ctx)

      expect(ctx.reply).toHaveBeenCalledWith('⏳ Создаю задачу из GitHub Issue...')
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('✅ Задача создана из GitHub Issue!'),
        { parse_mode: 'Markdown' }
      )
    })

    it('should show help when no action provided', async () => {
      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai',
        chat: ctx.chat,
        from: ctx.from,
      }

      await handleDartAICommand(ctx)

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('🎯 **Dart AI Task Manager**'),
        { parse_mode: 'Markdown' }
      )
    })

    it('should handle error when API key not configured', async () => {
      // Временно убираем API ключ
      const originalApiKey = process.env.DART_AI_API_KEY
      delete process.env.DART_AI_API_KEY

      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai spaces',
        chat: ctx.chat,
        from: ctx.from,
      }

      const unconfiguredService = new DartAIService()
      expect(unconfiguredService.isConfigured()).toBe(false)

      await handleDartAICommand(ctx)

      expect(ctx.reply).toHaveBeenCalledWith(
        '❌ Dart AI не настроен. Требуется переменная окружения DART_AI_API_KEY'
      )

      // Восстанавливаем API ключ
      process.env.DART_AI_API_KEY = originalApiKey
    })
  })
})

describe('🧪 ZOD Validation Tests', () => {
  describe('Task Creation Validation', () => {
    it('should validate correct task data', () => {
      const validTaskData = {
        title: 'Valid Task',
        description: 'Valid description',
        status: 'todo' as DartAITaskStatus,
        priority: 'medium' as DartAITaskPriority,
        tags: ['valid', 'test'],
      }

      expect(() => validateCreateDartAITask(validTaskData)).not.toThrow()
    })

    it('should reject task with empty title', () => {
      const invalidTaskData = {
        title: '',
        description: 'Valid description',
        status: 'todo' as DartAITaskStatus,
        priority: 'medium' as DartAITaskPriority,
      }

      expect(() => validateCreateDartAITask(invalidTaskData)).toThrow()
    })

    it('should reject task with invalid status', () => {
      const invalidTaskData = {
        title: 'Valid Task',
        description: 'Valid description',
        status: 'invalid_status' as any,
        priority: 'medium' as DartAITaskPriority,
      }

      expect(() => validateCreateDartAITask(invalidTaskData)).toThrow()
    })

    it('should reject task with too many tags', () => {
      const invalidTaskData = {
        title: 'Valid Task',
        description: 'Valid description',
        tags: Array(25).fill('tag'), // Максимум 20 тегов
      }

      expect(() => validateCreateDartAITask(invalidTaskData)).toThrow()
    })
  })

  describe('Task Update Validation', () => {
    it('should validate partial task updates', () => {
      const validUpdateData = {
        status: 'done' as DartAITaskStatus,
        priority: 'high' as DartAITaskPriority,
      }

      expect(() => validateUpdateDartAITask(validUpdateData)).not.toThrow()
    })

    it('should allow empty update data', () => {
      const emptyUpdateData = {}

      expect(() => validateUpdateDartAITask(emptyUpdateData)).not.toThrow()
    })
  })
})