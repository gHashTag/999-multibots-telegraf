import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { registerHearsActions } from '@/handlers/hearsActions'
import makeMockContext from '../utils/mockTelegrafContext'

describe('registerHearsActions', () => {
  let bot: any
  let hearsCalls: any[]
  beforeEach(() => {
    hearsCalls = []
    bot = {
      hears: jest.fn((patterns: string[], handler: Function) => {
        hearsCalls.push({ patterns, handler })
      }),
    }
  })

  it('registers three hears actions', () => {
    registerHearsActions(bot)
    expect(bot.hears).toHaveBeenCalledTimes(3)
    expect(hearsCalls[0].patterns).toEqual(['🎙️ Текст в голос', '🎙️ Text to speech'])
    expect(hearsCalls[1].patterns).toEqual(['🏠 Главное меню', '🏠 Main menu'])
    expect(hearsCalls[2].patterns).toEqual([
      '🎥 Сгенерировать новое видео?',
      '🎥 Generate new video?',
    ])
  })

  it('handler for text_to_speech sets session.mode and enters scene', async () => {
    registerHearsActions(bot)
    const ctx = makeMockContext()
    ctx.session = {}
    ctx.scene.enter = jest.fn(() => Promise.resolve())
    const handler = hearsCalls[0].handler
    await handler(ctx)
    expect(ctx.session.mode).toBe('text_to_speech')
    expect(ctx.scene.enter).toHaveBeenCalledWith('text_to_speech')
  })

  it('handler for main_menu sets session.mode and enters scene', async () => {
    registerHearsActions(bot)
    const ctx = makeMockContext()
    ctx.session = {}
    ctx.scene.enter = jest.fn(() => Promise.resolve())
    const handler = hearsCalls[1].handler
    await handler(ctx)
    expect(ctx.session.mode).toBe('main_menu')
    expect(ctx.scene.enter).toHaveBeenCalledWith('menuScene')
  })

  it('handler for generate new video enters correct scene based on mode', async () => {
    registerHearsActions(bot)
    const ctx = makeMockContext()
    ctx.session = { mode: 'text_to_video' }
    ctx.scene.enter = jest.fn(() => Promise.resolve())
    ctx.reply = jest.fn(() => Promise.resolve())
    const handler = hearsCalls[2].handler
    await handler(ctx)
    expect(ctx.scene.enter).toHaveBeenCalledWith('text_to_video')

    // test image_to_video
    ctx.session.mode = 'image_to_video'
    jest.clearAllMocks()
    await handler(ctx)
    expect(ctx.scene.enter).toHaveBeenCalledWith('image_to_video')

    // test fallback
    ctx.session.mode = 'other'
    jest.clearAllMocks()
    await handler(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('You cannot generate a new video in this mode')
    )
  })
})