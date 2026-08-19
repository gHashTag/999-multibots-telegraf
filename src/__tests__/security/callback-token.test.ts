/**
 * Метка обратного вызова: подделать нельзя, чужую не переиспользуешь.
 *
 * Повод — живая проверка прода. Обработчик `/api/video-callback/:telegramId`
 * в режиме прямой отправки берёт получателя ИЗ АДРЕСА, ссылку на видео ИЗ ТЕЛА
 * и отправляет человеку, не сверяясь ни с какой задачей. Подписи от поставщика
 * нет; POST с пустым телом принимается.
 *
 * То есть посторонний мог заставить бота прислать любому пользователю любое
 * видео и текст — от имени бота, которому человек доверяет.
 *
 * Адрес обратного вызова составляем мы сами, поэтому кладём в него метку и
 * проверяем на входе.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/config', () => ({ SECRET_API_KEY: 'test-secret-key-value' }))

const { buildCallbackToken, verifyCallbackToken } = await import(
  '@/utils/callbackToken'
)

describe('метка обратного вызова', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('одна и та же для одного номера', () => {
    expect(buildCallbackToken('144022504')).toBe(buildCallbackToken('144022504'))
  })

  it('разная для разных номеров — чужую не переиспользуешь', () => {
    // Главное свойство. Иначе, подсмотрев одну метку, можно было бы слать
    // что угодно кому угодно.
    expect(buildCallbackToken('144022504')).not.toBe(buildCallbackToken('144022505'))
  })

  it('своя метка проходит проверку', () => {
    const t = buildCallbackToken('144022504')
    expect(verifyCallbackToken('144022504', t)).toBe(true)
  })

  it('метка от другого номера не проходит', () => {
    const other = buildCallbackToken('999999999')
    expect(verifyCallbackToken('144022504', other)).toBe(false)
  })

  it('пустое, отсутствующее и не-строка не проходят', () => {
    for (const bad of [undefined, null, '', 0, {}, [], 'короткая']) {
      expect(verifyCallbackToken('144022504', bad as unknown)).toBe(false)
    }
  })

  it('в метке нет самого ключа', () => {
    // Метка попадает в адрес, который видит поставщик и наши логи.
    const t = buildCallbackToken('144022504') || ''
    expect(t).not.toContain('test-secret-key-value')
    expect(t).toMatch(/^[a-f0-9]{16}$/)
  })
})

describe('без настроенного ключа', () => {
  it('метка не строится и проверка не проходит', async () => {
    vi.resetModules()
    vi.doMock('@/config', () => ({ SECRET_API_KEY: '' }))
    const mod = await import('@/utils/callbackToken')

    // Отказ закрытый: нет ключа — нет и прямой отправки.
    expect(mod.buildCallbackToken('144022504')).toBeNull()
    expect(mod.verifyCallbackToken('144022504', 'что угодно')).toBe(false)

    vi.doUnmock('@/config')
    vi.resetModules()
  })
})
