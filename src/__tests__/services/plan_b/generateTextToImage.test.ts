import {
  describe,
  it,
  expect,
  beforeEach,
  mock,
  afterEach,
  spyOn,
} from 'bun:test'
import { generateTextToImage } from '@/services/plan_b/generateTextToImage'
import { MyContext, GenerationResult } from '@/interfaces'
import { Telegraf } from 'telegraf'
import { logger } from '@/utils/logger'
// import { replicate } from '@/core/replicate' // Не импортируем напрямую, если мокаем
import { supabase } from '@/core/supabase'
import { calculateFinalStarPrice } from '@/price/calculator'
import { processBalanceOperation } from '@/price/helpers'
// import { saveFileLocally } from '@/helpers/saveFileLocally' // Не импортируем напрямую, если мокаем
import fs from 'fs'
import path from 'path'
import { Message, Update } from 'telegraf/types'
import { User } from '@/interfaces/user.interface'
import * as replicateModule from '@/core/replicate' // Импортируем модуль для шпиона
import * as helpersErrorModule from '@/helpers/error' // Импортируем модуль для шпиона
import * as saveFileLocallyModule from '@/helpers/saveFileLocally' // Импортируем модуль для шпиона
import * as supabaseModuleForSpy from '@/core/supabase' // Импортируем модуль для шпиона (другое имя, чтобы не конфликтовать)

// --- Мокирование зависимостей --- //

// Мок Replicate
mock.module('@/core/replicate', () => ({
  replicate: {
    run: mock(
      (): Promise<string[]> =>
        Promise.resolve(['http://example.com/mock-image.jpeg'])
    ),
  },
}))

// Мок Supabase (упрощенный, нужно будет расширить для разных функций)
mock.module('@/core/supabase', () => ({
  getUserByTelegramIdString: mock(() =>
    Promise.resolve({ id: 1, level: 0, telegram_id: '12345' })
  ),
  updateUserLevelPlusOne: mock(() => Promise.resolve()),
  getAspectRatio: mock(() => Promise.resolve('1:1')),
  savePrompt: mock((): Promise<number> => Promise.resolve(999)), // Return number!
  // Добавьте другие моки Supabase по мере необходимости
  supabase: {
    from: mock(() => ({
      select: mock(() => ({
        eq: mock(() =>
          Promise.resolve({ data: [{ user_level: 1 }], error: null })
        ),
      })),
    })),
  },
}))

// --- Получаем ссылки на мокированные функции из Supabase --- //
// Важно делать это ПОСЛЕ mock.module
const {
  getUserByTelegramIdString: mockGetUserByTelegramIdString,
  updateUserLevelPlusOne: mockUpdateUserLevelPlusOne,
  getAspectRatio: mockGetAspectRatio,
  // savePrompt: mockSavePrompt, // Не получаем ссылку, если будем шпионить
  supabase: mockSupabase,
} = require('@/core/supabase')

// Мок Logger
mock.module('@/utils/logger', () => ({
  logger: {
    info: mock(() => {}),
    error: mock(() => {}),
    warn: mock(() => {}),
  },
}))

// --- Моки остальных зависимостей --- //

// Мок calculateFinalStarPrice
mock.module('@/price/calculator', () => ({
  calculateFinalStarPrice: mock(() => ({
    stars: 10,
    rubles: 1,
    dollars: 0.01,
  })),
}))
const {
  calculateFinalStarPrice: mockCalculateFinalStarPrice,
} = require('@/price/calculator')

// Мок processBalanceOperation
mock.module('@/price/helpers', () => ({
  processBalanceOperation: mock(
    (
      _telegram_id: string | number,
      _cost: number,
      _service: string,
      _ctx: MyContext,
      _meta?: any
    ) => Promise.resolve({ success: true, newBalance: 90 })
  ),
}))
const {
  processBalanceOperation: mockProcessBalanceOperation,
} = require('@/price/helpers')

// Мок saveFileLocally
mock.module('@/helpers/saveFileLocally', () => ({
  saveFileLocally: mock(() => Promise.resolve('/path/to/mock/local/file.jpeg')),
}))
// const { saveFileLocally: mockSaveFileLocally } = require('@/helpers/saveFileLocally'); // Не получаем ссылку

// Мок helpers/error (для processApiResponse)
const mockProcessApiResponse = mock(
  async (output: string[] | string): Promise<string> => {
    // Basic mock: return the first element if array, otherwise return the string
    if (Array.isArray(output) && output.length > 0) {
      return output[0]
    }
    if (typeof output === 'string') {
      return output
    }
    throw new Error('Mock processApiResponse received invalid input')
  }
)
mock.module('@/helpers/error', () => ({
  processApiResponse: mockProcessApiResponse,
}))

// --- Define a minimal valid TextMessage structure for mocks ---
const mockTextMessage = (): Message.TextMessage => ({
  message_id: 1,
  date: Math.floor(Date.now() / 1000),
  chat: { id: 12345, type: 'private', first_name: 'Test' },
  text: 'mock reply message',
  from: { id: 12345, is_bot: false, first_name: 'Test' }, // Add dummy from
})

// --- Тесты --- //

describe('Plan B: generateTextToImage Service', () => {
  let mockCtx: Partial<MyContext>
  let mockBot: Partial<Telegraf<MyContext>>

  beforeEach(() => {
    // Сброс моков перед каждым тестом
    // Object.values(replicate).forEach(fn => (fn as any).mockClear()); // Не можем сбрасывать так, если мокаем модуль
    // Сбрасываем через полученные ссылки
    mockGetUserByTelegramIdString.mockClear()
    mockUpdateUserLevelPlusOne.mockClear()
    mockGetAspectRatio.mockClear()
    // mockSavePrompt.mockClear(); // Шпионы сбрасываются через restore
    // Сброс моков внутри объекта supabase
    mockSupabase.from.mockClear()
    // Можно добавить более глубокий сброс, если from возвращает сложный объект
    // mockSupabase.from().select().eq.mockClear(); // Пример

    Object.values(logger).forEach(fn => (fn as any).mockClear())
    mockCalculateFinalStarPrice.mockClear()
    mockProcessBalanceOperation.mockClear()
    // mockSaveFileLocally.mockClear(); // Шпионы сбрасываются через restore
    // mockCreateReadStream.mockClear(); // Удаляем сброс
    mockProcessApiResponse.mockClear() // Clear the new mock

    // Создаем базовые моки для ctx и bot
    mockCtx = {
      from: {
        id: 12345,
        username: 'testuser',
        language_code: 'ru',
        is_bot: false,
        first_name: 'Test',
      },
      telegram: {
        sendMessage: mock(
          () =>
            Promise.resolve({
              /* ... */
            }) as unknown as Promise<Message.TextMessage>
        ),
        sendPhoto: mock(() => Promise.resolve({})) as any, // Упрощенный мок sendPhoto
      } as any,
      reply: mock(
        (): Promise<Message.TextMessage> => Promise.resolve(mockTextMessage())
      ), // Corrected return type
    }

    mockBot = {
      telegram: mockCtx.telegram,
    }
  })

  afterEach(() => {
    mock.restore() // Восстанавливаем все моки и шпионов
  })

  it.skip('should successfully generate an image with valid inputs', async () => {
    // Arrange
    const prompt = 'a cat riding a unicorn'
    const model_type = 'stable_diffusion'
    const num_images = 1
    const telegram_id_num = 12345
    const telegram_id_str = telegram_id_num.toString() // Используем строку для вызова функции
    const username = 'testuser'
    const is_ru = true

    // Добавляем шпионов для отладки
    const replicateRunSpy = spyOn(replicateModule.replicate, 'run') // Шпион на импортированном объекте
    const processApiResponseSpy = spyOn(
      helpersErrorModule,
      'processApiResponse'
    ) // Шпион на импортированной функции
    const saveFileLocallySpy = spyOn(saveFileLocallyModule, 'saveFileLocally') // Шпион на импортированной функции
    const savePromptSpy = spyOn(supabaseModuleForSpy, 'savePrompt') // Шпион на импортированной функции
    const sendPhotoSpy = spyOn(mockCtx.telegram!, 'sendPhoto') // Use non-null assertion

    // Act
    const results = await generateTextToImage(
      prompt,
      model_type,
      num_images,
      telegram_id_str, // Передаем строку
      username,
      is_ru,
      mockBot as Telegraf<MyContext>,
      mockCtx as MyContext
    )

    // Assert
    expect(results).toBeInstanceOf(Array)
    expect(results.length).toBe(1)
    expect(results[0]).toHaveProperty('image')
    expect(results[0]).toHaveProperty('prompt_id')
    expect(results[0].image).toContain('/uploads/12345/text-to-image/')
    expect(results[0].prompt_id).toBe(999) // Expect number!

    // Проверяем вызовы ключевых моков через полученные ссылки
    expect(mockCalculateFinalStarPrice).toHaveBeenCalledTimes(1)
    expect(mockProcessBalanceOperation).toHaveBeenCalledWith(
      Number(telegram_id_str), // Expect number here!
      expect.any(Number), // cost
      expect.any(String), // service
      expect.anything(), // ctx
      expect.anything() // meta
    )
    expect(mockProcessBalanceOperation).toHaveBeenCalledTimes(1)
    // Проверяем вызовы шпионов
    // Добавляем await для надежности (хотя они должны быть синхронными)
    await expect(replicateRunSpy).toHaveBeenCalledTimes(1)
    await expect(processApiResponseSpy).toHaveBeenCalledTimes(1)
    await expect(saveFileLocallySpy).toHaveBeenCalledTimes(1)
    await expect(savePromptSpy).toHaveBeenCalledTimes(1)
    await expect(sendPhotoSpy).toHaveBeenCalledTimes(1) // Проверяем упрощенный вызов
    expect(mockCtx.telegram?.sendMessage).toHaveBeenCalled()

    // Восстанавливаем шпионов (делается в afterEach)
    // replicateRunSpy.mockRestore();
    // processApiResponseSpy.mockRestore();
    // saveFileLocallySpy.mockRestore();
    // savePromptSpy.mockRestore();
    // sendPhotoSpy.mockRestore();
  })

  // TODO: Добавить тесты для:
  // - Недостаточного баланса
  // - Ошибки Replicate API
  // - Ошибки Supabase (getUser, savePrompt и т.д.)
  // - Невалидного типа модели
  // - Генерации нескольких изображений (num_images > 1)
  // - Разных соотношений сторон (aspect_ratio)
  // - Отсутствия пользователя в БД
})
