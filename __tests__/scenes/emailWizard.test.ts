import makeMockContext from '../utils/mockTelegrafContext'
import emailWizard from '../../src/scenes/emailWizard'
import * as supabaseHelpers from '@/core/supabase'
import * as helpers from '@/helpers'
import * as handlers from '@/handlers/handleHelpCancel'

// Mock dependencies
jest.mock('@/core/supabase')
jest.mock('@/helpers')
jest.mock('@/handlers/handleHelpCancel')

// Typing mocks using jest.mocked()
const mockedSaveUserEmail = jest.mocked(supabaseHelpers.saveUserEmail)
const mockedIsRussian = jest.mocked(helpers.isRussian)
const mockedHandleCancel = jest.mocked(handlers.handleHelpCancel)

describe('emailWizard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('.enter', () => {
    it('should prompt for email with cancel button (RU)', async () => {
      mockedIsRussian.mockReturnValueOnce(true)
      const ctx = makeMockContext()
      await emailWizard.enterHandler(ctx, jest.fn())
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
      await emailWizard.enterHandler(ctx, jest.fn())
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

  describe('.hears(/@/) - Email Input', () => {
    it('should save email and show payment options (RU)', async () => {
      mockedIsRussian.mockReturnValueOnce(true)
      mockedSaveUserEmail.mockResolvedValueOnce(undefined)
      const ctx = makeMockContext({
        update_id: 1000,
        message: {
          from: { id: 1, is_bot: false, first_name: 'Test' },
          text: 'user@example.com',
          date: Date.now(),
          message_id: 123,
          chat: { id: 1, type: 'private', first_name: 'Test' },
        },
      })

      const middleware = emailWizard.middleware()
      await middleware(ctx, jest.fn())

      expect(mockedSaveUserEmail).toHaveBeenCalledWith('1', 'user@example.com')
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
      mockedSaveUserEmail.mockRejectedValueOnce(new Error('DB fail'))
      const ctx = makeMockContext({
        update_id: 1001,
        message: {
          from: { id: 1, is_bot: false, first_name: 'Test' },
          text: 'a@b.com',
          date: Date.now(),
          message_id: 124,
          chat: { id: 1, type: 'private', first_name: 'Test' },
        },
      })

      const middleware = emailWizard.middleware()
      await middleware(ctx, jest.fn())

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Error saving e-mail')
      )
    })
  })

  // TODO: Добавить тесты для .on('text', ...) - обработки выбора суммы
  // describe('.on('text') - Amount Selection', () => { ... })
})
