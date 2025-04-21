import makeMockContext from '../utils/mockTelegrafContext'
import emailWizard from '../../src/scenes/emailWizard'
import { saveUserEmail } from '@/core/supabase'
import { isRussian } from '@/helpers'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'

// Mock dependencies
jest.mock('@/core/supabase', () => ({
  saveUserEmail: jest.fn(),
  setPayments: jest.fn(),
}))
jest.mock('@/helpers', () => ({
  isRussian: jest.fn(),
}))
jest.mock('@/handlers/handleHelpCancel', () => ({
  handleHelpCancel: jest.fn(),
}))

// Typing mocks
const mockedSaveUserEmail = saveUserEmail as jest.Mock<
  (userId: string, email: string) => Promise<void>
>
const mockedIsRussian = isRussian as jest.Mock<() => boolean>
const mockedHandleCancel = handleHelpCancel as jest.Mock<
  (...args: any[]) => Promise<boolean>
>

describe('emailWizardEnterHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should prompt for email with cancel button (RU)', async () => {
    mockedIsRussian.mockReturnValueOnce(true)
    const ctx = makeMockContext()
    await emailWizard.enterHandler(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('👉 Для формирования счета'),
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          keyboard: expect.any(Array),
        }),
      })
    )
  })

  it('should prompt for email with cancel button (EN)', async () => {
    mockedIsRussian.mockReturnValueOnce(false)
    const ctx = makeMockContext()
    await emailWizard.enterHandler(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('To generate an invoice'),
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          keyboard: expect.any(Array),
        }),
      })
    )
  })
})

describe('emailWizardEmailHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should save email and show payment options (RU)', async () => {
    mockedIsRussian.mockReturnValueOnce(true)
    mockedHandleCancel.mockResolvedValueOnce(false)
    mockedSaveUserEmail.mockResolvedValueOnce(undefined)
    const ctx = makeMockContext()
    // @ts-ignore
    ctx.message = { text: 'user@example.com' }
    await emailWizard.emailHandler(ctx)
    expect(mockedSaveUserEmail).toHaveBeenCalledWith(
      ctx.from.id.toString(),
      'user@example.com'
    )
    expect(ctx.session.email).toBe('user@example.com')
    expect(ctx.reply).toHaveBeenCalledTimes(2)
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Ваш e-mail успешно сохранен'),
      expect.objectContaining({
        reply_markup: expect.objectContaining({ remove_keyboard: true }),
      })
    )
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Выберите сумму'),
      expect.objectContaining({ reply_markup: expect.any(Object) })
    )
  })

  it('should handle save error (EN)', async () => {
    mockedIsRussian.mockReturnValueOnce(false)
    // @ts-ignore
    mockedSaveUserEmail.mockRejectedValueOnce(new Error('fail'))
    const ctx = makeMockContext()
    // @ts-ignore
    ctx.message = { text: 'a@b' }
    await emailWizard.emailHandler(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Error saving e-mail')
    )
  })
})
