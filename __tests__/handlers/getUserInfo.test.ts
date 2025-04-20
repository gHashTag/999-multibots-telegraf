import { getUserInfo } from '@/handlers/getUserInfo'
import makeMockContext from '../utils/mockTelegrafContext'

describe('getUserInfo', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns userId and telegramId when ctx.from.id exists', () => {
    const ctx = makeMockContext({
      message: {
        from: {
          id: 123,
          language_code: 'ru',
          is_bot: false,
          first_name: 'Test',
        },
      },
    } as any)
    ctx.reply = jest.fn(() => Promise.resolve()) as any
    ctx.scene.leave = jest.fn(() => Promise.resolve())

    const result = getUserInfo(ctx as any)
    expect(result).toEqual({ userId: 123, telegramId: '123' })
    expect(ctx.reply).not.toHaveBeenCalled()
    expect(ctx.scene.leave).not.toHaveBeenCalled()
  })

  it('replies error and leaves scene when ctx.from.id is missing', () => {
    const ctx = makeMockContext({
      message: {
        from: { language_code: 'ru', is_bot: false, first_name: 'Test' },
      },
    } as any)
    ctx.reply = jest.fn(() => Promise.resolve()) as any
    ctx.scene.leave = jest.fn(() => Promise.resolve())

    const result = getUserInfo(ctx as any)
    expect(ctx.reply).toHaveBeenCalledWith(
      '❌ Ошибка идентификации пользователя'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
    expect(result).toEqual({ userId: undefined, telegramId: undefined })
  })

  it('uses English message when language_code is not ru', () => {
    const ctx = makeMockContext({
      message: {
        from: { language_code: 'en', is_bot: false, first_name: 'Test' },
      },
    } as any)
    ctx.reply = jest.fn(() => Promise.resolve()) as any
    ctx.scene.leave = jest.fn(() => Promise.resolve())

    const result = getUserInfo(ctx as any)
    expect(ctx.reply).toHaveBeenCalledWith('❌ User identification error')
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})
