/**
 * Guards that can never succeed on retry must throw `NonRetriableError`
 * (design: inngest-spec-first §3.1). Probe evidence: 17 functions burned
 * 3–4 retries (~5 min) on plain `Error` for inputs that were invalid forever.
 *
 * Handler-level checks use `getHandler(fn)` + a pass-through mock `step`.
 * Nothing here sends events or messages: every side-effect module is mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NonRetriableError } from 'inngest'
import { z } from 'zod'

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/services/plan_b/broadcast.service', () => ({
  broadcastService: {
    checkPermissions: vi.fn(),
    fetchUsers: vi.fn(),
    sendMessages: vi.fn(),
    sendToAllUsers: vi.fn(),
    checkOwnerPermissions: vi.fn(),
  },
}))
vi.mock('@/inngest_app/services/bot-adapter', () => ({
  getBotByNameAdapter: vi.fn(() => ({ bot: null, error: 'no bot' })),
}))
vi.mock('@/core/bot', () => ({ getBotByName: vi.fn(() => ({ bot: null })) }))
vi.mock('axios', () => ({ default: vi.fn(), get: vi.fn(), post: vi.fn() }))

import { parseEventData, requireValue } from '@/inngest_app/guards'
import {
  validateRenderEventData,
  validateRenderRiddleEventData,
  validateRenderAvatarVideoEventData,
} from '@/inngest_app/functions/render/schemas'
import {
  renderErrorText,
  renderErrorStack,
} from '@/inngest_app/functions/monitoring/criticalErrorMonitor'
import { generateAIReelsFunction } from '@/inngest_app/functions/existing/generateAIReelsFunction'
import { aiReelsCallbackFunction } from '@/inngest_app/functions/ai-reels-callback'
import { broadcastMessage } from '@/inngest_app/functions/broadcast/broadcastMessage'
import { getHandler } from '@/inngest_app/test/utils/test-helpers'

const step = {
  run: vi.fn(async (_name: string, fn: () => any) => fn()),
  sleep: vi.fn(async () => undefined),
  sendEvent: vi.fn(async () => undefined),
}
// Inngest passes a per-run logger into the handler context.
const ctxLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.INNGEST_SAFE_MODE
})

async function rejectsNonRetriable(p: Promise<unknown>, msg?: RegExp | string) {
  await expect(p).rejects.toBeInstanceOf(NonRetriableError)
  if (msg) await expect(p).rejects.toThrow(msg)
}

describe('guards.ts', () => {
  it('parseEventData → NonRetriableError with compact path list', () => {
    const schema = z.object({ telegram_id: z.string(), n: z.number() })
    try {
      parseEventData(schema, { n: 'x' }, 'test payload')
      throw new Error('did not throw')
    } catch (e: any) {
      expect(e).toBeInstanceOf(NonRetriableError)
      expect(e.message).toContain('Invalid test payload')
      expect(e.message).toContain('telegram_id')
      expect(e.message).toContain('n:')
    }
    expect(parseEventData(schema, { telegram_id: '1', n: 2 })).toEqual({ telegram_id: '1', n: 2 })
  })

  it('requireValue → NonRetriableError on null/undefined/empty', () => {
    for (const v of [null, undefined, '']) {
      expect(() => requireValue(v as any, 'missing')).toThrow(NonRetriableError)
    }
    expect(requireValue(0, 'x')).toBe(0)
    expect(requireValue('a', 'x')).toBe('a')
  })
})

describe('render schemas', () => {
  it('all three validators throw NonRetriableError on bad input', () => {
    expect(() => validateRenderEventData({})).toThrow(NonRetriableError)
    expect(() => validateRenderRiddleEventData({ nope: 1 })).toThrow(NonRetriableError)
    expect(() => validateRenderAvatarVideoEventData(null)).toThrow(NonRetriableError)
  })
})

describe('critical-error-monitor: renderErrorText', () => {
  it('never renders [object Object]', () => {
    const cases: unknown[] = [
      { message: 'boom', name: 'TypeError' },
      { error: 'nested string' },
      { code: 'E1', detail: { x: 1 } },
      new Error('real error'),
      'plain',
      undefined,
      null,
      42,
    ]
    for (const c of cases) {
      const text = renderErrorText(c)
      expect(text).not.toContain('[object Object]')
      expect(text.length).toBeGreaterThan(0)
    }
    expect(renderErrorText({ message: 'boom', name: 'TypeError' })).toBe('TypeError: boom')
    expect(renderErrorText(undefined)).toBe('Unknown error')
    expect(renderErrorText({ code: 'E1' })).toBe('{"code":"E1"}')
  })

  it('renderErrorStack accepts string or Error-like', () => {
    // (raw stack field, error field): string stack wins, else Error-like.stack
    expect(renderErrorStack('at x', undefined)).toBe('at x')
    expect(renderErrorStack(undefined, { stack: 'from error' })).toBe('from error')
    expect(renderErrorStack(undefined, {})).toBeUndefined()
  })
})

describe('ai-reels-generation: validate-input is the first step', () => {
  const handler = getHandler(generateAIReelsFunction)

  it('rejects missing telegramId / imageUrl / text+audio with NonRetriableError', async () => {
    const p = handler({ event: { name: 'reels/ai.generate', data: {} }, step })
    await rejectsNonRetriable(p, /validate-input failed/)
    expect(step.run.mock.calls[0][0]).toBe('validate-input')
    expect(step.run).toHaveBeenCalledTimes(1)
  })

  it('rejects non-http imageUrl', async () => {
    const p = handler({
      event: {
        name: 'reels/ai.generate',
        data: { telegramId: '1', imageUrl: 'file:///x.png', text: 'hi' },
      },
      step,
    })
    await rejectsNonRetriable(p, /imageUrl/)
  })
})

describe('ai-reels-callback: malformed callback payloads are terminal', () => {
  const handler = getHandler(aiReelsCallbackFunction)

  it('cannot extract job_id → NonRetriableError', async () => {
    await rejectsNonRetriable(
      handler({ event: { name: 'reels/ai.callback', data: { status: 'completed' } }, step, logger: ctxLogger }),
      /Cannot extract job_id/
    )
  })

  it('completed without video url → NonRetriableError', async () => {
    await rejectsNonRetriable(
      handler({
        event: {
          name: 'reels/ai.callback',
          data: { job_id: 'telegram-144022504-1', status: 'completed' },
        },
        step,
        logger: ctxLogger,
      }),
      /No video URL/
    )
  })
})

describe('broadcast-message-send: validate-input', () => {
  const handler = getHandler(broadcastMessage)

  it('missing text on one language → NonRetriableError (no users fetched)', async () => {
    const { broadcastService } = await import('@/services/plan_b/broadcast.service')
    await rejectsNonRetriable(
      handler({
        event: {
          name: 'broadcast/message.send',
          data: { textRu: 'x', contentType: 'text', ownerTelegramId: '1' },
        },
        step,
      })
    )
    expect((broadcastService as any).fetchUsers).not.toHaveBeenCalled()
    expect((broadcastService as any).sendMessages).not.toHaveBeenCalled()
  })
})
