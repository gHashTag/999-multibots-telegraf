import { describe, it, expect, vi } from 'vitest'
// Импортируем напрямую из src, используя алиас.
// Если это не сработает, проблема в разрешении алиасов.
import { mainFunction } from '@/main'
import { simpleHelper } from '@/utils/helper'

// Мокируем хелпер, чтобы изолировать тест mainFunction
vi.mock('@/utils/helper', () => ({
  simpleHelper: vi.fn((input: string) => `Mocked: ${input}`),
}))

describe('Minimal Alias Test', () => {
  it('should be able to import and run mainFunction which uses an aliased import', () => {
    // Просто вызываем функцию. Ошибка произойдет на этапе импорта, если алиас не разрешится.
    const result = mainFunction()

    // Проверяем, что мок был вызван и вернул ожидаемое значение
    expect(simpleHelper).toHaveBeenCalledWith('hello')
    expect(result).toBe('Mocked: hello')
    console.log('Test executed successfully!')
  })
})
