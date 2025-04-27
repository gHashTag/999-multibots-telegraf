/**
 * Основной файл настройки тестов
 * Этот файл запускается перед выполнением любых тестов.
 * Он настраивает глобальную тестовую среду и мокает внешние зависимости.
 */
import { beforeAll, afterAll, vi } from 'vitest'

// Настройка fetch-mock
// Обратите внимание: эта настройка закомментирована, чтобы избежать конфликтов с локальными инстансами
// Вместо глобального использования рекомендуется делать локальную настройку в каждом тесте:
// 
// import { vi } from 'vitest'
// import createFetchMock from 'vitest-fetch-mock'
// const fetchMocker = createFetchMock(vi)
// fetchMocker.enableMocks()
//
// import createFetchMock from 'vitest-fetch-mock'
// const fetchMocker = createFetchMock(vi)
// fetchMocker.enableMocks()

// Мокаем logger для тестов
vi.mock('../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

// Мокаем supabase для тестов
vi.mock('../src/core/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    match: vi.fn().mockReturnThis(),
    data: undefined,
    error: null,
  },
}))

// Мокаем метод createScene и этапы stages для тестов
vi.mock('../src/utils/scenes-maker', () => ({
  createScene: vi.fn((name, obj) => ({
    name,
    ...obj,
  })),
}))

// Мокаем генерацию Reply ID для тестов
vi.mock('../src/utils/getReplyId', () => ({
  getReplyId: vi.fn().mockReturnValue('mocked-reply-id'),
}))

// Глобальные значения для тестов
beforeAll(() => {
  // Устанавливаем глобальные моки или значения перед всеми тестами
  console.log('Setup: Initializing test environment')
})

afterAll(() => {
  // Очищаем глобальные моки или значения после всех тестов
  console.log('Teardown: Cleaning up test environment')
  vi.clearAllMocks()
})
