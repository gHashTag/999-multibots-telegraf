import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getCurrentRate, clearRateCache } from './index'

// Мокаем глобальный fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

// Мокаем logger чтобы не засорять вывод тестов
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}))

describe('getCurrentRate', () => {
  beforeEach(() => {
    // Очищаем кеш и моки перед каждым тестом
    clearRateCache()
    mockFetch.mockClear()
  })

  it('должен получать актуальный курс из API', async () => {
    // Мокаем успешный ответ от API
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          ret_code: 0,
          result: {
            items: [{ price: '90.5' }, { price: '89.2' }, { price: '92.1' }],
          },
        }),
    })

    const rate = await getCurrentRate()

    // Проверяем что взята минимальная цена и округлена
    expect(rate).toBe(89)

    // Проверяем что был сделан запрос к правильному URL
    expect(mockFetch).toHaveBeenCalledWith(
      'https://www.bybit.com/x-api/fiat/public/channel/payment-list?crypto=USDT&fiat=RUB',
      expect.any(Object)
    )
  })

  it('должен использовать кеш при повторном запросе', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          ret_code: 0,
          result: {
            items: [{ price: '90.5' }],
          },
        }),
    })

    // Первый запрос
    await getCurrentRate()

    // Второй запрос должен использовать кеш
    const rate = await getCurrentRate()

    expect(rate).toBe(91) // Округленное значение из первого запроса
    expect(mockFetch).toHaveBeenCalledTimes(1) // Запрос был сделан только один раз
  })

  it('должен игнорировать кеш если опция cache=false', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ret_code: 0,
          result: {
            items: [{ price: '90.5' }],
          },
        }),
    })

    // Первый запрос
    await getCurrentRate()

    // Второй запрос без кеша
    await getCurrentRate({ cache: false })

    expect(mockFetch).toHaveBeenCalledTimes(2) // Запрос был сделан дважды
  })

  it('должен возвращать fallback значение при ошибке', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const rate = await getCurrentRate({ fallback: 100 })

    expect(rate).toBe(100)
  })

  it('должен возвращать кешированное значение при ошибке если оно есть', async () => {
    // Первый успешный запрос
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          ret_code: 0,
          result: {
            items: [{ price: '90.5' }],
          },
        }),
    })
    await getCurrentRate()

    // Второй запрос с ошибкой
    mockFetch.mockRejectedValueOnce(new Error('Network error'))
    const rate = await getCurrentRate({ fallback: 100 })

    expect(rate).toBe(91) // Должен вернуть кешированное значение вместо fallback
  })

  it('должен корректно обрабатывать ошибки API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          ret_code: 1,
          ret_msg: 'API Error',
          result: { items: [] },
        }),
    })

    const rate = await getCurrentRate()

    expect(rate).toBe(85) // Значение по умолчанию
  })

  it('должен обрабатывать пустой список цен', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          ret_code: 0,
          result: { items: [] },
        }),
    })

    const rate = await getCurrentRate()

    expect(rate).toBe(85) // Значение по умолчанию
  })

  it('должен обрабатывать невалидные цены', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          ret_code: 0,
          result: {
            items: [{ price: 'invalid' }, { price: 'NaN' }],
          },
        }),
    })

    const rate = await getCurrentRate()

    expect(rate).toBe(85) // Значение по умолчанию
  })
})
