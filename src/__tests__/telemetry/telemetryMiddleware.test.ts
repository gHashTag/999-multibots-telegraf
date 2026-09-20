/**
 * The middleware sits in front of every update in production. Two properties
 * matter more than the data it collects: it must not record noise, and it must
 * not be able to break an update.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const recorded: Array<Record<string, unknown>> = []
let recorderThrows = false

vi.mock('@/core/telemetry/clientEvents', () => ({
  recordClientEvent: vi.fn(async (e: Record<string, unknown>) => {
    if (recorderThrows) throw new Error('telemetry database is down')
    recorded.push(e)
  }),
}))

import { createClientTelemetryMiddleware } from '@/core/telemetry/telemetryMiddleware'

type Ctx = Record<string, unknown>

function ctxIn(sceneId: string | null): Ctx {
  return {
    from: { id: 777, username: 'vasya' },
    botInfo: { username: 'neuro_blogger_bot' },
    session: { __scenes: sceneId ? { current: sceneId } : {} },
  }
}

/** Telegraf hands the handler control; the handler moves the user's scene. */
function moveTo(ctx: Ctx, sceneId: string | null) {
  return async () => {
    ;(ctx.session as { __scenes: Record<string, unknown> }).__scenes = sceneId
      ? { current: sceneId }
      : {}
  }
}

describe('client telemetry middleware', () => {
  beforeEach(() => {
    recorded.length = 0
    recorderThrows = false
  })

  it('records one event when the update moves the client to another scene', async () => {
    const mw = createClientTelemetryMiddleware()
    const ctx = ctxIn('main_menu')
    await mw(ctx as never, moveTo(ctx, 'neuro_photo'))
    expect(recorded).toHaveLength(1)
    expect(recorded[0]).toMatchObject({
      telegramId: '777',
      botName: 'neuro_blogger_bot',
      username: 'vasya',
      fromScene: 'main_menu',
      toScene: 'neuro_photo',
    })
  })

  it('records nothing while the client keeps working inside one scene', async () => {
    const mw = createClientTelemetryMiddleware()
    const ctx = ctxIn('neuro_photo')
    await mw(ctx as never, moveTo(ctx, 'neuro_photo'))
    await mw(ctx as never, moveTo(ctx, 'neuro_photo'))
    expect(recorded).toHaveLength(0)
  })

  it('records leaving a scene for no scene at all', async () => {
    const mw = createClientTelemetryMiddleware()
    const ctx = ctxIn('neuro_photo')
    await mw(ctx as never, moveTo(ctx, null))
    expect(recorded).toHaveLength(1)
    expect(recorded[0]).toMatchObject({
      fromScene: 'neuro_photo',
      toScene: null,
    })
  })

  it('lets the handler error through unchanged, and still records the move', async () => {
    const mw = createClientTelemetryMiddleware()
    const ctx = ctxIn('main_menu')
    const boom = async () => {
      await moveTo(ctx, 'neuro_photo')()
      throw new Error('handler failed')
    }
    await expect(mw(ctx as never, boom)).rejects.toThrow('handler failed')
    expect(recorded).toHaveLength(1)
  })

  it('does not fail the update when the telemetry database is down', async () => {
    recorderThrows = true
    const mw = createClientTelemetryMiddleware()
    const ctx = ctxIn('main_menu')
    await expect(
      mw(ctx as never, moveTo(ctx, 'neuro_photo'))
    ).resolves.toBeUndefined()
  })

  it('ignores updates with no author', async () => {
    const mw = createClientTelemetryMiddleware()
    const ctx = ctxIn('main_menu')
    delete ctx.from
    await mw(ctx as never, moveTo(ctx, 'neuro_photo'))
    expect(recorded).toHaveLength(0)
  })
})
