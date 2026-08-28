/**
 * 🧪 Проверка подписи Telegram initData на рендер-сервере.
 *
 * Это единственный механизм, которым браузерный редактор может доказать, что он
 * действительно запущен из Telegram: общий секрет в бандле публичен по своей
 * природе. Если проверка ошибочно принимает подделку — авторизации нет вовсе.
 */

import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'

const BOT_TOKEN = '123456:TEST_TOKEN_FOR_UNIT_TESTS'
// auth.ts читает env на импорте, поэтому токен выставляется ДО него.
process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN

/** Собирает валидный initData тем же алгоритмом, что применяет Telegram. */
function signInitData(
  fields: Record<string, string>,
  token = BOT_TOKEN
): string {
  const checkString = Object.keys(fields)
    .sort()
    .map(k => `${k}=${fields[k]}`)
    .join('\n')
  const secret = crypto
    .createHmac('sha256', 'WebAppData')
    .update(token)
    .digest()
  const hash = crypto
    .createHmac('sha256', secret)
    .update(checkString)
    .digest('hex')
  const p = new URLSearchParams(fields)
  p.set('hash', hash)
  return p.toString()
}

const nowSec = () => Math.floor(Date.now() / 1000)

import {
  verifyTelegramInitData,
  isPublic,
} from '../../../apps/vibee-editor/render/auth'

describe('verifyTelegramInitData', () => {
  it('принимает подпись, сделанную настоящим токеном', async () => {
    const data = signInitData({
      auth_date: String(nowSec()),
      query_id: 'AAE',
      user: JSON.stringify({ id: 144022504, first_name: 'T' }),
    })
    expect(verifyTelegramInitData(data).ok).toBe(true)
  })

  it('отвергает подпись, сделанную ДРУГИМ токеном', async () => {
    const data = signInitData(
      { auth_date: String(nowSec()), query_id: 'AAE' },
      '999:WRONG'
    )
    const r = verifyTelegramInitData(data)
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('mismatch')
  })

  it('отвергает подделку с изменённым полем при сохранённом hash', async () => {
    const good = signInitData({
      auth_date: String(nowSec()),
      user: JSON.stringify({ id: 1, first_name: 'A' }),
    })
    // подменяем пользователя на админа, hash оставляем прежний
    const p = new URLSearchParams(good)
    p.set('user', JSON.stringify({ id: 144022504, first_name: 'Owner' }))
    expect(verifyTelegramInitData(p.toString()).ok).toBe(false)
  })

  it('отвергает отсутствующий hash', async () => {
    expect(verifyTelegramInitData('auth_date=1&user=%7B%7D').ok).toBe(false)
  })

  it('отвергает пустую строку', async () => {
    expect(verifyTelegramInitData('').ok).toBe(false)
  })

  it('отвергает просроченный launch — подпись валидна вечно', async () => {
    const old = signInitData({
      auth_date: String(nowSec() - 60 * 60 * 30), // 30 часов назад
      query_id: 'AAE',
    })
    const r = verifyTelegramInitData(old)
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('old')
  })

  it('отвергает auth_date=0 — иначе он прошёл бы как «очень старый, но валидный»', async () => {
    expect(verifyTelegramInitData(signInitData({ auth_date: '0' })).ok).toBe(
      false
    )
  })
})

describe('isPublic', () => {
  it('health и уже отрендеренные файлы открыты', async () => {
    for (const url of [
      '/health',
      '/renders/abc.mp4',
      '/hls/x/index.m3u8',
      '/s3/assets/a.png',
    ]) {
      expect(isPublic({ url, method: 'GET' } as never), url).toBe(true)
    }
  })

  it('лента читается свободно, но публикация в неё — нет', async () => {
    expect(
      isPublic({ url: '/api/feed?limit=10', method: 'GET' } as never)
    ).toBe(true)
    expect(
      isPublic({ url: '/api/feed/publish', method: 'POST' } as never)
    ).toBe(false)
  })

  it('дорогие эндпоинты закрыты', async () => {
    for (const url of [
      '/upload',
      '/render',
      '/transcribe',
      '/api/generate/video',
    ]) {
      expect(isPublic({ url, method: 'POST' } as never), url).toBe(false)
    }
  })
})
