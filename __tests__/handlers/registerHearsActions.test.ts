import makeMockContext from '../utils/mockTelegrafContext'
import { defaultSession } from '@/store'

// Mock isRussian
jest.mock('@/helpers/language', () => ({ isRussian: jest.fn() }))
const { isRussian } = require('@/helpers/language')

import { registerHearsActions } from '@/handlers/hearsActions'

describe('registerHearsActions', () => {
  let bot: any
  beforeEach(() => {
    jest.clearAllMocks()
    bot = { hears: jest.fn() }
  })

  it('registers hears for text_to_speech and main menu', () => {
    registerHearsActions(bot)
    // First two calls
    expect(bot.hears).toHaveBeenCalledWith(
      ['🎙️ Текст в голос', '🎙️ Text to speech'],
      expect.any(Function)
    )
    expect(bot.hears).toHaveBeenCalledWith(
      ['🏠 Главное меню', '🏠 Main menu'],
      expect.any(Function)
    )
    // Third call
    expect(bot.hears).toHaveBeenCalledWith(
      ['🎥 Сгенерировать новое видео?', '🎥 Generate new video?'],
      expect.any(Function)
    )
  })

  it('text_to_speech handler sets mode and enters scene', async () => {
    registerHearsActions(bot)
    const handler = bot.hears.mock.calls[0][1]
    const ctx = makeMockContext()
    ctx.session = { ...defaultSession }
    ctx.scene.enter = jest.fn().mockResolvedValue(undefined)
    await handler(ctx)
    expect(ctx.session.mode).toBe('text_to_speech')
    expect(ctx.scene.enter).toHaveBeenCalledWith('text_to_speech')
  })

  it('main menu handler sets mode and enters menuScene', async () => {
    registerHearsActions(bot)
    const handler = bot.hears.mock.calls[1][1]
    const ctx = makeMockContext()
    ctx.session = { ...defaultSession }
    ctx.scene.enter = jest.fn().mockResolvedValue(undefined)
    await handler(ctx)
    expect(ctx.session.mode).toBe('main_menu')
    expect(ctx.scene.enter).toHaveBeenCalledWith('menuScene')
  })

  describe('generate new video handler', () => {
    let handler: any, ctx: any
    beforeEach(() => {
      registerHearsActions(bot)
      handler = bot.hears.mock.calls[2][1]
      ctx = makeMockContext()
      ctx.session = { ...defaultSession }
      ctx.scene.enter = jest.fn().mockResolvedValue(undefined)
      ctx.reply = jest.fn().mockResolvedValue(undefined)
    })

    it('enters text_to_video when mode is text_to_video', async () => {
      ctx.session.mode = 'text_to_video'
      isRussian.mockReturnValue(false)
      await handler(ctx)
      expect(ctx.scene.enter).toHaveBeenCalledWith('text_to_video')
    })

    it('enters image_to_video when mode is image_to_video', async () => {
      ctx.session.mode = 'image_to_video'
      isRussian.mockReturnValue(false)
      await handler(ctx)
      expect(ctx.scene.enter).toHaveBeenCalledWith('image_to_video')
    })

    it('replies error when mode unsupported (English)', async () => {
      ctx.session.mode = 'other'
      isRussian.mockReturnValue(false)
      await handler(ctx)
      expect(ctx.reply).toHaveBeenCalledWith(
        'You cannot generate a new video in this mode'
      )
    })

    it('replies error when mode unsupported (Russian)', async () => {
      ctx.session.mode = 'other'
      isRussian.mockReturnValue(true)
      await handler(ctx)
      expect(ctx.reply).toHaveBeenCalledWith(
        'Вы не можете сгенерировать новое видео в этом режиме'
      )
    })
  })
})
