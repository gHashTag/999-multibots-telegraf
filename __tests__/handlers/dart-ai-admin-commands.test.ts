import { describe, it, expect, beforeEach, mock, beforeAll, afterAll } from 'bun:test'
import {
  handleDartAICommand,
  handleCreateDartAITaskFromGithub,
} from '../../src/handlers/dartAIAdminCommands'
import { makeMockContext } from '../utils/mockTelegrafContext'
import { DartAITask } from '../../src/interfaces/dart-ai.interface'

// Mock переменных окружения
const originalEnv = process.env

beforeAll(() => {
  process.env.DART_AI_API_KEY = 'test_api_key_for_commands'
})

afterAll(() => {
  process.env = originalEnv
})

// Mock зависимостей
const mockDartAIService = {
  isConfigured: mock(() => true),
  getSpaces: mock(),
  getTasks: mock(),
  getTask: mock(),
  createTask: mock(),
  updateTask: mock(),
  deleteTask: mock(),
  updateTaskStatus: mock(),
  updateTaskPriority: mock(),
  createTaskFromGitHubIssue: mock(),
}

mock.module('../../src/services/dart-ai.service', () => ({
  dartAIService: mockDartAIService,
}))

const mockIsRussianFromState = mock(() => true)

mock.module('../../src/helpers/centralizedLanguage', () => ({
  isRussianFromState: mockIsRussianFromState,
}))

const mockLogger = {
  error: mock(),
  info: mock(),
  warn: mock(),
}

mock.module('../../src/utils/logger', () => ({
  logger: mockLogger,
}))

const mockValidateCreateDartAITask = mock((data: any) => data)
const mockValidateUpdateDartAITask = mock((data: any) => data)

mock.module('../../src/interfaces/dart-ai.interface', () => ({
  validateCreateDartAITask: mockValidateCreateDartAITask,
  validateUpdateDartAITask: mockValidateUpdateDartAITask,
  DartAITaskStatus: {
    todo: 'todo',
    in_progress: 'in_progress', 
    done: 'done',
    cancelled: 'cancelled',
  },
  DartAITaskPriority: {
    low: 'low',
    medium: 'medium',
    high: 'high',
    critical: 'critical',
  },
}))

// Тестовые данные
const mockSpace = {
  id: 'space-123',
  name: 'Test Space',
  description: 'Test space description',
  color: '#4285f4',
  is_archived: false,
  created_at: '2025-08-24T12:00:00Z',
  updated_at: '2025-08-24T12:00:00Z',
  members_count: 3,
}

const mockTask: DartAITask = {
  id: 'task-456',
  title: 'Test Task for Commands',
  description: 'This is a test task for command testing',
  status: 'todo',
  priority: 'medium',
  type: 'task',
  tags: ['test', 'command'],
  due_date: null,
  start_date: null,
  completed_at: null,
  assignee: { id: 'user-1', email: 'test@test.com', name: 'Test User', avatar: null },
  assignees: [],
  reporter: null,
  parent_id: null,
  subtasks: [],
  dependencies: [],
  blocks: [],
  estimate_minutes: 120,
  time_spent_minutes: 0,
  metadata: { source: 'command-test' },
  space_id: 'space-123',
  created_at: '2025-08-24T12:00:00Z',
  updated_at: '2025-08-24T12:00:00Z',
  created_by: null,
  updated_by: null,
  external_id: null,
  external_url: null,
}

describe('Dart AI Admin Commands Unit Tests', () => {
  beforeEach(() => {
    // Сброс всех моков
    mockDartAIService.isConfigured.mockClear?.()
    mockDartAIService.getSpaces.mockClear?.()
    mockDartAIService.getTasks.mockClear?.()
    mockDartAIService.getTask.mockClear?.()
    mockDartAIService.createTask.mockClear?.()
    mockDartAIService.updateTask.mockClear?.()
    mockDartAIService.deleteTask.mockClear?.()
    mockDartAIService.updateTaskStatus.mockClear?.()
    mockDartAIService.updateTaskPriority.mockClear?.()
    mockDartAIService.createTaskFromGitHubIssue.mockClear?.()
    mockIsRussianFromState.mockClear?.()
    mockLogger.error.mockClear?.()
    mockValidateCreateDartAITask.mockClear?.()
    mockValidateUpdateDartAITask.mockClear?.()

    // Дефолтные возвращаемые значения
    mockDartAIService.isConfigured.mockReturnValue?.(true)
    mockIsRussianFromState.mockReturnValue?.(true)
    mockValidateCreateDartAITask.mockImplementation?.((data) => data)
    mockValidateUpdateDartAITask.mockImplementation?.((data) => data)
  })

  describe('🔧 Service Configuration Checks', () => {
    it('should show error when Dart AI not configured', async () => {
      mockDartAIService.isConfigured.mockReturnValue?.(false)
      
      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai spaces',
        chat: ctx.chat,
        from: ctx.from,
      }

      await handleDartAICommand(ctx)

      expect(ctx.reply).toHaveBeenCalledWith(
        '❌ Dart AI не настроен. Требуется переменная окружения DART_AI_API_KEY'
      )
    })

    it('should show error for invalid command format', async () => {
      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        // Убираем text чтобы симулировать не-текстовое сообщение
        chat: ctx.chat,
        from: ctx.from,
      } as any

      await handleDartAICommand(ctx)

      expect(ctx.reply).toHaveBeenCalledWith('❌ Неверный формат команды')
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
  })

  describe('🏢 Spaces Command', () => {
    it('should list spaces successfully', async () => {
      mockDartAIService.getSpaces.mockResolvedValueOnce([mockSpace])

      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai spaces',
        chat: ctx.chat,
        from: ctx.from,
      }

      await handleDartAICommand(ctx)

      expect(ctx.reply).toHaveBeenCalledWith('⏳ Загружаю список пространств...')
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('🏢 **Пространства (1):**'),
        { parse_mode: 'Markdown' }
      )
      expect(mockDartAIService.getSpaces).toHaveBeenCalledTimes(1)
    })

    it('should handle empty spaces list', async () => {
      mockDartAIService.getSpaces.mockResolvedValueOnce([])

      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai spaces',
        chat: ctx.chat,
        from: ctx.from,
      }

      await handleDartAICommand(ctx)

      expect(ctx.reply).toHaveBeenCalledWith('📭 Пространства не найдены')
    })
  })

  describe('📋 Tasks Command', () => {
    it('should list tasks from default space', async () => {
      mockDartAIService.getTasks.mockResolvedValueOnce([mockTask])

      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai tasks',
        chat: ctx.chat,
        from: ctx.from,
      }

      await handleDartAICommand(ctx)

      expect(ctx.reply).toHaveBeenCalledWith('⏳ Загружаю задачи...')
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('📋 **Задачи в пространстве "default" (1):**'),
        { parse_mode: 'Markdown' }
      )
      expect(mockDartAIService.getTasks).toHaveBeenCalledWith('default')
    })

    it('should list tasks from specific space', async () => {
      mockDartAIService.getTasks.mockResolvedValueOnce([mockTask])

      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai tasks custom-space',
        chat: ctx.chat,
        from: ctx.from,
      }

      await handleDartAICommand(ctx)

      expect(mockDartAIService.getTasks).toHaveBeenCalledWith('custom-space')
    })

    it('should handle empty tasks list', async () => {
      mockDartAIService.getTasks.mockResolvedValueOnce([])

      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai tasks',
        chat: ctx.chat,
        from: ctx.from,
      }

      await handleDartAICommand(ctx)

      expect(ctx.reply).toHaveBeenCalledWith('📭 Задачи не найдены')
    })

    it('should group tasks by status', async () => {
      const tasks = [
        { ...mockTask, id: 'task-1', status: 'todo', title: 'Todo Task' },
        { ...mockTask, id: 'task-2', status: 'in_progress', title: 'In Progress Task' },
        { ...mockTask, id: 'task-3', status: 'done', title: 'Done Task' },
      ] as any[]

      mockDartAIService.getTasks.mockResolvedValueOnce(tasks)

      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai tasks',
        chat: ctx.chat,
        from: ctx.from,
      }

      await handleDartAICommand(ctx)

      const replyCall = ctx.reply.mock.calls?.find(call => 
        call[0]?.includes('📋 **Задачи в пространстве')
      )
      expect(replyCall).toBeDefined()
      expect(replyCall?.[0]).toContain('К выполнению') // todo status in Russian
      expect(replyCall?.[0]).toContain('В работе') // in_progress status in Russian  
      expect(replyCall?.[0]).toContain('Выполнено') // done status in Russian
    })
  })

  describe('✨ Create Task Command', () => {
    it('should create task with title only', async () => {
      mockDartAIService.createTask.mockResolvedValueOnce(mockTask)

      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai create "New Task"',
        chat: ctx.chat,
        from: ctx.from,
      }

      await handleDartAICommand(ctx)

      expect(ctx.reply).toHaveBeenCalledWith('⏳ Создаю задачу...')
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('✅ Задача создана!'),
        { parse_mode: 'Markdown' }
      )
      expect(mockDartAIService.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '"New Task"',
          status: 'todo',
          priority: 'medium',
          metadata: expect.objectContaining({
            created_by: 'telegram_bot',
          }),
        })
      )
    })

    it('should create task with title and description', async () => {
      mockDartAIService.createTask.mockResolvedValueOnce(mockTask)

      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai create "Task Title" "Task Description"',
        chat: ctx.chat,
        from: ctx.from,
      }

      await handleDartAICommand(ctx)

      expect(mockDartAIService.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '"Task Title"',
          description: '"Task Description"',
        })
      )
    })

    it('should show error when no title provided', async () => {
      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai create',
        chat: ctx.chat,
        from: ctx.from,
      }

      await handleDartAICommand(ctx)

      expect(ctx.reply).toHaveBeenCalledWith(
        '❌ Укажите название задачи: `/dartai create "Название" ["Описание"]`',
        { parse_mode: 'Markdown' }
      )
    })

    it('should handle creation error', async () => {
      mockValidateCreateDartAITask.mockImplementationOnce(() => {
        throw new Error('Validation failed')
      })

      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai create "Test Task"',
        chat: ctx.chat,
        from: ctx.from,
      }

      await handleDartAICommand(ctx)

      expect(ctx.reply).toHaveBeenCalledWith(
        '❌ Ошибка создания задачи: Validation failed'
      )
    })
  })

  describe('👁️ Get Task Command', () => {
    it('should get task by ID', async () => {
      mockDartAIService.getTask.mockResolvedValueOnce(mockTask)

      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai get task-456',
        chat: ctx.chat,
        from: ctx.from,
      }

      await handleDartAICommand(ctx)

      expect(ctx.reply).toHaveBeenCalledWith('⏳ Загружаю задачу...')
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('📝 **Test Task for Commands**'),
        { parse_mode: 'Markdown' }
      )
      expect(mockDartAIService.getTask).toHaveBeenCalledWith('task-456')
    })

    it('should show error when no task ID provided', async () => {
      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai get',
        chat: ctx.chat,
        from: ctx.from,
      }

      await handleDartAICommand(ctx)

      expect(ctx.reply).toHaveBeenCalledWith(
        '❌ Укажите ID задачи: `/dartai get <task_id>`',
        { parse_mode: 'Markdown' }
      )
    })
  })

  describe('📊 Status Command', () => {
    it('should update task status', async () => {
      const updatedTask = { ...mockTask, status: 'done' }
      mockDartAIService.updateTaskStatus.mockResolvedValueOnce(updatedTask)

      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai status task-456 done',
        chat: ctx.chat,
        from: ctx.from,
      }

      await handleDartAICommand(ctx)

      expect(ctx.reply).toHaveBeenCalledWith('⏳ Обновляю статус...')
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('✅ Статус обновлен!'),
        { parse_mode: 'Markdown' }
      )
      expect(mockDartAIService.updateTaskStatus).toHaveBeenCalledWith('task-456', 'done')
    })

    it('should validate status values', async () => {
      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai status task-456 invalid_status',
        chat: ctx.chat,
        from: ctx.from,
      }

      await handleDartAICommand(ctx)

      expect(ctx.reply).toHaveBeenCalledWith(
        '❌ Неверный статус. Доступные: todo, in_progress, done, cancelled'
      )
      expect(mockDartAIService.updateTaskStatus).not.toHaveBeenCalled()
    })

    it('should show error when parameters missing', async () => {
      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai status task-456',
        chat: ctx.chat,
        from: ctx.from,
      }

      await handleDartAICommand(ctx)

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('❌ Использование: `/dartai status <task_id> <status>`'),
        { parse_mode: 'Markdown' }
      )
    })
  })

  describe('⚡ Priority Command', () => {
    it('should update task priority', async () => {
      const updatedTask = { ...mockTask, priority: 'high' }
      mockDartAIService.updateTaskPriority.mockResolvedValueOnce(updatedTask)

      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai priority task-456 high',
        chat: ctx.chat,
        from: ctx.from,
      }

      await handleDartAICommand(ctx)

      expect(ctx.reply).toHaveBeenCalledWith('⏳ Обновляю приоритет...')
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('✅ Приоритет обновлен!'),
        { parse_mode: 'Markdown' }
      )
      expect(mockDartAIService.updateTaskPriority).toHaveBeenCalledWith('task-456', 'high')
    })

    it('should validate priority values', async () => {
      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai priority task-456 invalid_priority',
        chat: ctx.chat,
        from: ctx.from,
      }

      await handleDartAICommand(ctx)

      expect(ctx.reply).toHaveBeenCalledWith(
        '❌ Неверный приоритет. Доступные: low, medium, high, critical'
      )
      expect(mockDartAIService.updateTaskPriority).not.toHaveBeenCalled()
    })
  })

  describe('🗑️ Delete Task Command', () => {
    it('should delete task successfully', async () => {
      mockDartAIService.getTask.mockResolvedValueOnce(mockTask)
      mockDartAIService.deleteTask.mockResolvedValueOnce(true)

      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai delete task-456',
        chat: ctx.chat,
        from: ctx.from,
      }

      await handleDartAICommand(ctx)

      expect(ctx.reply).toHaveBeenCalledWith('⏳ Удаляю задачу...')
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('✅ Задача удалена!'),
        { parse_mode: 'Markdown' }
      )
      expect(mockDartAIService.getTask).toHaveBeenCalledWith('task-456')
      expect(mockDartAIService.deleteTask).toHaveBeenCalledWith('task-456')
    })

    it('should handle delete failure', async () => {
      mockDartAIService.getTask.mockResolvedValueOnce(mockTask)
      mockDartAIService.deleteTask.mockResolvedValueOnce(false)

      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai delete task-456',
        chat: ctx.chat,
        from: ctx.from,
      }

      await handleDartAICommand(ctx)

      expect(ctx.reply).toHaveBeenCalledWith('❌ Не удалось удалить задачу')
    })

    it('should show error when no task ID provided', async () => {
      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai delete',
        chat: ctx.chat,
        from: ctx.from,
      }

      await handleDartAICommand(ctx)

      expect(ctx.reply).toHaveBeenCalledWith(
        '❌ Укажите ID задачи: `/dartai delete <task_id>`',
        { parse_mode: 'Markdown' }
      )
    })
  })

  describe('📊 Stats Command', () => {
    it('should show task statistics', async () => {
      const tasks = [
        { ...mockTask, id: 'task-1', status: 'todo', priority: 'high' },
        { ...mockTask, id: 'task-2', status: 'done', priority: 'medium' },
        { ...mockTask, id: 'task-3', status: 'in_progress', priority: 'high' },
      ] as any[]

      mockDartAIService.getTasks.mockResolvedValueOnce(tasks)

      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai stats',
        chat: ctx.chat,
        from: ctx.from,
      }

      await handleDartAICommand(ctx)

      expect(ctx.reply).toHaveBeenCalledWith('⏳ Собираю статистику...')
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('📊 **Статистика Dart AI**'),
        { parse_mode: 'Markdown' }
      )
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('📋 Всего задач: 3'),
        { parse_mode: 'Markdown' }
      )
    })

    it('should handle stats error', async () => {
      mockDartAIService.getTasks.mockRejectedValueOnce(new Error('API Error'))

      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai stats',
        chat: ctx.chat,
        from: ctx.from,
      }

      await handleDartAICommand(ctx)

      expect(ctx.reply).toHaveBeenCalledWith(
        '❌ Ошибка получения статистики: API Error'
      )
    })
  })

  describe('🔄 Sync Command', () => {
    it('should show not implemented message', async () => {
      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai sync',
        chat: ctx.chat,
        from: ctx.from,
      }

      await handleDartAICommand(ctx)

      expect(ctx.reply).toHaveBeenCalledWith(
        '⏳ Синхронизация пока не реализована. Эта функция будет добавлена позже.'
      )
    })
  })

  describe('❌ Error Handling', () => {
    it('should handle unknown commands', async () => {
      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai unknown_command',
        chat: ctx.chat,
        from: ctx.from,
      }

      await handleDartAICommand(ctx)

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('🎯 **Dart AI Task Manager**'),
        { parse_mode: 'Markdown' }
      )
    })

    it('should handle service errors', async () => {
      mockDartAIService.getSpaces.mockRejectedValueOnce(new Error('Service Unavailable'))

      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai spaces',
        chat: ctx.chat,
        from: ctx.from,
      }

      await handleDartAICommand(ctx)

      expect(ctx.reply).toHaveBeenCalledWith(
        '❌ Ошибка выполнения команды: Service Unavailable'
      )
      expect(mockLogger.error).toHaveBeenCalledWith(
        '❌ [Dart AI Admin] Command error:',
        expect.any(Error)
      )
    })
  })

  describe('🌐 Language Support', () => {
    it('should show English interface when not Russian', async () => {
      mockIsRussianFromState.mockReturnValue?.(false)
      mockDartAIService.getSpaces.mockResolvedValueOnce([])

      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai spaces',
        chat: ctx.chat,
        from: ctx.from,
      }

      await handleDartAICommand(ctx)

      expect(ctx.reply).toHaveBeenCalledWith('⏳ Loading spaces...')
      expect(ctx.reply).toHaveBeenCalledWith('📭 No spaces found')
    })

    it('should show English error messages', async () => {
      mockIsRussianFromState.mockReturnValue?.(false)
      mockDartAIService.isConfigured.mockReturnValue?.(false)

      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai spaces',
        chat: ctx.chat,
        from: ctx.from,
      }

      await handleDartAICommand(ctx)

      expect(ctx.reply).toHaveBeenCalledWith(
        '❌ Dart AI is not configured. DART_AI_API_KEY environment variable is required'
      )
    })
  })
})

describe('🐙 GitHub Integration Command Tests', () => {
  beforeEach(() => {
    mockDartAIService.isConfigured.mockReturnValue?.(true)
    mockDartAIService.createTaskFromGitHubIssue.mockClear?.()
    mockIsRussianFromState.mockReturnValue?.(true)
    mockLogger.error.mockClear?.()
  })

  describe('✨ Create Task from GitHub Issue', () => {
    it('should create task from GitHub issue', async () => {
      const githubTask = {
        ...mockTask,
        title: '[GitHub #123] Test Issue',
        metadata: {
          github_issue: 123,
          repository: 'owner/repo',
          source: 'github',
        },
      }

      mockDartAIService.createTaskFromGitHubIssue.mockResolvedValueOnce(githubTask)

      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai_github owner/repo 123',
        chat: ctx.chat,
        from: ctx.from,
      }

      await handleCreateDartAITaskFromGithub(ctx)

      expect(ctx.reply).toHaveBeenCalledWith('⏳ Создаю задачу из GitHub Issue...')
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('✅ Задача создана из GitHub Issue!'),
        { parse_mode: 'Markdown' }
      )
      expect(mockDartAIService.createTaskFromGitHubIssue).toHaveBeenCalledWith({
        title: 'Issue #123',
        body: 'GitHub Issue from owner/repo',
        number: 123,
        repository: 'owner/repo',
        labels: [],
      })
    })

    it('should show usage when parameters missing', async () => {
      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai_github owner/repo',
        chat: ctx.chat,
        from: ctx.from,
      }

      await handleCreateDartAITaskFromGithub(ctx)

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('📝 Использование: `/dartai_github <repository> <issue_number>`'),
        { parse_mode: 'Markdown' }
      )
    })

    it('should validate issue number', async () => {
      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai_github owner/repo invalid_number',
        chat: ctx.chat,
        from: ctx.from,
      }

      await handleCreateDartAITaskFromGithub(ctx)

      expect(ctx.reply).toHaveBeenCalledWith('❌ Неверный номер Issue')
    })

    it('should handle creation error', async () => {
      mockDartAIService.createTaskFromGitHubIssue.mockRejectedValueOnce(new Error('GitHub API Error'))

      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai_github owner/repo 456',
        chat: ctx.chat,
        from: ctx.from,
      }

      await handleCreateDartAITaskFromGithub(ctx)

      expect(ctx.reply).toHaveBeenCalledWith(
        '❌ Ошибка создания задачи: GitHub API Error'
      )
      expect(mockLogger.error).toHaveBeenCalledWith(
        '❌ [Dart AI Admin] GitHub integration error:',
        expect.any(Error)
      )
    })

    it('should handle not configured service', async () => {
      mockDartAIService.isConfigured.mockReturnValue?.(false)

      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/dartai_github owner/repo 789',
        chat: ctx.chat,
        from: ctx.from,
      }

      await handleCreateDartAITaskFromGithub(ctx)

      expect(ctx.reply).toHaveBeenCalledWith('❌ Dart AI не настроен')
      expect(mockDartAIService.createTaskFromGitHubIssue).not.toHaveBeenCalled()
    })

    it('should handle invalid message format', async () => {
      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now() / 1000,
        // Убираем text
        chat: ctx.chat,
        from: ctx.from,
      } as any

      await handleCreateDartAITaskFromGithub(ctx)

      expect(ctx.reply).toHaveBeenCalledWith('❌ Неверный формат команды')
    })
  })
})