import { describe, it, expect, beforeEach, mock, afterEach } from 'bun:test'
import { avatarService, Avatar } from '@/services/plan_b/avatar.service'
// Прямой импорт не нужен, так как модуль мокируется целиком
// import { supabase } from '@/core/supabase';
// import { logger } from '@/utils/logger';

// --- Мокирование зависимостей с использованием Bun --- //

// Определяем типы для большей ясности моков Supabase
type SupabaseError = { message: string } | Error | null
type SupabaseSingleResponse<T> = { data: T | null; error: SupabaseError }
type SupabaseListResponse<T> = { data: T[] | null; error: SupabaseError } // data can be null on error
type SupabaseInsertResponse<T> = {
  data: Partial<T>[] | null
  error: SupabaseError
}

// --- Моки Supabase --- //
// Функции, возвращающие Promise
const mockSingleFn = mock(
  (): Promise<SupabaseSingleResponse<Avatar>> =>
    Promise.resolve({ data: null, error: null })
)
const mockInsertFn = mock(
  (data: Partial<Avatar>[]): Promise<SupabaseInsertResponse<Avatar>> =>
    Promise.resolve({ data: data, error: null })
)
const mockListFn = mock(
  (): Promise<SupabaseListResponse<Avatar>> =>
    Promise.resolve({ data: [], error: null })
) // Мок для возврата списка

// Тип для объекта, возвращаемого .eq() и .select()
interface SupabaseQueryBuilder {
  eq: (column: string, value: any) => SupabaseQueryBuilder
  select: (columns: string) => SupabaseQueryBuilder
  insert: (data: Partial<Avatar>[]) => Promise<SupabaseInsertResponse<Avatar>>
  single: () => Promise<SupabaseSingleResponse<Avatar>>
  // Добавляем метод для возврата списка (не single)
  then: (
    onfulfilled?: (
      value: SupabaseListResponse<Avatar>
    ) => any | PromiseLike<any>
  ) => Promise<any> // then для списка
  catch: (onrejected?: (reason: any) => any | PromiseLike<any>) => Promise<any>
  finally: (onfinally?: (() => void) | undefined | null) => Promise<any>
  [Symbol.toStringTag]: string
}

// Создаем моки методов
const mockEqFn = mock(function (
  this: SupabaseQueryBuilder,
  column: string,
  value: any
): SupabaseQueryBuilder {
  // В тестах мы будем переопределять поведение этого или следующего метода в цепочке
  // чтобы он возвращал Promise с нужным результатом (list или single)
  return this
})

const mockSelectFn = mock(function (
  this: SupabaseQueryBuilder,
  columns: string
): SupabaseQueryBuilder {
  this.select = mockSelectFn
  this.eq = mockEqFn
  this.single = mockSingleFn
  // Привязываем then/catch/finally от mockListFn для случаев, когда цепочка заканчивается не на single()
  this.then = mockListFn.then.bind(mockListFn)
  this.catch = mockListFn.catch.bind(mockListFn)
  this.finally = mockListFn.finally.bind(mockListFn)
  this[Symbol.toStringTag] = 'Promise' // Имитируем Promise
  return this
})

// Мок для from()
const mockFromFn = mock(
  (table: string): Partial<SupabaseQueryBuilder> => ({
    select: mockSelectFn,
    insert: mockInsertFn,
  })
)

// Мокируем модуль Supabase
mock.module('@/core/supabase', () => ({
  supabase: {
    from: mockFromFn,
  },
}))

// Создаем мок-функции для Logger
const mockLoggerInfoFn = mock((message: string, context?: any) => {})
const mockLoggerErrorFn = mock((message: string, context?: any) => {})
const mockLoggerWarnFn = mock((message: string, context?: any) => {})

// Мокируем модуль Logger
mock.module('@/utils/logger', () => ({
  logger: {
    info: mockLoggerInfoFn,
    error: mockLoggerErrorFn,
    warn: mockLoggerWarnFn,
  },
}))

describe('Plan B: Avatar Service', () => {
  beforeEach(() => {
    // Сбрасываем все моки перед каждым тестом
    mockSingleFn.mockClear().mockResolvedValue({ data: null, error: null })
    mockInsertFn
      .mockClear()
      .mockImplementation((data: Partial<Avatar>[]) =>
        Promise.resolve({ data: data, error: null })
      )
    mockListFn.mockClear().mockResolvedValue({ data: [], error: null }) // Сброс для списка
    mockEqFn.mockClear().mockReturnThis()
    mockSelectFn.mockClear().mockReturnThis()
    mockFromFn
      .mockClear()
      .mockReturnValue({ select: mockSelectFn, insert: mockInsertFn })
    mockLoggerInfoFn.mockClear()
    mockLoggerErrorFn.mockClear()
    mockLoggerWarnFn.mockClear()
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
      // Мокируем ПОСЛЕДНИЙ вызов в цепочке (eq), чтобы он вернул Promise списка
      mockEqFn.mockImplementationOnce(() =>
        mockListFn.mockResolvedValueOnce({ data: mockAvatarData, error: null })
      )

      // Act
      const result = await avatarService.isAvatarOwner(telegram_id)

      // Assert
      expect(result).toBe(true)
      expect(mockFromFn).toHaveBeenCalledWith('avatars')
      expect(mockSelectFn).toHaveBeenCalledWith('*')
      expect(mockEqFn).toHaveBeenCalledWith('telegram_id', telegram_id)
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
      // Мокируем ВТОРОЙ вызов eq, чтобы он вернул Promise списка
      const mockSecondEq = mock(() =>
        mockListFn.mockResolvedValueOnce({ data: mockAvatarData, error: null })
      )
      // Первый вызов eq должен вернуть объект, у которого eq - это наш mockSecondEq
      mockEqFn.mockImplementationOnce(function (this: SupabaseQueryBuilder) {
        this.eq = mockSecondEq
        return this
      })

      const result = await avatarService.isAvatarOwner(telegram_id, bot_name)

      expect(result).toBe(true)
      expect(mockFromFn).toHaveBeenCalledWith('avatars')
      expect(mockSelectFn).toHaveBeenCalledWith('*')
      // Проверяем оба вызова eq
      expect(mockEqFn).toHaveBeenCalledWith('telegram_id', telegram_id)
      expect(mockSecondEq).toHaveBeenCalledWith('bot_name', bot_name)
    })

    it('should return false if the user is not an owner', async () => {
      const telegram_id = '67890'
      // Последний eq возвращает Promise с пустым списком
      mockEqFn.mockImplementationOnce(() =>
        mockListFn.mockResolvedValueOnce({ data: [], error: null })
      )

      const result = await avatarService.isAvatarOwner(telegram_id)
      expect(result).toBe(false)
    })

    it('should return false and log error if supabase returns an error', async () => {
      const telegram_id = '11111'
      const mockError = new Error('Supabase query failed')
      // Последний eq возвращает Promise с ошибкой
      mockEqFn.mockImplementationOnce(() =>
        mockListFn.mockResolvedValueOnce({ data: null, error: mockError })
      )

      const result = await avatarService.isAvatarOwner(telegram_id)
      expect(result).toBe(false)
      expect(mockLoggerErrorFn).toHaveBeenCalledWith(
        expect.stringContaining('isAvatarOwner'),
        expect.any(Object)
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
      // Мокируем single(), чтобы он вернул Promise с данными
      mockSingleFn.mockResolvedValueOnce({ data: mockAvatar, error: null })

      const result = await avatarService.getAvatarByTelegramId(telegram_id)
      expect(result).toEqual(mockAvatar)
      expect(mockFromFn).toHaveBeenCalledWith('avatars')
      expect(mockSelectFn).toHaveBeenCalledWith('*')
      expect(mockEqFn).toHaveBeenCalledWith('telegram_id', telegram_id)
      expect(mockSingleFn).toHaveBeenCalledTimes(1)
    })

    it('should return null if avatar not found (supabase returns null data)', async () => {
      const telegram_id = '456'
      // single() возвращает Promise с data: null (по умолчанию)
      mockSingleFn.mockResolvedValueOnce({ data: null, error: null })

      const result = await avatarService.getAvatarByTelegramId(telegram_id)
      expect(result).toBeNull()
    })

    it('should return null and log error if supabase returns an error', async () => {
      const telegram_id = '789'
      const mockError = new Error('DB error')
      // single() возвращает Promise с ошибкой
      mockSingleFn.mockResolvedValueOnce({ data: null, error: mockError })

      const result = await avatarService.getAvatarByTelegramId(telegram_id)
      expect(result).toBeNull()
      expect(mockLoggerErrorFn).toHaveBeenCalledWith(
        expect.stringContaining('getAvatarByTelegramId'),
        expect.any(Object)
      )
    })
  })

  // --- getAvatarsByBotName ---
  describe('getAvatarsByBotName', () => {
    it('should return a list of avatars for the specified bot name', async () => {
      const bot_name = 'neuro_bot'
      const mockAvatars: Avatar[] = [
        {
          telegram_id: '1',
          bot_name,
          avatar_url: 'url1',
          group: 'g1',
          created_at: 't1',
          updated_at: 't1',
        },
        {
          telegram_id: '2',
          bot_name,
          avatar_url: 'url2',
          group: 'g2',
          created_at: 't2',
          updated_at: 't2',
        },
      ]
      // Последний eq возвращает Promise списка
      mockEqFn.mockImplementationOnce(() =>
        mockListFn.mockResolvedValueOnce({ data: mockAvatars, error: null })
      )

      const result = await avatarService.getAvatarsByBotName(bot_name)
      expect(result).toEqual(mockAvatars)
      expect(mockFromFn).toHaveBeenCalledWith('avatars')
      expect(mockSelectFn).toHaveBeenCalledWith('*')
      expect(mockEqFn).toHaveBeenCalledWith('bot_name', bot_name)
    })

    it('should return an empty list if no avatars found for the bot name', async () => {
      const bot_name = 'unknown_bot'
      // Последний eq возвращает Promise с пустым списком (по умолчанию)
      mockEqFn.mockImplementationOnce(() =>
        mockListFn.mockResolvedValueOnce({ data: [], error: null })
      )

      const result = await avatarService.getAvatarsByBotName(bot_name)
      expect(result).toEqual([])
    })

    it('should return an empty list and log error if supabase returns an error', async () => {
      const bot_name = 'error_bot'
      const mockError = new Error('Failed to fetch')
      // Последний eq возвращает Promise с ошибкой
      mockEqFn.mockImplementationOnce(() =>
        mockListFn.mockResolvedValueOnce({ data: null, error: mockError })
      )

      const result = await avatarService.getAvatarsByBotName(bot_name)
      expect(result).toEqual([])
      expect(mockLoggerErrorFn).toHaveBeenCalledWith(
        expect.stringContaining('getAvatarsByBotName'),
        expect.any(Object)
      )
    })
  })

  // --- addAvatarOwner ---
  describe('addAvatarOwner', () => {
    it('should successfully add an avatar owner and return success true', async () => {
      const telegram_id = 98765
      const bot_name = 'adder_bot'
      const insertPayload = { telegram_id: String(telegram_id), bot_name }
      const mockInsertedData: Partial<Avatar>[] = [insertPayload]
      // Мокируем insert(), чтобы он вернул Promise с данными
      mockInsertFn.mockResolvedValueOnce({
        data: mockInsertedData,
        error: null,
      })

      const result = await avatarService.addAvatarOwner(telegram_id, bot_name)
      expect(result.success).toBe(true)
      expect(mockFromFn).toHaveBeenCalledWith('avatars')
      expect(mockInsertFn).toHaveBeenCalledWith([insertPayload])
    })

    it('should handle telegram_id as string', async () => {
      const telegram_id_str = '98765_string'
      const telegram_id_num = 98765 // Числовое представление для сравнения
      const bot_name = 'string_id_bot'
      const insertPayload = { telegram_id: String(telegram_id_num), bot_name } // Вставляем как строку
      const mockInsertedData: Partial<Avatar>[] = [insertPayload]
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
        expect.stringContaining('addAvatarOwner'),
        expect.any(Object)
      )
    })

    it('should return success false and log error on unexpected error', async () => {
      const telegram_id = 44556
      const bot_name = 'unexpected_fail_bot'
      const unexpectedError = new Error('Something went wrong during insert')
      // Мокируем insert, чтобы он выбросил ошибку
      mockInsertFn.mockImplementationOnce(() => {
        throw unexpectedError
      })

      const result = await avatarService.addAvatarOwner(telegram_id, bot_name)
      expect(result.success).toBe(false)
      expect(mockLoggerErrorFn).toHaveBeenCalledWith(
        expect.stringContaining('addAvatarOwner'),
        expect.objectContaining({ error: unexpectedError.message })
      )
    })
  })
})
