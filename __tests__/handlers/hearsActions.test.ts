import { registerHearsActions } from '@/handlers/hearsActions'
import makeMockContext from '../utils/mockTelegrafContext'
import { defaultSession } from '@/store'
import { ModeEnum } from '@/interfaces'

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
    expect(hearsCalls[0].patterns).toEqual([
      '🎙️ Текст в голос',
      '🎙️ Text to speech',
    ])
    expect(hearsCalls[1].patterns).toEqual(['🏠 Главное меню', '🏠 Main menu'])
    expect(hearsCalls[2].patterns).toEqual([
      '🎥 Сгенерировать новое видео?',
      '🎥 Generate new video?',
    ])
  })

  it('handler for text_to_speech sets session.mode and enters scene', async () => {
    registerHearsActions(bot)
    const ctx = makeMockContext()
    ctx.session = { ...defaultSession }
    ctx.scene.enter = jest.fn(() => Promise.resolve())
    const handler = hearsCalls[0].handler
    await handler(ctx)
    expect(ctx.session.mode).toBe(ModeEnum.TextToSpeech)
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.TextToSpeech)
  })

  it('handler for main_menu sets session.mode and enters scene', async () => {
    registerHearsActions(bot)
    const ctx = makeMockContext()
    ctx.session = { ...defaultSession }
    ctx.scene.enter = jest.fn(() => Promise.resolve())
    const handler = hearsCalls[1].handler
    await handler(ctx)
    expect(ctx.session.mode).toBe(ModeEnum.MainMenu)
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.MenuScene)
  })

  it('handler for generate new video enters correct scene based on mode', async () => {
    registerHearsActions(bot)
    const ctx = makeMockContext()
    ctx.session = { ...defaultSession, mode: ModeEnum.TextToVideo }
    ctx.scene.enter = jest.fn(() => Promise.resolve())
    ctx.reply = jest.fn(() => Promise.resolve({} as any))
    const handler = hearsCalls[2].handler
    await handler(ctx)
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.TextToVideo)

    // test image_to_video
    ctx.session.mode = ModeEnum.ImageToVideo
    jest.clearAllMocks()
    await handler(ctx)
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.ImageToVideo)

    // test fallback
    ctx.session.mode = ModeEnum.MainMenu
    jest.clearAllMocks()
    await handler(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('You cannot generate a new video in this mode')
    )
  })
})
