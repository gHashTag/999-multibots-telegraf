import makeMockContext from '../utils/mockTelegrafContext'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { defaultSession } from '@/store'

describe('handleHelpCancel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('handles Russian cancel command', async () => {
    const ctx = makeMockContext({
      message: {
        text: 'Отмена',
        from: { id: 1, language_code: 'ru', is_bot: false, first_name: 'Test' },
        chat: { id: 1, type: 'private' },
      },
    } as any)
    ctx.session = { ...defaultSession }
    ctx.reply = jest.fn(() => Promise.resolve({} as any))
    ctx.scene.enter = jest.fn(() => Promise.resolve({}))
    ctx.scene.leave = jest.fn(() => Promise.resolve())

    const result = await handleHelpCancel(ctx as any)
    expect(result).toBe(true)
    expect(ctx.reply).toHaveBeenCalledWith('❌ Процесс отменён.')
    expect(ctx.scene.enter).toHaveBeenCalledWith('menuScene')
    expect(ctx.scene.leave).not.toHaveBeenCalled()
  })

  it('handles English cancel command', async () => {
    const ctx = makeMockContext({
      message: {
        text: 'Cancel',
        from: { id: 2, language_code: 'en', is_bot: false, first_name: 'Test' },
        chat: { id: 2, type: 'private' },
      },
    } as any)
    ctx.session = { ...defaultSession }
    ctx.reply = jest.fn(() => Promise.resolve({} as any))
    ctx.scene.enter = jest.fn(() => Promise.resolve({}))
    ctx.scene.leave = jest.fn(() => Promise.resolve())

    const result = await handleHelpCancel(ctx as any)
    expect(result).toBe(true)
    expect(ctx.reply).toHaveBeenCalledWith('❌ Process cancelled.')
    expect(ctx.scene.enter).toHaveBeenCalledWith('menuScene')
    expect(ctx.scene.leave).not.toHaveBeenCalled()
  })

  it('handles Russian help for the command', async () => {
    const ctx = makeMockContext({
      message: {
        text: 'Справка по команде',
        from: { id: 3, language_code: 'ru', is_bot: false, first_name: 'Test' },
        chat: { id: 3, type: 'private' },
      },
    } as any)
    ctx.session = { ...defaultSession }
    ctx.reply = jest.fn(() => Promise.resolve({} as any))
    ctx.scene.enter = jest.fn(() => Promise.resolve({}))
    ctx.scene.leave = jest.fn(() => Promise.resolve())

    const result = await handleHelpCancel(ctx as any)
    expect(result).toBe(true)
    expect(ctx.reply).not.toHaveBeenCalled()
    expect(ctx.scene.enter).toHaveBeenCalledWith('helpScene')
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('handles English help for the command', async () => {
    const ctx = makeMockContext({
      message: {
        text: 'Help for the command',
        from: { id: 4, language_code: 'en', is_bot: false, first_name: 'Test' },
        chat: { id: 4, type: 'private' },
      },
    } as any)
    ctx.session = { ...defaultSession }
    ctx.reply = jest.fn(() => Promise.resolve({} as any))
    ctx.scene.enter = jest.fn(() => Promise.resolve({}))
    ctx.scene.leave = jest.fn(() => Promise.resolve())

    const result = await handleHelpCancel(ctx as any)
    expect(result).toBe(true)
    expect(ctx.reply).not.toHaveBeenCalled()
    expect(ctx.scene.enter).toHaveBeenCalledWith('helpScene')
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('returns false for non-matching text', async () => {
    const ctx = makeMockContext({
      message: {
        text: 'something else',
        from: { id: 5, language_code: 'ru', is_bot: false, first_name: 'Test' },
        chat: { id: 5, type: 'private' },
      },
    } as any)
    ctx.session = { ...defaultSession }
    ctx.reply = jest.fn(() => Promise.resolve({} as any))
    ctx.scene.enter = jest.fn(() => Promise.resolve({}))
    ctx.scene.leave = jest.fn(() => Promise.resolve())

    const result = await handleHelpCancel(ctx as any)
    expect(result).toBe(false)
    expect(ctx.reply).not.toHaveBeenCalled()
    expect(ctx.scene.enter).not.toHaveBeenCalled()
    expect(ctx.scene.leave).not.toHaveBeenCalled()
  })

  it('returns false when message is missing', async () => {
    const ctx = makeMockContext({
      update_id: 6,
      callback_query: {
        from: { id: 6, language_code: 'en', is_bot: false, first_name: 'Test' },
      },
    } as any)
    ctx.session = { ...defaultSession }
    ctx.reply = jest.fn(() => Promise.resolve({} as any))
    ctx.scene.enter = jest.fn(() => Promise.resolve({}))
    ctx.scene.leave = jest.fn(() => Promise.resolve())

    const result = await handleHelpCancel(ctx as any)
    expect(result).toBe(false)
  })
})
