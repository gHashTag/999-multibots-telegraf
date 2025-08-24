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
const testServerUrl = 'http://localhost:2999'

beforeAll(() => {
  // Override .env file settings for tests
  process.env.ORIGIN = testServerUrl
  process.env.NODE_ENV = 'test'
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

// Mock config module
mock.module('../../src/config', () => ({
  ORIGIN: testServerUrl,
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

    it('should create axios client with correct configuration', async () => {
      // Create a fresh service instance with the test environment
      process.env.ORIGIN = testServerUrl
      const testService = new DartAIService()
      
      // Clear previous calls
      mockAxiosCreate.mockClear()
      
      // Trigger HTTP client creation by making a call
      mockAxiosClient.get.mockResolvedValueOnce({ data: { success: true, data: [] } })
      await testService.getSpaces()
      
      expect(mockAxiosCreate).toHaveBeenCalled()
      const createCall = mockAxiosCreate.mock.calls[0]
      const config = createCall[0]
      
      expect(config.baseURL).toBe(testServerUrl)
      expect(config.headers['Content-Type']).toBe('application/json')
      expect(config.timeout).toBe(30000)
      expect(config.headers['Authorization']).toBeUndefined()
    })

    it('should handle missing server URL', () => {
      delete process.env.ORIGIN
      const unconfiguredService = new DartAIService()
      
      expect(unconfiguredService.isConfigured()).toBe(true) // uses localhost fallback
      
      // Восстанавливаем URL
      process.env.ORIGIN = testServerUrl
    })
  })

  describe('🏢 Space Operations', () => {
    it('should get spaces successfully', async () => {
      mockAxiosClient.get.mockResolvedValueOnce({
        data: {
          success: true,
          data: [mockSpace],
        },
      })

      const spaces = await dartAIService.getSpaces()

      expect(mockAxiosClient.get).toHaveBeenCalledWith('/api/dart-ai/spaces')
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

      await expect(dartAIService.getSpaces()).rejects.toThrow('Failed to fetch spaces')
    })

    it('should handle server error', async () => {
      mockAxiosClient.get.mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 500, data: { error: 'Server error' } },
      })

      await expect(dartAIService.getSpaces()).rejects.toThrow('Server error')
    })
  })

  describe('📋 Task CRUD Operations', () => {
    describe('Get Tasks', () => {
      it('should get tasks from default space', async () => {
        mockAxiosClient.get.mockResolvedValueOnce({
          data: {
            success: true,
            data: [mockTask],
          },
        })

        const tasks = await dartAIService.getTasks()

        expect(mockAxiosClient.get).toHaveBeenCalledWith('/api/dart-ai/tasks/default')
        expect(tasks).toEqual([mockTask])
      })

      it('should get tasks from specific space', async () => {
        mockAxiosClient.get.mockResolvedValueOnce({
          data: {
            success: true,
            data: [mockTask],
          },
        })

        const tasks = await dartAIService.getTasks('custom-space')

        expect(mockAxiosClient.get).toHaveBeenCalledWith('/api/dart-ai/tasks/custom-space')
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

        expect(mockAxiosClient.get).toHaveBeenCalledWith('/api/dart-ai/tasks/default/task-abc123')
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

        expect(mockAxiosClient.post).toHaveBeenCalledWith('/api/dart-ai/tasks/default', taskData)
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

        expect(mockAxiosClient.post).toHaveBeenCalledWith('/api/dart-ai/tasks/custom-space', taskData)
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

        expect(mockAxiosClient.put).toHaveBeenCalledWith('/api/dart-ai/tasks/default/task-abc123', updates)
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

        expect(mockAxiosClient.put).toHaveBeenCalledWith('/api/dart-ai/tasks/default/task-abc123', {
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

        expect(mockAxiosClient.put).toHaveBeenCalledWith('/api/dart-ai/tasks/default/task-abc123', {
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

        expect(mockAxiosClient.delete).toHaveBeenCalledWith('/api/dart-ai/tasks/default/task-abc123')
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

      const createdTask = {
        ...mockTask,
        title: '[GitHub #456] Bug in authentication',
        metadata: {
          github_issue: 456,
          repository: 'company/project',
          source: 'github',
        },
      }

      mockAxiosClient.post.mockResolvedValueOnce({
        data: {
          success: true,
          data: createdTask,
        },
      })

      const task = await dartAIService.createTaskFromGitHubIssue(githubIssue)

      expect(mockAxiosClient.post).toHaveBeenCalledWith('/api/dart-ai/github-issue', {
        issue: githubIssue,
        spaceId: 'default',
      })
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

      const createdTask = {
        ...mockTask,
        title: '[GitHub #789] Critical security vulnerability',
        priority: 'high',
        tags: ['security', 'critical', 'high'],
        metadata: {
          github_issue: 789,
          repository: 'security/audit',
          source: 'github',
        },
      }

      mockAxiosClient.post.mockResolvedValueOnce({
        data: {
          success: true,
          data: createdTask,
        },
      })

      const task = await dartAIService.createTaskFromGitHubIssue(githubIssue, 'security-space')

      expect(mockAxiosClient.post).toHaveBeenCalledWith('/api/dart-ai/github-issue', {
        issue: githubIssue,
        spaceId: 'security-space',
      })
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

      // Mock bulk sync response
      mockAxiosClient.post.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            created: 2,
            updated: 0,
            errors: [],
          },
        },
      })

      const result = await dartAIService.syncWithExternalSystem(externalTasks)

      expect(result.created).toBe(2)
      expect(result.updated).toBe(0)
      expect(result.errors).toHaveLength(0)
      expect(mockAxiosClient.post).toHaveBeenCalledWith('/api/dart-ai/bulk-sync', {
        tasks: externalTasks,
        spaceId: 'default',
      })
    })

    it('should sync external tasks and update existing ones', async () => {
      const externalTasks = [
        { id: 'ext-1', title: 'Updated External Task', description: 'Updated desc', status: 'done' },
      ]

      // Mock bulk sync response
      mockAxiosClient.post.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            created: 0,
            updated: 1,
            errors: [],
          },
        },
      })

      const result = await dartAIService.syncWithExternalSystem(externalTasks)

      expect(result.created).toBe(0)
      expect(result.updated).toBe(1)
      expect(result.errors).toHaveLength(0)
      expect(mockAxiosClient.post).toHaveBeenCalledWith('/api/dart-ai/bulk-sync', {
        tasks: externalTasks,
        spaceId: 'default',
      })
    })

    it('should handle sync errors gracefully', async () => {
      const externalTasks = [
        { id: 'ext-error', title: 'Error Task', status: 'todo' },
      ]

      // Mock bulk sync error
      mockAxiosClient.post.mockRejectedValueOnce(new Error('Sync failed'))

      await expect(dartAIService.syncWithExternalSystem(externalTasks)).rejects.toThrow('Sync failed')

      expect(mockAxiosClient.post).toHaveBeenCalledWith('/api/dart-ai/bulk-sync', {
        tasks: externalTasks,
        spaceId: 'default',
      })
    })
  })

  describe('❌ Error Handling', () => {
    describe('Axios Error Handling', () => {
      it('should handle 401 unauthorized', async () => {
        mockAxiosClient.get.mockRejectedValueOnce({
          isAxiosError: true,
          response: { status: 401, data: { error: 'Invalid token' } },
        })

        await expect(dartAIService.getTasks()).rejects.toThrow('Unauthorized access to Dart AI service')
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

        await expect(dartAIService.getTasks()).rejects.toThrow('Server error')
      })

      it('should handle network errors', async () => {
        mockAxiosClient.get.mockRejectedValueOnce({
          isAxiosError: true,
          request: {},
          message: 'Network timeout',
        })

        await expect(dartAIService.getTasks()).rejects.toThrow('Network error: Unable to reach server')
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
      it('should work with fallback URL when ORIGIN not configured', async () => {
        delete process.env.ORIGIN
        const serviceWithFallback = new DartAIService()

        expect(serviceWithFallback.isConfigured()).toBe(true)

        process.env.ORIGIN = testServerUrl
      })
    })
  })

  describe('🔍 Method Validation', () => {
    it('should use correct HTTP methods for each operation', async () => {
      const successResponse = { data: { success: true, data: mockTask } }

      // Test GET methods
      mockAxiosClient.get.mockResolvedValueOnce({ data: { success: true, data: [] } })
      await dartAIService.getSpaces()
      expect(mockAxiosClient.get).toHaveBeenCalledWith('/api/dart-ai/spaces')

      mockAxiosClient.get.mockResolvedValueOnce({ data: { success: true, data: [] } })
      await dartAIService.getTasks()
      expect(mockAxiosClient.get).toHaveBeenCalledWith('/api/dart-ai/tasks/default')

      mockAxiosClient.get.mockResolvedValueOnce(successResponse)
      await dartAIService.getTask('test')
      expect(mockAxiosClient.get).toHaveBeenCalledWith('/api/dart-ai/tasks/default/test')

      // Test POST method
      mockAxiosClient.post.mockResolvedValueOnce(successResponse)
      await dartAIService.createTask({ title: 'Test' })
      expect(mockAxiosClient.post).toHaveBeenCalledWith('/api/dart-ai/tasks/default', { title: 'Test' })

      // Test PUT method
      mockAxiosClient.put.mockResolvedValueOnce(successResponse)
      await dartAIService.updateTask('test', { status: 'done' })
      expect(mockAxiosClient.put).toHaveBeenCalledWith('/api/dart-ai/tasks/default/test', { status: 'done' })

      // Test DELETE method
      mockAxiosClient.delete.mockResolvedValueOnce({ data: { success: true, data: { deleted: true } } })
      await dartAIService.deleteTask('test')
      expect(mockAxiosClient.delete).toHaveBeenCalledWith('/api/dart-ai/tasks/default/test')
    })

    it('should use correct space IDs in requests', async () => {
      const customSpaceId = 'my-custom-space'
      const successResponse = { data: { success: true, data: mockTask } }

      mockAxiosClient.get.mockResolvedValue({ data: { success: true, data: [] } })
      mockAxiosClient.post.mockResolvedValue(successResponse)
      mockAxiosClient.put.mockResolvedValue(successResponse)
      mockAxiosClient.delete.mockResolvedValue({ data: { success: true, data: { deleted: true } } })

      await dartAIService.getTasks(customSpaceId)
      expect(mockAxiosClient.get).toHaveBeenCalledWith(`/api/dart-ai/tasks/${customSpaceId}`)

      await dartAIService.getTask('test', customSpaceId)
      expect(mockAxiosClient.get).toHaveBeenCalledWith(`/api/dart-ai/tasks/${customSpaceId}/test`)

      await dartAIService.createTask({ title: 'Test' }, customSpaceId)
      expect(mockAxiosClient.post).toHaveBeenCalledWith(`/api/dart-ai/tasks/${customSpaceId}`, { title: 'Test' })

      await dartAIService.updateTask('test', { status: 'done' }, customSpaceId)
      expect(mockAxiosClient.put).toHaveBeenCalledWith(`/api/dart-ai/tasks/${customSpaceId}/test`, { status: 'done' })

      await dartAIService.deleteTask('test', customSpaceId)
      expect(mockAxiosClient.delete).toHaveBeenCalledWith(`/api/dart-ai/tasks/${customSpaceId}/test`)
    })
  })
})