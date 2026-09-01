/**
 * Виджет Telegram показывается ТОЛЬКО там, где домен прописан боту.
 *
 * ЦЕНА ОШИБКИ, ИЗМЕРЕННАЯ. После переезда ссылки на app.t27.ai в шапке
 * появилась белая плашка «Bot domain invalid» — на первом экране человека,
 * пришедшего из канала, вместо кнопки входа. Причина: правило было
 * отрицательным («фолбэк только на localhost»), и новый домен под него не
 * попал.
 *
 * Прочитать ошибку из кода нельзя: iframe отрисовывается, а содержимое
 * чужого origin недоступно. Поэтому список положительный, а тест держит
 * его смысл: неизвестный хост — это запасная кнопка, а не ошибка на экране.
 */
import { describe, it, expect } from 'vitest'
import { shouldUseTelegramFallback } from '@/lib/telegramWidget'

describe('когда показывать запасную кнопку входа', () => {
  it('на домене, где виджет проверен, — нативный виджет', () => {
    expect(
      shouldUseTelegramFallback('vibee-editor-production.up.railway.app')
    ).toBe(false)
  })

  it('на подтверждённом брендовом домене — нативный виджет', () => {
    expect(shouldUseTelegramFallback('app.t27.ai')).toBe(false)
  })

  it('на localhost и вообще на неизвестном хосте — запасная кнопка', () => {
    expect(shouldUseTelegramFallback('localhost')).toBe(true)
    expect(shouldUseTelegramFallback('127.0.0.1')).toBe(true)
    expect(shouldUseTelegramFallback('preview.example.com')).toBe(true)
  })

  it('без hostname — запасная кнопка: молчать безопаснее, чем показать ошибку', () => {
    expect(shouldUseTelegramFallback('')).toBe(true)
  })
})
