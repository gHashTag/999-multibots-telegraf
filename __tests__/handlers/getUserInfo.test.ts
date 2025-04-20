import { getUserInfo } from '@/handlers/getUserInfo'
import makeMockContext from '../utils/mockTelegrafContext'

describe('getUserInfo', () => {
  let ctx: ReturnType<typeof makeMockContext>
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    // stub reply and scene.leave
    ctx.reply = jest.fn(() => Promise.resolve()) as any
    ctx.scene.leave = jest.fn(() => Promise.resolve())
    ctx.from = { id: 123, language_code: 'ru' } as any
  })

  it('returns userId and telegramId when ctx.from.id exists', () => {
    const result = getUserInfo(ctx as any)
    expect(result).toEqual({ userId: 123, telegramId: '123' })
    expect(ctx.reply).not.toHaveBeenCalled()
    expect(ctx.scene.leave).not.toHaveBeenCalled()
  })

  it('replies error and leaves scene when ctx.from.id is missing', () => {
    ctx.from = {} as any
    const result = getUserInfo(ctx as any)
    expect(ctx.reply).toHaveBeenCalledWith(
      '❌ Ошибка идентификации пользователя'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
    expect(result).toEqual({ userId: undefined, telegramId: undefined })
  })

  it('uses English message when language_code is not ru', () => {
    ctx.from = { id: 1, language_code: 'en' } as any
    ctx.scene.leave = jest.fn()
    const result = getUserInfo(ctx as any)
    expect(ctx.reply).toHaveBeenCalledWith('❌ User identification error')
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})