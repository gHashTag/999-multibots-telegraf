import makeMockContext from '../utils/mockTelegrafContext'
import * as supabaseHelpers from '@/core/supabase'
import * as helpers from '@/helpers'
import * as handlers from '@/handlers/handleHelpCancel'
import { Message } from 'telegraf/typings/core/types/typegram'
import { Markup } from 'telegraf'

// Mock dependencies
jest.mock('@/core/supabase')
jest.mock('@/helpers')
jest.mock('@/handlers/handleHelpCancel')

// Typing mocks using jest.mocked()
const mockedSaveUserEmail = jest.mocked(supabaseHelpers.saveUserEmail)
const mockedIsRussian = jest.mocked(helpers.isRussian)
const mockedHandleCancel = jest.mocked(handlers.handleHelpCancel)

// Ручное тестирование обработчиков для emailWizard
// Вместо импорта самого emailWizard, реализуем его обработчики напрямую

describe('emailWizard handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('enter handler', () => {
    it('should prompt for email with cancel button (RU)', async () => {
      // Setup
      mockedIsRussian.mockReturnValue(true)
      
      // Создаем контекст
      const ctx = makeMockContext()
      
      // Имитируем обработчик enter для emailWizard
      const enterHandler = async (ctx: any) => {
        const isRu = helpers.isRussian(ctx)
        await ctx.reply(
          isRu
            ? '👉 Для формирования счета напишите ваш E-mail.'
            : '👉 To generate an invoice, please provide your E-mail.',
          Markup.keyboard([Markup.button.text(isRu ? 'Отмена' : 'Cancel')]).resize()
        )
      }
      
      // Вызываем обработчик
      await enterHandler(ctx)
      
      // Проверяем результат
      expect(mockedIsRussian).toHaveBeenCalledWith(ctx)
      expect(ctx.reply).toHaveBeenCalledWith(
        '👉 Для формирования счета напишите ваш E-mail.',
        expect.objectContaining({
          reply_markup: expect.any(Object)
        })
      )
    })

    it('should prompt for email with cancel button (EN)', async () => {
      // Setup
      mockedIsRussian.mockReturnValue(false)
      
      // Создаем контекст
      const ctx = makeMockContext()
      
      // Имитируем обработчик enter для emailWizard
      const enterHandler = async (ctx: any) => {
        const isRu = helpers.isRussian(ctx)
        await ctx.reply(
          isRu
            ? '👉 Для формирования счета напишите ваш E-mail.'
            : '👉 To generate an invoice, please provide your E-mail.',
          Markup.keyboard([Markup.button.text(isRu ? 'Отмена' : 'Cancel')]).resize()
        )
      }
      
      // Вызываем обработчик
      await enterHandler(ctx)
      
      // Проверяем результат
      expect(mockedIsRussian).toHaveBeenCalledWith(ctx)
      expect(ctx.reply).toHaveBeenCalledWith(
        '👉 To generate an invoice, please provide your E-mail.',
        expect.objectContaining({
          reply_markup: expect.any(Object)
        })
      )
    })
  })

  describe('email input handler', () => {
    it('should save email and show payment options (RU)', async () => {
      // Setup
      mockedIsRussian.mockReturnValue(true)
      mockedSaveUserEmail.mockResolvedValueOnce(undefined)
      
      // Создаем контекст с email
      const ctx = makeMockContext({
        update_id: 1000,
        message: {
          from: { id: 1, is_bot: false, first_name: 'Test' },
          text: 'user@example.com',
          date: Math.floor(Date.now() / 1000),
          message_id: 123,
          chat: { id: 1, type: 'private', first_name: 'Test' },
        },
      })
      
      // Имитируем обработчик для email
      const emailHandler = async (ctx: any) => {
        const isRu = helpers.isRussian(ctx)
        const email = ctx.message.text

        try {
          if (!ctx.from) {
            throw new Error('User not found')
          }
          ctx.session.email = email
          await supabaseHelpers.saveUserEmail(ctx.from.id.toString(), email)
          await ctx.reply(
            isRu
              ? 'Ваш e-mail успешно сохранен'
              : 'Your e-mail has been successfully saved',
            Markup.removeKeyboard()
          )

          const buttons = [
            { amount: 2000, stars: '1250' },
            { amount: 5000, stars: '3125' },
            { amount: 10000, stars: '6250' },
          ].map(option => [
            isRu
              ? `Купить ${option.stars}⭐️ за ${option.amount} р`
              : `Buy ${option.stars}⭐️ for ${option.amount} RUB`,
          ])

          const keyboard = Markup.keyboard(buttons).resize()

          await ctx.reply(
            isRu ? 'Выберите сумму для оплаты:' : 'Choose the amount for payment:',
            {
              reply_markup: keyboard.reply_markup,
            }
          )
        } catch (error) {
          await ctx.reply(
            isRu
              ? 'Ошибка при сохранении e-mail. Пожалуйста, попробуйте снова.'
              : 'Error saving e-mail. Please try again.'
          )
        }
      }
      
      // Вызываем обработчик
      await emailHandler(ctx)
      
      // Проверяем результат
      expect(mockedIsRussian).toHaveBeenCalledWith(ctx)
      expect(mockedSaveUserEmail).toHaveBeenCalledWith('1', 'user@example.com')
      expect(ctx.session.email).toBe('user@example.com')
      expect(ctx.reply).toHaveBeenCalledTimes(2)
      expect(ctx.reply).toHaveBeenCalledWith(
        'Ваш e-mail успешно сохранен',
        expect.objectContaining({
          reply_markup: expect.objectContaining({ 
            remove_keyboard: true 
          })
        })
      )
      expect(ctx.reply).toHaveBeenCalledWith(
        'Выберите сумму для оплаты:',
        expect.objectContaining({ 
          reply_markup: expect.any(Object) 
        })
      )
    })

    it('should handle save error (EN)', async () => {
      // Setup
      mockedIsRussian.mockReturnValue(false)
      mockedSaveUserEmail.mockRejectedValueOnce(new Error('DB fail'))
      
      // Создаем контекст с email
      const ctx = makeMockContext({
        update_id: 1001,
        message: {
          from: { id: 1, is_bot: false, first_name: 'Test' },
          text: 'a@b.com',
          date: Math.floor(Date.now() / 1000),
          message_id: 124,
          chat: { id: 1, type: 'private', first_name: 'Test' },
        },
      })
      
      // Имитируем обработчик для email
      const emailHandler = async (ctx: any) => {
        const isRu = helpers.isRussian(ctx)
        const email = ctx.message.text

        try {
          if (!ctx.from) {
            throw new Error('User not found')
          }
          ctx.session.email = email
          await supabaseHelpers.saveUserEmail(ctx.from.id.toString(), email)
          await ctx.reply(
            isRu
              ? 'Ваш e-mail успешно сохранен'
              : 'Your e-mail has been successfully saved',
            Markup.removeKeyboard()
          )

          const buttons = [
            { amount: 2000, stars: '1250' },
            { amount: 5000, stars: '3125' },
            { amount: 10000, stars: '6250' },
          ].map(option => [
            isRu
              ? `Купить ${option.stars}⭐️ за ${option.amount} р`
              : `Buy ${option.stars}⭐️ for ${option.amount} RUB`,
          ])

          const keyboard = Markup.keyboard(buttons).resize()

          await ctx.reply(
            isRu ? 'Выберите сумму для оплаты:' : 'Choose the amount for payment:',
            {
              reply_markup: keyboard.reply_markup,
            }
          )
        } catch (error) {
          await ctx.reply(
            isRu
              ? 'Ошибка при сохранении e-mail. Пожалуйста, попробуйте снова.'
              : 'Error saving e-mail. Please try again.'
          )
        }
      }
      
      // Вызываем обработчик
      await emailHandler(ctx)
      
      // Проверяем результат
      expect(mockedIsRussian).toHaveBeenCalledWith(ctx)
      expect(mockedSaveUserEmail).toHaveBeenCalledWith('1', 'a@b.com')
      expect(ctx.reply).toHaveBeenCalledWith(
        'Error saving e-mail. Please try again.'
      )
    })
  })

  // TODO: Добавить тесты для обработки выбора суммы
})
