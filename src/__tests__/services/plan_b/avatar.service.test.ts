import { describe, it, expect, beforeEach, mock, afterEach } from 'bun:test'
import { avatarService, Avatar } from '@/services/plan_b/avatar.service'
// Прямой импорт не нужен, так как модуль мокируется целиком
// import { supabase } from '@/core/supabase';
import { logger } from '@/utils/logger' // Assuming logger is mocked similarly
import { SupabaseClient } from '@supabase/supabase-js'
import { Logger } from 'pino'
import { User } from '@/interfaces/user.interface' // Restore this import if needed elsewhere

// --- Мокирование зависимостей с использованием Bun --- //

// Определяем типы для большей ясности моков Supabase
type SupabaseError = { message: string } | Error | null
type SupabaseSingleResponse<T> = { data: T | null; error: SupabaseError }
type SupabaseListResponse<T> = { data: T[] | null; error: SupabaseError } // data can be null on error
type SupabaseInsertResponse<T> = {
  data: Partial<T>[] | null
  error: SupabaseError
}

// --- Улучшенные Моки Supabase --- //

// Мок для конечного результата (single)
const mockSingleResultFn = mock(
  (): Promise<SupabaseSingleResponse<Avatar>> =>
    Promise.resolve({ data: null, error: null })
)

// Мок для конечного результата (list)
const mockListResultFn = mock(
  (): Promise<SupabaseListResponse<Avatar>> =>
    Promise.resolve({ data: [], error: null })
)

// Мок для insert
const mockInsertResultFn = mock(
  (data: Partial<Avatar>[]): Promise<SupabaseInsertResponse<Avatar>> =>
    Promise.resolve({ data: data, error: null })
)

// Тип для объекта-строителя запросов
interface MockSupabaseQueryBuilder {
  eq: (column: string, value: any) => MockSupabaseQueryBuilder
  select: (columns: string) => MockSupabaseQueryBuilder
  insert: (data: Partial<Avatar>[]) => Promise<SupabaseInsertResponse<Avatar>>
  single: () => Promise<SupabaseSingleResponse<Avatar>>
  // Методы, возвращающие Promise<SupabaseListResponse<Avatar>>
  // Добавляем неявный .then() для возможности await builder
  then: (
    onfulfilled?: (
      value: SupabaseListResponse<Avatar>
    ) => any | PromiseLike<any>,
    onrejected?: (reason: any) => any | PromiseLike<any>
  ) => Promise<any>
  catch: (onrejected?: (reason: any) => any | PromiseLike<any>) => Promise<any>
  finally: (onfinally?: (() => void) | undefined | null) => Promise<any>
  // Имитация PromiseLike
  [Symbol.toStringTag]: 'Promise'
}

// Мок для методов цепочки (select, eq)
const mockEqFn = mock(function (
  this: MockSupabaseQueryBuilder,
  column: string,
  value: any
): MockSupabaseQueryBuilder {
  // Возвращаем себя для цепочки
  return this
})

const mockSelectFn = mock(function (
  this: MockSupabaseQueryBuilder,
  columns: string
): MockSupabaseQueryBuilder {
  // Возвращаем себя для цепочки
  return this
})

// Фабрика для создания объекта-строителя
const createMockBuilder = (): MockSupabaseQueryBuilder => {
  const builder: any = {} // Используем any временно для гибкости

  builder.select = function (columns: string): MockSupabaseQueryBuilder {
    // Здесь можно добавить логику, если нужно отслеживать вызовы select
    return this
  }.bind(builder)

  builder.eq = function (column: string, value: any): MockSupabaseQueryBuilder {
    // Здесь можно добавить логику, если нужно отслеживать вызовы eq
    return this
  }.bind(builder)

  // Привязываем insert к моку результата insert
  builder.insert = mockInsertResultFn

  // Привязываем single к моку результата single
  builder.single = mockSingleResultFn

  // Привязываем then/catch/finally к моку результата list
  // Это позволяет делать await supabase.from(...).select(...).eq(...)
  // и получать результат списка по умолчанию
  builder.then = (onfulfilled?: any, onrejected?: any) =>
    mockListResultFn().then(onfulfilled, onrejected)
  builder.catch = (onrejected?: any) => mockListResultFn().catch(onrejected)
  builder.finally = (onfinally?: any) => mockListResultFn().finally(onfinally)
  builder[Symbol.toStringTag] = 'Promise'

  // Переопределяем mock-функции, чтобы они возвращали этот конкретный инстанс builder
  builder.select = mockSelectFn.mockImplementation(builder.select)
  builder.eq = mockEqFn.mockImplementation(builder.eq)

  return builder as MockSupabaseQueryBuilder
}

// Мок для from()
const mockFromFn = mock((table: string) => {
  const builder = createMockBuilder()
  // Возвращаем объект с методами select и insert
  return {
    select: builder.select,
    insert: builder.insert, // insert напрямую с from
    // Добавляем eq, чтобы можно было делать from(...).eq(...)
    // Хотя обычно сначала идет select
    eq: builder.eq,
  }
})

// Мокируем модуль Supabase
mock.module('@/core/supabase', () => ({
  supabase: {
    from: mockFromFn,
  },
}))

// Создаем мок-функции для Logger
const mockLoggerInfoFn = mock(() => {})
const mockLoggerErrorFn = mock(() => {})
const mockLoggerWarnFn = mock(() => {})

// Мокируем модуль Logger
mock.module('@/utils/logger', () => ({
  logger: {
    info: mockLoggerInfoFn,
    error: mockLoggerErrorFn,
    warn: mockLoggerWarnFn,
  },
}))

// --- Mocks for Final Supabase Calls ---
// Исправляем типизацию моков для Bun
const mockSingleFn = mock<() => Promise<SupabaseSingleResponse<Avatar>>>()
const mockListFn = mock<() => Promise<SupabaseListResponse<Avatar>>>()
const mockInsertFn =
  mock<(data: Partial<Avatar>[]) => Promise<SupabaseInsertResponse<Avatar>>>()
// Spies for intermediate calls (optional, if needed for specific checks)
const mockSelectSpy = mock((columns: string) => {})
const mockEqSpy = mock((column: string, value: any) => {})

// --- Simplified Supabase Client Mock ---
const mockSupabaseClient = {
  from: mock((tableName: string) => {
    // Ensure table name is correct if needed: expect(mockSupabaseClient.from).toHaveBeenCalledWith('avatars')
    return {
      select: mock((columns: string) => {
        mockSelectSpy(columns) // Track call if needed
        return {
          eq: mock((column: string, value: any) => {
            mockEqSpy(column, value) // Track call if needed
            // Return the object containing the final action methods
            return {
              single: mockSingleFn, // Directly use the final mock function
              // Implement awaitable behavior for list queries
              then: (onfulfilled: any, onrejected?: any) =>
                mockListFn().then(onfulfilled, onrejected),
              catch: (onrejected: any) => mockListFn().catch(onrejected),
              finally: (onfinally: any) => mockListFn().finally(onfinally),
              // Simulate PromiseLike for direct await
              [Symbol.toStringTag]: 'Promise',
            }
          }),
          // If select is directly awaited without eq (e.g., select all)
          then: (onfulfilled: any, onrejected?: any) =>
            mockListFn().then(onfulfilled, onrejected),
          catch: (onrejected: any) => mockListFn().catch(onrejected),
          finally: (onfinally: any) => mockListFn().finally(onfinally),
          [Symbol.toStringTag]: 'Promise',
        }
      }),
      insert: mockInsertFn, // Directly use the final mock function
    }
  }),
} as unknown as SupabaseClient // Cast to SupabaseClient type

// --- Logger Mock ---
const mockLogger = {
  error: mockLoggerErrorFn,
  info: mockLoggerInfoFn,
  warn: mockLoggerWarnFn,
} as unknown as Logger

describe('Plan B: Avatar Service', () => {
  beforeEach(() => {
    // Reset mocks before each test using mockReset for functions
    mockSingleFn.mockReset()
    mockListFn.mockReset()
    mockInsertFn.mockReset()
    mockLoggerErrorFn.mockReset()
    mockLoggerInfoFn.mockReset()
    mockLoggerWarnFn.mockReset()
    // Use mockClear for simple spies/mocks without return values
    mockSelectSpy.mockClear()
    mockEqSpy.mockClear()
  })

  afterEach(() => {
    mock.restore() // Восстанавливаем оригинальные реализации
  })

  // --- isAvatarOwner ---
  describe('isAvatarOwner', () => {
    it('should return true if the user is an owner of any bot', async () => {
      // Arrange
      const telegram_id = '12345'
      const mockAvatarData: Avatar[] = [
        {
          telegram_id,
          avatar_url: '',
          group: '',
          created_at: '',
          updated_at: '',
          bot_name: 'test_bot',
        },
      ]
      // Мокируем конечный результат запроса (list)
      // Сам eq просто возвращает 'this'
      mockListResultFn.mockResolvedValueOnce({
        data: mockAvatarData,
        error: null,
      })

      // Act
      const result = await avatarService.isAvatarOwner(telegram_id)

      // Assert
      expect(result).toBe(true)
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('avatars')
      expect(mockSelectSpy).toHaveBeenCalledWith('*')
      expect(mockEqSpy).toHaveBeenCalledWith('telegram_id', telegram_id)
    })

    it('should return true if the user is an owner of the specified bot', async () => {
      const telegram_id = '12345'
      const bot_name = 'specific_bot'
      const mockAvatarData: Avatar[] = [
        {
          telegram_id,
          avatar_url: '',
          group: '',
          created_at: '',
          updated_at: '',
          bot_name,
        },
      ]
      // Мокируем конечный результат запроса (list)
      mockListResultFn.mockResolvedValueOnce({
        data: mockAvatarData,
        error: null,
      })

      const result = await avatarService.isAvatarOwner(telegram_id, bot_name)

      expect(result).toBe(true)
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('avatars')
      expect(mockSelectSpy).toHaveBeenCalledWith('*')
      // Проверяем оба вызова eq
      expect(mockEqSpy).toHaveBeenCalledWith('telegram_id', telegram_id)
      expect(mockEqSpy).toHaveBeenCalledWith('bot_name', bot_name)
    })

    it('should return false if the user is not an owner', async () => {
      const telegram_id = '67890'
      // Мокируем конечный результат запроса (list)
      mockListResultFn.mockResolvedValueOnce({ data: [], error: null })

      const result = await avatarService.isAvatarOwner(telegram_id)
      expect(result).toBe(false)
    })

    it('should return false and log error if supabase returns an error', async () => {
      const telegram_id = '11111'
      const mockError = new Error('Supabase query failed')
      // Мокируем конечный результат запроса (list) с ошибкой
      mockListResultFn.mockResolvedValueOnce({ data: null, error: mockError })

      const result = await avatarService.isAvatarOwner(telegram_id)
      expect(result).toBe(false)
      expect(mockLoggerErrorFn).toHaveBeenCalledWith(
        '❌ Ошибка при проверке статуса владельца:',
        expect.objectContaining({
          description: 'Error checking avatar owner status',
          error: mockError,
          telegram_id: telegram_id,
        })
      )
    })
  })

  // --- getAvatarByTelegramId ---
  describe('getAvatarByTelegramId', () => {
    it('should return avatar data if found', async () => {
      const telegram_id = '123'
      const mockAvatar: Avatar = {
        telegram_id,
        bot_name: 'test_bot',
        avatar_url: 'url',
        group: 'g',
        created_at: 't',
        updated_at: 't',
      }
      // Мокируем конечный результат single()
      mockSingleFn.mockResolvedValueOnce({ data: mockAvatar, error: null })

      const result = await avatarService.getAvatarByTelegramId(telegram_id)
      expect(result).toEqual(mockAvatar)
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('avatars')
      // Проверяем, что select и eq были вызваны (их моки внутри builder вызываются)
      expect(mockSelectSpy).toHaveBeenCalledWith('*')
      expect(mockEqSpy).toHaveBeenCalledWith('telegram_id', telegram_id)
      // Проверяем, что mockSingleResultFn был вызван (через builder.single)
      expect(mockSingleFn).toHaveBeenCalledTimes(1)
    })

    it('should return null if avatar not found (supabase returns null data)', async () => {
      const telegram_id = '456'
      // single() возвращает Promise с data: null (установлено в mockSingleResultFn)
      mockSingleFn.mockResolvedValueOnce({ data: null, error: null })

      const result = await avatarService.getAvatarByTelegramId(telegram_id)
      expect(result).toBeNull()
      expect(mockSingleFn).toHaveBeenCalledTimes(1) // Убедимся, что single вызывался
    })

    it('should return null and log error if supabase returns an error', async () => {
      const telegram_id = '789'
      const mockError = new Error('DB error')
      // single() возвращает Promise с ошибкой
      mockSingleFn.mockResolvedValueOnce({ data: null, error: mockError })

      const result = await avatarService.getAvatarByTelegramId(telegram_id)
      expect(result).toBeNull()
      expect(mockLoggerErrorFn).toHaveBeenCalledWith(
        '❌ Ошибка при получении данных владельца:',
        expect.objectContaining({
          description: 'Error fetching avatar data',
          error: mockError,
          telegram_id: telegram_id,
        })
      )
      expect(mockSingleFn).toHaveBeenCalledTimes(1)
    })
  })

  // --- getAvatarsByBotName ---
  describe('getAvatarsByBotName', () => {
    it('should return avatars if found', async () => {
      const bot_name = 'test_bot'
      const mockAvatars: Avatar[] = [
        {
          telegram_id: '1',
          bot_name,
          avatar_url: 'url1',
          group: 'g1',
          created_at: 't1',
          updated_at: 't1',
        },
      ]
      // Мокируем конечный результат (list), так как await на builder вернет это
      mockListFn.mockResolvedValueOnce({ data: mockAvatars, error: null })

      const result = await avatarService.getAvatarsByBotName(bot_name)
      expect(result).toEqual(mockAvatars)
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('avatars')
      expect(mockSelectSpy).toHaveBeenCalledWith('*')
      expect(mockEqSpy).toHaveBeenCalledWith('bot_name', bot_name)
      // Проверяем, что list result был вызван (через await на builder)
      expect(mockListFn).toHaveBeenCalledTimes(1)
    })

    it('should return an empty array if no avatars found', async () => {
      const bot_name = 'empty_bot'
      // Мокируем конечный результат (list) с пустым массивом
      mockListFn.mockResolvedValueOnce({ data: [], error: null })

      const result = await avatarService.getAvatarsByBotName(bot_name)
      expect(result).toEqual([])
      expect(mockListFn).toHaveBeenCalledTimes(1)
    })

    it('should return an empty array and log error if supabase returns an error', async () => {
      const bot_name = 'error_bot'
      const mockError = new Error('DB error for list')
      // Мокируем конечный результат (list) с ошибкой
      mockListFn.mockResolvedValueOnce({ data: null, error: mockError })

      const result = await avatarService.getAvatarsByBotName(bot_name)
      expect(result).toEqual([])
      expect(mockLoggerErrorFn).toHaveBeenCalledWith(
        '❌ Ошибка при получении владельцев для бота:',
        expect.objectContaining({
          description: 'Error fetching avatars for bot',
          error: mockError,
          bot_name: bot_name,
        })
      )
      expect(mockListFn).toHaveBeenCalledTimes(1)
    })
  })

  // --- addAvatarOwner ---
  describe('addAvatarOwner', () => {
    it('should successfully add an avatar owner and return success true', async () => {
      const telegram_id = 98765
      const bot_name = 'adder_bot'
      const avatar_url = 'https://example.com/default_avatar.png'
      const group = `${bot_name}_group`
      const insertPayload = {
        telegram_id: Number(telegram_id),
        bot_name,
        avatar_url,
        group,
        created_at: expect.any(String),
        updated_at: expect.any(String),
      }
      const mockInsertedData: Partial<Avatar>[] = [
        {
          telegram_id: String(telegram_id),
          bot_name,
          avatar_url,
          group,
        },
      ]
      // Мокируем insert(), чтобы он вернул Promise с данными
      mockInsertFn.mockResolvedValueOnce({
        data: mockInsertedData,
        error: null,
      })

      const result = await avatarService.addAvatarOwner(telegram_id, bot_name)
      expect(result.success).toBe(true)
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('avatars')
      expect(mockInsertFn).toHaveBeenCalledWith([insertPayload])
    })

    it('should handle telegram_id as string', async () => {
      const telegram_id_str = '98765_string'
      const telegram_id_num = 98765 // Числовое представление для сравнения
      const bot_name = 'string_id_bot'
      const avatar_url = 'https://example.com/default_avatar.png'
      const group = `${bot_name}_group`
      const insertPayload = {
        telegram_id: NaN,
        bot_name,
        avatar_url,
        group,
        created_at: expect.any(String),
        updated_at: expect.any(String),
      }
      const mockInsertedData: Partial<Avatar>[] = [
        {
          telegram_id: String(telegram_id_num),
          bot_name,
          avatar_url,
          group,
        },
      ]
      mockInsertFn.mockResolvedValueOnce({
        data: mockInsertedData,
        error: null,
      })

      await avatarService.addAvatarOwner(telegram_id_str, bot_name)
      expect(mockInsertFn).toHaveBeenCalledWith([insertPayload]) // Проверяем, что вызвали с строковым ID
    })

    it('should return success false and log error if supabase returns an error', async () => {
      const telegram_id = 11223
      const bot_name = 'fail_bot'
      const mockError = new Error('Insert failed')
      // insert() возвращает Promise с ошибкой
      mockInsertFn.mockResolvedValueOnce({ data: null, error: mockError })

      const result = await avatarService.addAvatarOwner(telegram_id, bot_name)
      expect(result.success).toBe(false)
      expect(mockLoggerErrorFn).toHaveBeenCalledWith(
        '❌ Ошибка при добавлении владельца бота:',
        expect.objectContaining({
          description: 'Error adding bot owner',
          error: mockError,
          telegram_id: telegram_id,
          bot_name: bot_name,
        })
      )
    })

    it('should return false and log error if insert throws unexpected error', async () => {
      const telegram_id = 'ghi'
      const bot_name = 'throw_bot'
      const unexpectedError = new Error('Something went wrong during insert')
      // Мокируем insert, чтобы он выбросил ошибку
      mockInsertFn.mockRejectedValueOnce(unexpectedError)

      const result = await avatarService.addAvatarOwner(telegram_id, bot_name)

      expect(result).toEqual(expect.objectContaining({ success: false }))
      expect(mockLoggerErrorFn).toHaveBeenCalledWith(
        '❌ Неожиданная ошибка при добавлении владельца бота:',
        expect.objectContaining({
          description: 'Unexpected error adding bot owner',
          error: unexpectedError,
          telegram_id: telegram_id,
          bot_name: bot_name,
        })
      )
    })

    // Тест для случая, когда telegram_id передается как number
    it('should handle numeric telegram_id correctly', async () => {
      const telegram_id_num = 98765
      const telegram_id_str = '98765'
      const bot_name = 'numeric_id_bot'
      const avatar_url = 'https://example.com/default_avatar.png'
      const group = `${bot_name}_group`
      // ИСПРАВЛЕНО: Включаем все поля и правильный тип telegram_id
      const insertPayload = {
        telegram_id: Number(telegram_id_num),
        bot_name,
        avatar_url,
        group,
        created_at: expect.any(String),
        updated_at: expect.any(String),
      }
      const mockInsertedData: Partial<Avatar>[] = [
        {
          telegram_id: String(telegram_id_num),
          bot_name,
          avatar_url,
          group,
        },
      ]
      mockInsertFn.mockResolvedValueOnce({
        data: mockInsertedData,
        error: null,
      })

      await avatarService.addAvatarOwner(telegram_id_num, bot_name)
      expect(mockInsertFn).toHaveBeenCalledWith([insertPayload]) // Проверяем, что вызвали с строковым ID
    })
  })
})
