import { jest, describe, beforeEach, it, expect } from '@jest/globals'
import makeMockContext from '../utils/mockTelegrafContext'
import {
  emailWizardEnterHandler,
  emailWizardEmailHandler,
} from '../../src/scenes/emailWizard'
import { saveUserEmail } from '@/core/supabase'
import { isRussian } from '@/helpers'

// Mock dependencies
jest.mock('@/core/supabase', () => ({
  saveUserEmail: jest.fn(),
  setPayments: jest.fn(),
}))
jest.mock('@/helpers', () => ({
  isRussian: jest.fn(),
}))

describe('emailWizardEnterHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should prompt for email with cancel button (RU)', async () => {
    ;(isRussian as jest.Mock).mockReturnValueOnce(true)
    const ctx = makeMockContext()
    await emailWizardEnterHandler(ctx)
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
    ;(isRussian as jest.Mock).mockReturnValueOnce(false)
    const ctx = makeMockContext()
    await emailWizardEnterHandler(ctx)
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
    ;(isRussian as jest.Mock).mockReturnValueOnce(true)
    const ctx = makeMockContext()
    // @ts-ignore
    ctx.message = { text: 'user@example.com' }
    await emailWizardEmailHandler(ctx)
    expect(saveUserEmail).toHaveBeenCalledWith(
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
    ;(isRussian as jest.Mock).mockReturnValueOnce(false)
    // @ts-ignore
    saveUserEmail.mockRejectedValueOnce(new Error('fail'))
    const ctx = makeMockContext()
    // @ts-ignore
    ctx.message = { text: 'a@b' }
    await emailWizardEmailHandler(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Error saving e-mail')
    )
  })
})
