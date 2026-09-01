import { describe, it, expect, beforeEach } from 'vitest'
import type { IncomingMessage } from 'node:http'
import { authenticate } from './auth'

/**
 * Ветка ключа агента в `authenticate()`.
 *
 * ЗАЧЕМ ОНА ВООБЩЕ ПОЯВИЛАСЬ. `Identity` в приложении хранит две вещи:
 * сессионный токен и ключ агента. Токена без входа по коду из бота нет, а
 * ключ гвард не спрашивал — и каждая генерация из приложения отвечала
 * «unauthorized: no X-Api-Key and no Telegram initData», хотя в Профиле поле
 * для ключа есть и человек его заполнил.
 *
 * ЗАЧЕМ ТЕСТ. Ветка короткая и выглядит очевидно верной — ровно такой код и
 * оказывается принимающим чужой ключ. Проверяется не только «пускает
 * правильный», но и три способа НЕ пустить: чужой ключ, префикс настоящего и
 * пустая настройка.
 */

/** Закрытый путь: на публичном `isPublic` ответит раньше любой ветки. */
function req(headers: Record<string, string>): IncomingMessage {
  return {
    headers,
    url: '/api/tokens/balance',
    method: 'POST',
  } as unknown as IncomingMessage
}

describe('ключ агента как способ представиться', () => {
  beforeEach(() => {
    process.env.RAILWAY_GIT_COMMIT_SHA = 'test-sha' // режим enforce
    process.env.AGENT_KEYS = 'ключ-первого:111,ключ-второго:222'
    delete process.env.RENDER_API_KEY
  })

  it('пускает по known ключу и НАЗЫВАЕТ человека', () => {
    // Личность здесь — половина смысла. Ключ, который пускает, но не говорит
    // чей запрос, не годится: маршруты спрашивают «чья лента», «чей баланс».
    const r = authenticate(req({ 'x-agent-key': 'ключ-второго' }))
    expect(r.allowed).toBe(true)
    expect(r.via).toBe('agent-key')
    expect(r.telegramId).toBe('222')
  })

  it('не пускает по чужому ключу', () => {
    const r = authenticate(req({ 'x-agent-key': 'ключ-третьего' }))
    expect(r.allowed).toBe(false)
    expect(r.reason).toContain('agent key rejected')
  })

  it('не пускает по ПРЕФИКСУ настоящего ключа', () => {
    // Сравнение по началу строки — классическая дыра: «ключ» подошёл бы к
    // записи «ключ-первого». Пара сравнивается целиком.
    const r = authenticate(req({ 'x-agent-key': 'ключ' }))
    expect(r.allowed).toBe(false)
  })

  it('не пускает, когда AGENT_KEYS пуста', () => {
    // Пустая настройка не должна означать «пускать всех»: именно так
    // конфигурационная оплошность превращается в открытую дверь.
    process.env.AGENT_KEYS = ''
    const r = authenticate(req({ 'x-agent-key': 'ключ-первого' }))
    expect(r.allowed).toBe(false)
  })

  it('пустой заголовок не мешает другим веткам ответить', () => {
    // Ветка обязана срабатывать только при НЕПУСТОМ заголовке, иначе она
    // перехватила бы каждый запрос и убила проверку подписи и сессии.
    const r = authenticate(req({ 'x-agent-key': '' }))
    expect(r.via).not.toBe('agent-key')
  })
})
