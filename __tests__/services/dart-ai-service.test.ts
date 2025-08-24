import { describe, it, expect, beforeEach, mock, beforeAll, afterAll } from 'bun:test'
import { DartAIService } from '../../src/services/dart-ai.service'
import {
  DartAITask,
  DartAITaskStatus,
  DartAITaskPriority,
  CreateDartAITaskRequest,
} from '../../src/interfaces/dart-ai.interface'

// Mock переменных окружения
const originalEnv = process.env
const testApiKey = 'test_dart_ai_api_key_unit_test'

beforeAll(() => {
  process.env.DART_AI_API_KEY = testApiKey
})

afterAll(() => {
  process.env = originalEnv
})

// Mock axios
const mockAxiosClient = {
  get: mock(),
  post: mock(),
  put: mock(),
  delete: mock(),
}

const mockAxiosCreate = mock(() => mockAxiosClient)

mock.module('axios', () => ({
  default: {
    create: mockAxiosCreate,
    isAxiosError: mock((error: any) => error.isAxiosError === true),
  },
}))

// Mock logger
const mockLogger = {
  info: mock(),
  warn: mock(),
  error: mock(),
}

mock.module('../../src/utils/logger', () => ({
  logger: mockLogger,
}))

// Тестовые данные
const mockTask: DartAITask = {
  id: 'task-abc123',
  title: 'Unit Test Task',
  description: 'Task for unit testing',
  status: 'todo',
  priority: 'medium',
  type: 'task',
  tags: ['unit-test'],
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
  estimate_minutes: 60,
  time_spent_minutes: 0,
  metadata: { test: true },
  space_id: 'default',
  created_at: '2025-08-24T12:00:00Z',
  updated_at: '2025-08-24T12:00:00Z',
  created_by: null,
  updated_by: null,
  external_id: null,
  external_url: null,
}

const mockSpace = {
  id: 'test-space-123',
  name: 'Unit Test Space',
  description: 'Space for unit testing',
  color: '#ff5722',
  is_archived: false,
  created_at: '2025-08-24T11:00:00Z',
  updated_at: '2025-08-24T11:00:00Z',
  members_count: 1,
}

describe('DartAIService Unit Tests', () => {
  let dartAIService: DartAIService

  beforeEach(() => {
    // Сброс всех моков
    mockAxiosClient.get.mockClear?.()
    mockAxiosClient.post.mockClear?.()
    mockAxiosClient.put.mockClear?.()
    mockAxiosClient.delete.mockClear?.()
    mockAxiosCreate.mockClear?.()
    mockLogger.info.mockClear?.()
    mockLogger.warn.mockClear?.()
    mockLogger.error.mockClear?.()

    // Создаем новый экземпляр сервиса
    dartAIService = new DartAIService()
  })

  describe('🔧 Service Initialization', () => {
    it('should initialize with API key from environment', () => {
      expect(dartAIService.isConfigured()).toBe(true)
    })

    it('should create axios client with correct configuration', () => {
      expect(mockAxiosCreate).toHaveBeenCalledWith({
        baseURL: 'https://api.dart.ai',
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      })
    })

    it('should handle missing API key', () => {
      delete process.env.DART_AI_API_KEY
      const unconfiguredService = new DartAIService()
      
      expect(unconfiguredService.isConfigured()).toBe(false)
      expect(mockLogger.warn).toHaveBeenCalledWith('⚠️ [Dart AI] API key not configured')
      
      // Восстанавливаем ключ
      process.env.DART_AI_API_KEY = testApiKey
    })
  })

  describe('🏢 Space Operations', () => {
    it('should get spaces successfully', async () => {
      mockAxiosClient.get.mockResolvedValueOnce({
        data: {
          success: true,
          data: { spaces: [mockSpace] },
        },
      })

      const spaces = await dartAIService.getSpaces()

      expect(mockAxiosClient.get).toHaveBeenCalledWith('/v0/spaces')
      expect(spaces).toEqual([mockSpace])
      expect(mockLogger.info).toHaveBeenCalledWith('🎯 [Dart AI] Fetching user spaces')
      expect(mockLogger.info).toHaveBeenCalledWith('✅ [Dart AI] Found 1 spaces')
    })

    it('should handle API error response', async () => {
      mockAxiosClient.get.mockResolvedValueOnce({
        data: {
          success: false,
          error: 'Permission denied',
        },
      })

      await expect(dartAIService.getSpaces()).rejects.toThrow('Permission denied')
    })

    it('should throw error when not configured', async () => {
      delete process.env.DART_AI_API_KEY
      const unconfiguredService = new DartAIService()

      await expect(unconfiguredService.getSpaces()).rejects.toThrow('Dart AI API key not configured')

      process.env.DART_AI_API_KEY = testApiKey
    })
  })

  describe('📋 Task CRUD Operations', () => {
    describe('Get Tasks', () => {
      it('should get tasks from default space', async () => {
        mockAxiosClient.get.mockResolvedValueOnce({
          data: {
            success: true,
            data: { tasks: [mockTask] },
          },
        })

        const tasks = await dartAIService.getTasks()

        expect(mockAxiosClient.get).toHaveBeenCalledWith('/v0/spaces/default/tasks')
        expect(tasks).toEqual([mockTask])
      })

      it('should get tasks from specific space', async () => {
        mockAxiosClient.get.mockResolvedValueOnce({
          data: {
            success: true,
            data: { tasks: [mockTask] },
          },
        })

        const tasks = await dartAIService.getTasks('custom-space')

        expect(mockAxiosClient.get).toHaveBeenCalledWith('/v0/spaces/custom-space/tasks')
        expect(tasks).toEqual([mockTask])
      })
    })

    describe('Get Single Task', () => {
      it('should get task by ID', async () => {
        mockAxiosClient.get.mockResolvedValueOnce({
          data: {
            success: true,
            data: mockTask,
          },
        })

        const task = await dartAIService.getTask('task-abc123')

        expect(mockAxiosClient.get).toHaveBeenCalledWith('/v0/spaces/default/tasks/task-abc123')
        expect(task).toEqual(mockTask)
        expect(mockLogger.info).toHaveBeenCalledWith('🎯 [Dart AI] Fetching task: task-abc123')
        expect(mockLogger.info).toHaveBeenCalledWith('✅ [Dart AI] Task found: Unit Test Task')
      })

      it('should handle task not found', async () => {
        mockAxiosClient.get.mockResolvedValueOnce({
          data: {
            success: false,
            error: 'Task not found',
          },
        })

        await expect(dartAIService.getTask('nonexistent')).rejects.toThrow('Task not found')
      })
    })

    describe('Create Task', () => {
      it('should create task with minimal data', async () => {
        const taskData: CreateDartAITaskRequest = {
          title: 'New Task',
          description: 'Task description',
        }

        const createdTask = { ...mockTask, ...taskData }

        mockAxiosClient.post.mockResolvedValueOnce({
          data: {
            success: true,
            data: createdTask,
          },
        })

        const task = await dartAIService.createTask(taskData)

        expect(mockAxiosClient.post).toHaveBeenCalledWith('/v0/spaces/default/tasks', taskData)
        expect(task.title).toBe(taskData.title)
        expect(task.description).toBe(taskData.description)
        expect(mockLogger.info).toHaveBeenCalledWith('🎯 [Dart AI] Creating task: New Task')
        expect(mockLogger.info).toHaveBeenCalledWith(`✅ [Dart AI] Task created: ${createdTask.id}`)
      })

      it('should create task with full data', async () => {
        const taskData: CreateDartAITaskRequest = {
          title: 'Comprehensive Task',
          description: 'Detailed description',
          status: 'in_progress',
          priority: 'high',
          tags: ['urgent', 'feature'],
          due_date: '2025-12-31T23:59:59Z',
          estimate_minutes: 240,
          metadata: { source: 'unit-test' },
        }

        const createdTask = { ...mockTask, ...taskData }

        mockAxiosClient.post.mockResolvedValueOnce({
          data: {
            success: true,
            data: createdTask,
          },
        })

        const task = await dartAIService.createTask(taskData, 'custom-space')

        expect(mockAxiosClient.post).toHaveBeenCalledWith('/v0/spaces/custom-space/tasks', taskData)
        expect(task.priority).toBe('high')
        expect(task.status).toBe('in_progress')
        expect(task.tags).toEqual(['urgent', 'feature'])
      })
    })

    describe('Update Task', () => {
      it('should update task fields', async () => {
        const updates = {
          status: 'done' as DartAITaskStatus,
          priority: 'critical' as DartAITaskPriority,
          description: 'Updated description',
        }

        const updatedTask = { ...mockTask, ...updates }

        mockAxiosClient.put.mockResolvedValueOnce({
          data: {
            success: true,
            data: updatedTask,
          },
        })

        const task = await dartAIService.updateTask('task-abc123', updates)

        expect(mockAxiosClient.put).toHaveBeenCalledWith('/v0/spaces/default/tasks/task-abc123', updates)
        expect(task.status).toBe('done')
        expect(task.priority).toBe('critical')
        expect(task.description).toBe('Updated description')
        expect(mockLogger.info).toHaveBeenCalledWith('🎯 [Dart AI] Updating task: task-abc123')
      })

      it('should update task status only', async () => {
        const newStatus = 'cancelled' as DartAITaskStatus
        const updatedTask = { ...mockTask, status: newStatus }

        mockAxiosClient.put.mockResolvedValueOnce({
          data: {
            success: true,
            data: updatedTask,
          },
        })

        const task = await dartAIService.updateTaskStatus('task-abc123', newStatus)

        expect(mockAxiosClient.put).toHaveBeenCalledWith('/v0/spaces/default/tasks/task-abc123', {
          status: newStatus,
        })
        expect(task.status).toBe(newStatus)
      })

      it('should update task priority only', async () => {
        const newPriority = 'low' as DartAITaskPriority
        const updatedTask = { ...mockTask, priority: newPriority }

        mockAxiosClient.put.mockResolvedValueOnce({
          data: {
            success: true,
            data: updatedTask,
          },
        })

        const task = await dartAIService.updateTaskPriority('task-abc123', newPriority)

        expect(mockAxiosClient.put).toHaveBeenCalledWith('/v0/spaces/default/tasks/task-abc123', {
          priority: newPriority,
        })
        expect(task.priority).toBe(newPriority)
      })
    })

    describe('Delete Task', () => {
      it('should delete task successfully', async () => {
        mockAxiosClient.delete.mockResolvedValueOnce({
          data: {
            success: true,
            data: { deleted: true },
          },
        })

        const result = await dartAIService.deleteTask('task-abc123')

        expect(mockAxiosClient.delete).toHaveBeenCalledWith('/v0/spaces/default/tasks/task-abc123')
        expect(result).toBe(true)
        expect(mockLogger.info).toHaveBeenCalledWith('🎯 [Dart AI] Deleting task: task-abc123')
        expect(mockLogger.info).toHaveBeenCalledWith('✅ [Dart AI] Task deleted: task-abc123')
      })

      it('should handle delete failure', async () => {
        mockAxiosClient.delete.mockResolvedValueOnce({
          data: {
            success: true,
            data: { deleted: false },
          },
        })

        const result = await dartAIService.deleteTask('task-abc123')

        expect(result).toBe(false)
      })
    })
  })

  describe('🐙 GitHub Integration', () => {
    it('should create task from GitHub issue with minimal data', async () => {
      const githubIssue = {
        title: 'Bug in authentication',
        number: 456,
        repository: 'company/project',
      }

      const expectedTaskData: CreateDartAITaskRequest = {
        title: '[GitHub #456] Bug in authentication',
        description: '',
        status: 'todo',
        priority: 'medium',
        tags: [],
        metadata: {
          github_issue: 456,
          repository: 'company/project',
          source: 'github',
        },
      }

      const createdTask = { ...mockTask, ...expectedTaskData }

      mockAxiosClient.post.mockResolvedValueOnce({
        data: {
          success: true,
          data: createdTask,
        },
      })

      const task = await dartAIService.createTaskFromGitHubIssue(githubIssue)

      expect(mockAxiosClient.post).toHaveBeenCalledWith('/v0/spaces/default/tasks', expectedTaskData)
      expect(task.title).toContain('#456')
      expect(task.title).toContain('Bug in authentication')
      expect(task.metadata).toMatchObject({
        github_issue: 456,
        repository: 'company/project',
        source: 'github',
      })
    })

    it('should create task from GitHub issue with full data', async () => {
      const githubIssue = {
        title: 'Critical security vulnerability',
        body: 'SQL injection found in user auth',
        number: 789,
        repository: 'security/audit',
        labels: ['security', 'critical', 'high'],
      }

      const expectedTaskData: CreateDartAITaskRequest = {
        title: '[GitHub #789] Critical security vulnerability',
        description: 'SQL injection found in user auth',
        status: 'todo',
        priority: 'high', // 'high' из labels
        tags: ['security', 'critical', 'high'],
        metadata: {
          github_issue: 789,
          repository: 'security/audit',
          source: 'github',
        },
      }

      const createdTask = { ...mockTask, ...expectedTaskData }

      mockAxiosClient.post.mockResolvedValueOnce({
        data: {
          success: true,
          data: createdTask,
        },
      })

      const task = await dartAIService.createTaskFromGitHubIssue(githubIssue, 'security-space')

      expect(mockAxiosClient.post).toHaveBeenCalledWith('/v0/spaces/security-space/tasks', expectedTaskData)
      expect(task.priority).toBe('high')
      expect(task.tags).toEqual(['security', 'critical', 'high'])
    })
  })

  describe('🔄 Sync Operations', () => {
    it('should sync external tasks and create new ones', async () => {
      const externalTasks = [
        { id: 'ext-1', title: 'External Task 1', description: 'Desc 1', status: 'todo' },
        { id: 'ext-2', title: 'External Task 2', description: 'Desc 2', status: 'in_progress' },
      ]

      // Mock getting existing tasks (empty)
      mockAxiosClient.get.mockResolvedValueOnce({
        data: { success: true, data: { tasks: [] } },
      })

      // Mock creating first task
      mockAxiosClient.post.mockResolvedValueOnce({
        data: { success: true, data: { ...mockTask, title: 'External Task 1' } },
      })

      // Mock creating second task
      mockAxiosClient.post.mockResolvedValueOnce({
        data: { success: true, data: { ...mockTask, title: 'External Task 2' } },
      })

      const result = await dartAIService.syncWithExternalSystem(externalTasks)

      expect(result.created).toBe(2)
      expect(result.updated).toBe(0)
      expect(result.errors).toHaveLength(0)
      expect(mockAxiosClient.post).toHaveBeenCalledTimes(2)
    })

    it('should sync external tasks and update existing ones', async () => {
      const existingTask = { ...mockTask, metadata: { external_id: 'ext-1' } }
      const externalTasks = [
        { id: 'ext-1', title: 'Updated External Task', description: 'Updated desc', status: 'done' },
      ]

      // Mock getting existing tasks
      mockAxiosClient.get.mockResolvedValueOnce({
        data: { success: true, data: { tasks: [existingTask] } },
      })

      // Mock updating task
      mockAxiosClient.put.mockResolvedValueOnce({
        data: { success: true, data: { ...existingTask, title: 'Updated External Task' } },
      })

      const result = await dartAIService.syncWithExternalSystem(externalTasks)

      expect(result.created).toBe(0)
      expect(result.updated).toBe(1)
      expect(result.errors).toHaveLength(0)
      expect(mockAxiosClient.put).toHaveBeenCalledWith(`/v0/spaces/default/tasks/${existingTask.id}`, {
        title: 'Updated External Task',
        description: 'Updated desc',
        status: 'done',
      })
    })

    it('should handle sync errors gracefully', async () => {
      const externalTasks = [
        { id: 'ext-error', title: 'Error Task', status: 'todo' },
      ]

      // Mock getting existing tasks
      mockAxiosClient.get.mockResolvedValueOnce({
        data: { success: true, data: { tasks: [] } },
      })

      // Mock create task error
      mockAxiosClient.post.mockRejectedValueOnce(new Error('Creation failed'))

      const result = await dartAIService.syncWithExternalSystem(externalTasks)

      expect(result.created).toBe(0)
      expect(result.updated).toBe(0)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].task).toEqual(externalTasks[0])
      expect(mockLogger.error).toHaveBeenCalledWith(
        '❌ [Dart AI] Sync error for task:',
        externalTasks[0],
        expect.any(Error)
      )
    })
  })

  describe('❌ Error Handling', () => {
    describe('Axios Error Handling', () => {
      it('should handle 401 unauthorized', async () => {
        mockAxiosClient.get.mockRejectedValueOnce({
          isAxiosError: true,
          response: { status: 401, data: { error: 'Invalid token' } },
        })

        await expect(dartAIService.getTasks()).rejects.toThrow('Invalid API key or unauthorized access')
      })

      it('should handle 404 not found', async () => {
        mockAxiosClient.get.mockRejectedValueOnce({
          isAxiosError: true,
          response: { status: 404, data: { error: 'Space not found' } },
        })

        await expect(dartAIService.getTasks()).rejects.toThrow('Resource not found')
      })

      it('should handle 429 rate limit', async () => {
        mockAxiosClient.get.mockRejectedValueOnce({
          isAxiosError: true,
          response: { status: 429, data: { message: 'Too many requests' } },
        })

        await expect(dartAIService.getTasks()).rejects.toThrow('Rate limit exceeded')
      })

      it('should handle 500 server error', async () => {
        mockAxiosClient.get.mockRejectedValueOnce({
          isAxiosError: true,
          response: { status: 500, data: { error: 'Server crashed' } },
        })

        await expect(dartAIService.getTasks()).rejects.toThrow('Dart AI server error')
      })

      it('should handle network errors', async () => {
        mockAxiosClient.get.mockRejectedValueOnce({
          isAxiosError: true,
          request: {},
          message: 'Network timeout',
        })

        await expect(dartAIService.getTasks()).rejects.toThrow('Network error: Unable to reach Dart AI API')
      })

      it('should handle request setup errors', async () => {
        mockAxiosClient.get.mockRejectedValueOnce({
          isAxiosError: true,
          message: 'Request configuration error',
        })

        await expect(dartAIService.getTasks()).rejects.toThrow('Request error: Request configuration error')
      })

      it('should handle unknown errors', async () => {
        mockAxiosClient.get.mockRejectedValueOnce('Unknown error string')

        await expect(dartAIService.getTasks()).rejects.toThrow('Unknown error string')
      })

      it('should handle non-Error objects', async () => {
        mockAxiosClient.get.mockRejectedValueOnce({ weird: 'error object' })

        await expect(dartAIService.getTasks()).rejects.toThrow('[object Object]')
      })
    })

    describe('Configuration Errors', () => {
      it('should throw error for all operations when not configured', async () => {
        delete process.env.DART_AI_API_KEY
        const unconfiguredService = new DartAIService()

        await expect(unconfiguredService.getSpaces()).rejects.toThrow('Dart AI API key not configured')
        await expect(unconfiguredService.getTasks()).rejects.toThrow('Dart AI API key not configured')
        await expect(unconfiguredService.getTask('test')).rejects.toThrow('Dart AI API key not configured')
        await expect(unconfiguredService.createTask({ title: 'Test' })).rejects.toThrow('Dart AI API key not configured')
        await expect(unconfiguredService.updateTask('test', {})).rejects.toThrow('Dart AI API key not configured')
        await expect(unconfiguredService.deleteTask('test')).rejects.toThrow('Dart AI API key not configured')

        process.env.DART_AI_API_KEY = testApiKey
      })
    })
  })

  describe('🔍 Method Validation', () => {
    it('should use correct HTTP methods for each operation', async () => {
      const successResponse = { data: { success: true, data: mockTask } }

      // Test GET methods
      mockAxiosClient.get.mockResolvedValueOnce({ data: { success: true, data: { spaces: [] } } })
      await dartAIService.getSpaces()
      expect(mockAxiosClient.get).toHaveBeenCalledWith('/v0/spaces')

      mockAxiosClient.get.mockResolvedValueOnce({ data: { success: true, data: { tasks: [] } } })
      await dartAIService.getTasks()
      expect(mockAxiosClient.get).toHaveBeenCalledWith('/v0/spaces/default/tasks')

      mockAxiosClient.get.mockResolvedValueOnce(successResponse)
      await dartAIService.getTask('test')
      expect(mockAxiosClient.get).toHaveBeenCalledWith('/v0/spaces/default/tasks/test')

      // Test POST method
      mockAxiosClient.post.mockResolvedValueOnce(successResponse)
      await dartAIService.createTask({ title: 'Test' })
      expect(mockAxiosClient.post).toHaveBeenCalledWith('/v0/spaces/default/tasks', { title: 'Test' })

      // Test PUT method
      mockAxiosClient.put.mockResolvedValueOnce(successResponse)
      await dartAIService.updateTask('test', { status: 'done' })
      expect(mockAxiosClient.put).toHaveBeenCalledWith('/v0/spaces/default/tasks/test', { status: 'done' })

      // Test DELETE method
      mockAxiosClient.delete.mockResolvedValueOnce({ data: { success: true, data: { deleted: true } } })
      await dartAIService.deleteTask('test')
      expect(mockAxiosClient.delete).toHaveBeenCalledWith('/v0/spaces/default/tasks/test')
    })

    it('should use correct space IDs in requests', async () => {
      const customSpaceId = 'my-custom-space'
      const successResponse = { data: { success: true, data: mockTask } }

      mockAxiosClient.get.mockResolvedValue({ data: { success: true, data: { tasks: [] } } })
      mockAxiosClient.post.mockResolvedValue(successResponse)
      mockAxiosClient.put.mockResolvedValue(successResponse)
      mockAxiosClient.delete.mockResolvedValue({ data: { success: true, data: { deleted: true } } })

      await dartAIService.getTasks(customSpaceId)
      expect(mockAxiosClient.get).toHaveBeenCalledWith(`/v0/spaces/${customSpaceId}/tasks`)

      await dartAIService.getTask('test', customSpaceId)
      expect(mockAxiosClient.get).toHaveBeenCalledWith(`/v0/spaces/${customSpaceId}/tasks/test`)

      await dartAIService.createTask({ title: 'Test' }, customSpaceId)
      expect(mockAxiosClient.post).toHaveBeenCalledWith(`/v0/spaces/${customSpaceId}/tasks`, { title: 'Test' })

      await dartAIService.updateTask('test', { status: 'done' }, customSpaceId)
      expect(mockAxiosClient.put).toHaveBeenCalledWith(`/v0/spaces/${customSpaceId}/tasks/test`, { status: 'done' })

      await dartAIService.deleteTask('test', customSpaceId)
      expect(mockAxiosClient.delete).toHaveBeenCalledWith(`/v0/spaces/${customSpaceId}/tasks/test`)
    })
  })
})