/**
 * Клиент удалённого рендера: отказы честные, успех без результата — отказ.
 *
 * Почему это стережётся: прежние пути к рендеру молчали тремя способами —
 * событие без подписчика, мёртвый хост в fallback-цепочке, «готово» без
 * файла. Каждая проверка здесь закрывает один из этих способов.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const post = vi.fn()
const get = vi.fn()
vi.mock('axios', () => ({ default: { post: (...a: unknown[]) => post(...a), get: (...a: unknown[]) => get(...a) } }))
vi.mock('@/utils/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))

import { renderOnServer } from '@/services/renderServer/client'

const ENV_KEYS = ['RENDER_SERVER_URL', 'RAILWAY_SERVICE_VIBEE_RENDER_URL', 'RENDER_API_KEY']
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k] }
  post.mockReset(); get.mockReset()
})
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('renderOnServer', () => {
  it('без адреса сервера — отказ, а не мёртвый литерал', async () => {
    // Мутация: добавь fallback-хост в renderServerBaseUrl — тест упадёт,
    // потому что вызов уйдёт в сеть вместо честного отказа.
    await expect(
      renderOnServer({ compositionId: 'X', inputProps: {} })
    ).rejects.toThrow(/не настроен/)
    expect(post).not.toHaveBeenCalled()
  })

  it('отказ сервера на приёме — с кодом и телом', async () => {
    process.env.RENDER_SERVER_URL = 'https://render.test'
    post.mockResolvedValue({ status: 400, data: { error: 'Unknown compositionId' } })
    await expect(
      renderOnServer({ compositionId: 'Nope', inputProps: {} })
    ).rejects.toThrow(/HTTP 400.*Unknown compositionId/)
  })

  it('completed без ссылки на файл — отказ, а не успех', async () => {
    process.env.RENDER_SERVER_URL = 'https://render.test'
    post.mockResolvedValue({ status: 202, data: { renderId: 'r1' } })
    get.mockResolvedValue({ status: 200, data: { status: 'completed' } })
    await expect(
      renderOnServer({ compositionId: 'SplitTalkingHead', inputProps: {}, timeoutMs: 30000 })
    ).rejects.toThrow(/без ссылки/)
  }, 15000)

  it('completed со ссылкой — абсолютный адрес', async () => {
    process.env.RENDER_SERVER_URL = 'https://render.test'
    post.mockResolvedValue({ status: 202, data: { renderId: 'r2' } })
    get.mockResolvedValue({
      status: 200,
      data: { status: 'completed', outputUrl: '/renders/r2.mp4' },
    })
    const res = await renderOnServer({
      compositionId: 'SplitTalkingHead',
      inputProps: {},
      timeoutMs: 30000,
    })
    expect(res.outputUrl).toBe('https://render.test/renders/r2.mp4')
  }, 15000)
})
