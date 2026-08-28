/**
 * Tests for inngest client.ts
 *
 * Inngest client configuration and event sending
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock logger before imports
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

// Mock Inngest class
const mockSend = vi.fn()
vi.mock('inngest', () => ({
  Inngest: vi.fn().mockImplementation(() => ({
    send: mockSend,
  })),
}))

describe('inngest client', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset modules to re-initialize with new env
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('INNGEST_EVENTS', () => {
    /**
     * Раньше здесь было девять тестов, сверявших константы с ЗАХАРДКОЖЕННЫМИ
     * строками: `expect(INNGEST_EVENTS.RENDER_RIDDLE).toBe('render/riddle')`.
     *
     * Такой тест не проверяет ничего: он повторяет то же значение, что и файл
     * с константами, и потому был зелёным всё время, пока 17 из 24 констант
     * называли события, на которые НИКТО не подписан. Функция renderRiddle
     * объявлена как `{ event: 'render-riddle' }` — без слэша, — а константа
     * говорила 'render/riddle'. Отправка по константе уходила в пустоту, и
     * Inngest не считал это ошибкой.
     *
     * Настоящий контракт другой: **каждое имя обязано совпадать с тем, на что
     * реально подписана хоть одна функция.** Его и проверяем — по исходникам,
     * а не по копии той же строки.
     *
     * Полная проверка всех карт имён живёт в
     * src/__tests__/inngest/event-seams.test.ts.
     */
    it('каждая константа называет событие, на которое кто-то подписан', async () => {
      const fs = await import('fs')
      const path = await import('path')

      const strip = (s: string) =>
        s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

      const files: string[] = []
      ;(function walk(dir: string) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          if (e.name === 'node_modules' || e.name === '__tests__') continue
          const p = path.join(dir, e.name)
          if (e.isDirectory()) walk(p)
          else if (p.endsWith('.ts') && !p.includes('/test/')) files.push(p)
        }
      })('src')

      const listeners = new Set<string>()
      for (const f of files) {
        for (const m of strip(fs.readFileSync(f, 'utf8')).matchAll(
          /\bevent:\s*['"]([a-zA-Z0-9_./-]+)['"]/g
        )) {
          listeners.add(m[1])
        }
      }
      // Страховка от самого себя: если разбор перестанет находить подписчиков,
      // проверка ниже станет зелёной и бессмысленной.
      expect(listeners.size).toBeGreaterThan(20)

      const { INNGEST_EVENTS } = await import('@/inngest_app/client')
      const orphans = Object.entries(INNGEST_EVENTS)
        .filter(([, value]) => !listeners.has(value as string))
        .map(([key, value]) => `${key} = '${value}'`)

      expect(orphans).toEqual([])
    })

    it('значения уникальны — две константы не могут звать одно и то же', async () => {
      const { INNGEST_EVENTS } = await import('@/inngest_app/client')
      const values = Object.values(INNGEST_EVENTS)
      expect(new Set(values).size).toBe(values.length)
    })
  })

  describe('isInngestConfigured', () => {
    it('should return false when both keys are missing', async () => {
      delete process.env.INNGEST_EVENT_KEY
      delete process.env.INNGEST_SIGNING_KEY

      const { isInngestConfigured } = await import('@/inngest_app/client')
      const result = isInngestConfigured()

      expect(result).toBe(false)
    })

    it('should return false when only event key is set', async () => {
      process.env.INNGEST_EVENT_KEY = 'test-event-key'
      delete process.env.INNGEST_SIGNING_KEY

      const { isInngestConfigured } = await import('@/inngest_app/client')
      const result = isInngestConfigured()

      expect(result).toBe(false)
    })

    it('should return false when only signing key is set', async () => {
      delete process.env.INNGEST_EVENT_KEY
      process.env.INNGEST_SIGNING_KEY = 'test-signing-key'

      const { isInngestConfigured } = await import('@/inngest_app/client')
      const result = isInngestConfigured()

      expect(result).toBe(false)
    })

    it('should return true when both keys are set', async () => {
      process.env.INNGEST_EVENT_KEY = 'test-event-key'
      process.env.INNGEST_SIGNING_KEY = 'test-signing-key'

      const { isInngestConfigured } = await import('@/inngest_app/client')
      const result = isInngestConfigured()

      expect(result).toBe(true)
    })
  })

  describe('sendInngestEvent', () => {
    beforeEach(() => {
      vi.resetModules()
      mockSend.mockReset()
      // Set required env var for tests
      process.env.INNGEST_EVENT_KEY = 'test-event-key'
    })

    it('should send event successfully', async () => {
      mockSend.mockResolvedValue({ ids: ['event-123'] })

      const { sendInngestEvent, INNGEST_EVENTS } = await import(
        '@/inngest_app/client'
      )
      const { logger } = await import('@/utils/logger')

      await sendInngestEvent(INNGEST_EVENTS.NEURO_IMAGE_GENERATION, {
        userId: '123',
        prompt: 'test prompt',
      })

      // Имя берём из той же константы, что и вызов: тест проверяет, что
      // sendInngestEvent передаёт имя без изменений, а не то, какое оно.
      // Правильность самого имени проверяет соседний тест — сверкой с тем, на
      // что подписаны функции.
      expect(mockSend).toHaveBeenCalledWith({
        name: INNGEST_EVENTS.NEURO_IMAGE_GENERATION,
        data: { userId: '123', prompt: 'test prompt' },
      })
      // Check that success was logged (without arguments check due to module init logs)
      expect(logger.info).toHaveBeenCalled()
    })

    it('should throw error on send failure', async () => {
      mockSend.mockRejectedValue(new Error('Network error'))

      const { sendInngestEvent, INNGEST_EVENTS } = await import(
        '@/inngest_app/client'
      )
      const { logger } = await import('@/utils/logger')

      await expect(
        sendInngestEvent(INNGEST_EVENTS.PAYMENT_PROCESSING, {
          paymentId: '456',
        })
      ).rejects.toThrow('Network error')

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send event'),
        expect.any(Object)
      )
    })

    it('should log event details before sending', async () => {
      mockSend.mockResolvedValue({ ids: ['event-123'] })

      const { sendInngestEvent, INNGEST_EVENTS } = await import(
        '@/inngest_app/client'
      )
      const { logger } = await import('@/utils/logger')

      await sendInngestEvent(INNGEST_EVENTS.BROADCAST_MESSAGE, {
        message: 'Hello',
        targets: ['user1', 'user2'],
      })

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Sending event'),
        expect.objectContaining({
          eventName: INNGEST_EVENTS.BROADCAST_MESSAGE,
          dataKeys: ['message', 'targets'],
        })
      )
    })
  })
})
