/**
 * videoDurationScene must not throw when the session names a model that no
 * longer exists.
 *
 * selectedVideoModel is a plain string kept in the session; it survives a
 * deploy, so after a model is renamed or removed the session can still carry
 * its id. The step looked it up with VIDEO_MODELS[modelId] and immediately read
 * model.apiSettings — on undefined that throws and the whole enter handler dies.
 * The guard turns that into a friendly "model unavailable, start again".
 */
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'

vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => false),
}))
vi.mock('@/handlers/handleTextToVideoDirect', () => ({
  handleTextToVideoDirect: vi.fn(async () => {}),
}))
vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { Context } from 'telegraf'
import { videoDurationScene } from '@/scenes/videoDurationScene'
import { handleTextToVideoDirect } from '@/handlers/handleTextToVideoDirect'

const generate = handleTextToVideoDirect as unknown as Mock

function makeCtx(session: Record<string, unknown>) {
  const update: any = {
    update_id: 1,
    message: {
      message_id: 1,
      date: 0,
      chat: { id: 1, type: 'private' },
      from: { id: 1, is_bot: false, first_name: 'U' },
      text: 'x',
    },
  }
  const sent: any[] = []
  const telegram: any = {
    sendMessage: async (_c: any, t: any) => {
      sent.push(t)
      return { message_id: 2 }
    },
    editMessageText: async () => true,
    callApi: async () => ({}),
  }
  const ctx: any = new Context(update, telegram, { username: 'b' } as any)
  const leave = vi.fn(async () => {})
  ctx.scene = { leave, current: { id: 'video_duration_scene' }, state: {} }
  ctx.session = session
  return { ctx, sent, leave }
}

const enter = (ctx: any) =>
  (videoDurationScene as any).enterMiddleware()(ctx, async () => {})

describe('videoDurationScene guards an unknown model', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not throw on a model id that is not in VIDEO_MODELS', async () => {
    const { ctx, sent, leave } = makeCtx({
      selectedVideoModel: 'ghost-model-that-was-removed',
      videoPrompt: 'a cat',
    })
    await expect(enter(ctx)).resolves.not.toThrow()
    expect(sent.length).toBe(1)
    expect(leave).toHaveBeenCalledTimes(1)
    expect(generate).not.toHaveBeenCalled()
  })

  it('still leaves early when session data is missing', async () => {
    const { ctx, sent, leave } = makeCtx({})
    await expect(enter(ctx)).resolves.not.toThrow()
    expect(sent.length).toBe(1)
    expect(leave).toHaveBeenCalledTimes(1)
  })
})
