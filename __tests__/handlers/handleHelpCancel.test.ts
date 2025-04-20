import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import makeMockContext from '../utils/mockTelegrafContext'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'

describe('handleHelpCancel', () => {
  let ctx: ReturnType<typeof makeMockContext>

  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    // ensure clean reply and scene mocks
    ctx.reply = jest.fn(() => Promise.resolve()) as any
    ctx.scene.enter = jest.fn(() => Promise.resolve())
    ctx.scene.leave = jest.fn(() => Promise.resolve())
  })

  it('handles Russian cancel command', async () => {
    ctx.from = { language_code: 'ru' } as any
    ctx.message = { text: 'Отмена' } as any
    const result = await handleHelpCancel(ctx as any)
    expect(result).toBe(true)
    expect(ctx.reply).toHaveBeenCalledWith('❌ Процесс отменён.')
    expect(ctx.scene.enter).toHaveBeenCalledWith('menuScene')
    expect(ctx.scene.leave).not.toHaveBeenCalled()
  })

  it('handles English cancel command', async () => {
    ctx.from = { language_code: 'en' } as any
    ctx.message = { text: 'Cancel' } as any
    const result = await handleHelpCancel(ctx as any)
    expect(result).toBe(true)
    expect(ctx.reply).toHaveBeenCalledWith('❌ Process cancelled.')
    expect(ctx.scene.enter).toHaveBeenCalledWith('menuScene')
    expect(ctx.scene.leave).not.toHaveBeenCalled()
  })

  it('handles Russian help for the command', async () => {
    ctx.from = { language_code: 'ru' } as any
    ctx.message = { text: 'Справка по команде' } as any
    const result = await handleHelpCancel(ctx as any)
    expect(result).toBe(true)
    expect(ctx.reply).not.toHaveBeenCalled()
    expect(ctx.scene.enter).toHaveBeenCalledWith('helpScene')
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('handles English help for the command', async () => {
    ctx.from = { language_code: 'en' } as any
    ctx.message = { text: 'Help for the command' } as any
    const result = await handleHelpCancel(ctx as any)
    expect(result).toBe(true)
    expect(ctx.reply).not.toHaveBeenCalled()
    expect(ctx.scene.enter).toHaveBeenCalledWith('helpScene')
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('returns false for non-matching text', async () => {
    ctx.from = { language_code: 'ru' } as any
    ctx.message = { text: 'something else' } as any
    const result = await handleHelpCancel(ctx as any)
    expect(result).toBe(false)
    expect(ctx.reply).not.toHaveBeenCalled()
    expect(ctx.scene.enter).not.toHaveBeenCalled()
    expect(ctx.scene.leave).not.toHaveBeenCalled()
  })

  it('returns false when message is missing', async () => {
    ctx.from = { language_code: 'en' } as any
    ctx.message = undefined as any
    const result = await handleHelpCancel(ctx as any)
    expect(result).toBe(false)
  })
})