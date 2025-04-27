/**
 * Пример тестирования API с использованием vitest-fetch-mock
 * 
 * Демонстрирует локальную настройку fetch-mock для перехвата HTTP-запросов
 * вместо выполнения реальных сетевых вызовов
 */

// ВАЖНО: Порядок импортов имеет решающее значение!
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import createFetchMock from 'vitest-fetch-mock'

// Создаем и активируем mock ДО импорта fetch
const fetchMocker = createFetchMock(vi)
fetchMocker.enableMocks()

// Только после этого импортируем fetch
import fetch from 'cross-fetch'

describe('API fetch тестирование с fetch-mock (локальная настройка)', () => {
  // Перед каждым тестом сбрасываем моки
  beforeEach(() => {
    fetchMocker.resetMocks()
  })

  // После каждого теста проверяем, что все запросы были перехвачены
  afterEach(() => {
    expect(fetchMocker.mock.calls.length).toEqual(fetchMocker.mock.results.length)
  })

  it('должен моделировать успешный ответ API', async () => {
    // Настраиваем мок для успешного ответа
    fetchMocker.mockResponseOnce(JSON.stringify({ data: 'значение' }))

    // Выполняем запрос (будет перехвачен fetchMocker)
    const response = await fetch('https://api.example.com/data')
    const data = await response.json()

    // Проверяем результат
    expect(data).toEqual({ data: 'значение' })
    
    // Проверка вызова fetch с правильным URL
    expect(fetchMocker).toHaveBeenCalledWith('https://api.example.com/data')
    expect(fetchMocker.mock.calls.length).toBe(1)
  })

  it('должен моделировать ошибку API', async () => {
    // Настраиваем мок для ошибки
    fetchMocker.mockRejectOnce(new Error('API недоступен'))

    // Ожидаем выброс ошибки
    await expect(fetch('https://api.example.com/broken')).rejects.toThrow('API недоступен')
    
    // Проверка вызова fetch
    expect(fetchMocker).toHaveBeenCalledWith('https://api.example.com/broken')
    expect(fetchMocker.mock.calls.length).toBe(1)
  })

  it('должен моделировать ответ с указанным статусом', async () => {
    // Настраиваем мок для ответа с кодом 404
    fetchMocker.mockResponseOnce(JSON.stringify({ error: 'Не найдено' }), { status: 404 })

    // Выполняем запрос
    const response = await fetch('https://api.example.com/nonexistent')
    const data = await response.json()

    // Проверяем статус и тело ответа
    expect(response.status).toBe(404)
    expect(data).toEqual({ error: 'Не найдено' })
    
    // Проверка вызова fetch
    expect(fetchMocker).toHaveBeenCalledWith('https://api.example.com/nonexistent')
  })

  it('должен моделировать несколько последовательных запросов', async () => {
    // Настраиваем моки для нескольких последовательных ответов
    fetchMocker.mockResponses(
      [JSON.stringify({ page: 1, items: ['item1', 'item2'] }), { status: 200 }],
      [JSON.stringify({ page: 2, items: ['item3', 'item4'] }), { status: 200 }]
    )

    // Выполняем первый запрос
    const response1 = await fetch('https://api.example.com/page/1')
    const data1 = await response1.json()

    // Выполняем второй запрос
    const response2 = await fetch('https://api.example.com/page/2')
    const data2 = await response2.json()

    // Проверяем результаты
    expect(data1).toEqual({ page: 1, items: ['item1', 'item2'] })
    expect(data2).toEqual({ page: 2, items: ['item3', 'item4'] })
    
    // Проверка вызовов fetch
    expect(fetchMocker.mock.calls.length).toBe(2)
    expect(fetchMocker).toHaveBeenNthCalledWith(1, 'https://api.example.com/page/1')
    expect(fetchMocker).toHaveBeenNthCalledWith(2, 'https://api.example.com/page/2')
  })
}) 