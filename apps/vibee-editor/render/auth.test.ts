import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import crypto from 'node:crypto'
import {
  verifyTelegramInitData,
  authenticate,
  verifiedTelegramId,
} from './auth'

/**
 * Подпись initData выдаёт ТОТ бот, из которого открыли мини-апп. Ботов на
 * платформе двенадцать, поэтому проверка обязана перебирать все известные
 * токены. Тест закрывает ровно тот случай, который клал вход: человек открыл
 * мини-апп из @t27ai_bot, а сервер знал токен только другого бота.
 */
const sign = (token: string, params: Record<string, string>): string => {
  const check = Object.entries(params)
    .filter(([k]) => k !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  const secret = crypto
    .createHmac('sha256', 'WebAppData')
    .update(token)
    .digest()
  const hash = crypto.createHmac('sha256', secret).update(check).digest('hex')
  return new URLSearchParams({ ...params, hash }).toString()
}

const CLUB = '111111:club-token'
const MAIN = '222222:main-token'
const fresh = () => ({
  auth_date: String(Math.floor(Date.now() / 1000)),
  user: '{"id":1}',
})

describe('verifyTelegramInitData', () => {
  beforeEach(() => {
    for (let i = 1; i <= 20; i++) delete process.env[`BOT_TOKEN_${i}`]
    delete process.env.TELEGRAM_BOT_TOKEN
  })

  it('отвергает подпись бота, чьего токена у сервера нет', () => {
    process.env.TELEGRAM_BOT_TOKEN = MAIN
    expect(verifyTelegramInitData(sign(CLUB, fresh())).ok).toBe(false)
  })

  it('принимает подпись любого из настроенных ботов и называет какого', () => {
    process.env.TELEGRAM_BOT_TOKEN = MAIN
    process.env.BOT_TOKEN_12 = CLUB
    const r = verifyTelegramInitData(sign(CLUB, fresh()))
    expect(r.ok).toBe(true)
    expect(r.botId).toBe('111111')
  })

  it('переживает ротацию: устаревший TELEGRAM_BOT_TOKEN не ломает вход', () => {
    process.env.TELEGRAM_BOT_TOKEN = '222222:stale-rotated-away'
    process.env.BOT_TOKEN_1 = MAIN
    expect(verifyTelegramInitData(sign(MAIN, fresh())).ok).toBe(true)
  })

  it('отвергает просроченный launch, даже с верной подписью', () => {
    process.env.BOT_TOKEN_1 = MAIN
    const old = {
      auth_date: String(Math.floor(Date.now() / 1000) - 90000),
      user: '{}',
    }
    expect(verifyTelegramInitData(sign(MAIN, old)).ok).toBe(false)
  })

  it('без единого токена не пропускает никого', () => {
    expect(verifyTelegramInitData(sign(MAIN, fresh())).ok).toBe(false)
  })
})

describe('подпись не принимается из строки запроса', () => {
  // Тестируем политику безопасности, а не локальный warn-режим: подделка
  // обязана отвергаться там, где гвард реально включён — на проде (enforce).
  const prevMode = process.env.RENDER_AUTH_MODE
  beforeEach(() => {
    process.env.RENDER_AUTH_MODE = 'enforce'
  })
  afterEach(() => {
    process.env.RENDER_AUTH_MODE = prevMode
  })

  it('replayable query credential is rejected', () => {
    process.env.BOT_TOKEN_1 = MAIN
    const initData = sign(MAIN, fresh())
    const req = {
      url: `/render/abc/status?initData=${encodeURIComponent(initData)}`,
      method: 'GET',
      headers: {},
    } as unknown as import('node:http').IncomingMessage
    expect(authenticate(req).allowed).toBe(false)
    expect(verifiedTelegramId(req)).toBeNull()
  })

  it('подделка в query не проходит', () => {
    process.env.BOT_TOKEN_1 = MAIN
    const bad = sign('999:not-ours', fresh())
    const req = {
      url: `/render/abc/status?initData=${encodeURIComponent(bad)}`,
      method: 'GET',
      headers: {},
    } as unknown as import('node:http').IncomingMessage
    expect(authenticate(req).allowed).toBe(false)
  })
})
