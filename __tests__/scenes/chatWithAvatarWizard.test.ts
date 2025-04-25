/**
 * Tests for chatWithAvatarWizard
 */
import { chatWithAvatarWizard } from '@/scenes/chatWithAvatarWizard'
import makeMockContext from '../utils/mockTelegrafContext'
import { MyContext } from '@/interfaces'

// Mock dependencies
jest.mock('@/helpers/language', () => ({ isRussian: jest.fn() }))
jest.mock('@/menu', () => ({
  createHelpCancelKeyboard: jest.fn(() => ({ reply_markup: { foo: 'bar' } }))
}))
jest.mock('@/handlers', () => ({
  handleHelpCancel: jest.fn(),
}))
jest.mock('@/handlers/handleTextMessage', () => ({
  handleTextMessage: jest.fn(),
}))
jest.mock('@/core/supabase', () => ({
  getUserByTelegramId: jest.fn(),
  updateUserLevelPlusOne: jest.fn(),
}))

// Import mocked modules after mocking
import { isRussian } from '@/helpers/language'
import { createHelpCancelKeyboard } from '@/menu'
import { handleHelpCancel } from '@/handlers'
import { handleTextMessage } from '@/handlers/handleTextMessage'
import {
  getUserByTelegramId,
  updateUserLevelPlusOne,
} from '@/core/supabase'

describe('chatWithAvatarWizard', () => {
  let ctx: MyContext
  let next: jest.Mock
  
  // Мы должны получить шаги как функции из массива steps Scene
  const wizardSteps = chatWithAvatarWizard.steps
  const step0Handler = typeof wizardSteps[0] === 'function' 
    ? wizardSteps[0] 
    : jest.fn()
  const step1Handler = typeof wizardSteps[1] === 'function' 
    ? wizardSteps[1] 
    : jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    next = jest.fn()
  })

  it('step0: sends prompt and calls next()', async () => {
    ctx = makeMockContext({ update_id: 1 })
    jest.mocked(isRussian).mockReturnValue(true)
    
    // Вызываем функцию шага напрямую
    await step0Handler(ctx, next)

    expect(isRussian).toHaveBeenCalledWith(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Напиши мне сообщение 💭 и я отвечу на него',
      expect.objectContaining({ reply_markup: { foo: 'bar' } })
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step1: no message leaves scene', async () => {
    ctx = makeMockContext({ update_id: 2 })
    // Не добавляем сообщение в контекст
    
    await step1Handler(ctx, next)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step1: handleHelpCancel true leaves scene', async () => {
    ctx = makeMockContext({
      update_id: 3,
      message: {
        text: 'hi',
        from: { id: 1, is_bot: false, first_name: 'Test' },
        chat: { id: 1, type: 'private', first_name: 'Test' },
        date: 0,
        message_id: 1,
      },
    })
    jest.mocked(handleHelpCancel).mockResolvedValue(true)
    
    await step1Handler(ctx, next)
    
    expect(handleHelpCancel).toHaveBeenCalledWith(ctx)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step1: processes text and does not update level when level != 4', async () => {
    ctx = makeMockContext({
      update_id: 4,
      message: {
        text: 'hello',
        from: { id: 1, is_bot: false, first_name: 'Test' },
        chat: { id: 1, type: 'private', first_name: 'Test' },
        date: 0,
        message_id: 2,
      },
    })
    jest.mocked(handleHelpCancel).mockResolvedValue(false)
    jest.mocked(getUserByTelegramId).mockResolvedValue({
      data: { level: 3 },
    })

    await step1Handler(ctx, next)

    expect(handleTextMessage).toHaveBeenCalledWith(ctx)
    expect(updateUserLevelPlusOne).not.toHaveBeenCalled()
  })

  it('step1: processes text and updates level when level === 4', async () => {
    const userId = 1
    ctx = makeMockContext({
      update_id: 5,
      message: {
        text: 'hello',
        from: { id: userId, is_bot: false, first_name: 'Test' },
        chat: { id: 1, type: 'private', first_name: 'Test' },
        date: 0,
        message_id: 3,
      },
    })
    jest.mocked(handleHelpCancel).mockResolvedValue(false)
    jest.mocked(getUserByTelegramId).mockResolvedValue({
      data: { level: 4 },
    })

    await step1Handler(ctx, next)

    expect(handleTextMessage).toHaveBeenCalledWith(ctx)
    expect(updateUserLevelPlusOne).toHaveBeenCalledWith(userId.toString(), 4)
  })

  it('step1: throws if user does not exist', async () => {
    const userId = 1
    ctx = makeMockContext({
      update_id: 6,
      message: {
        text: 'hello',
        from: { id: userId, is_bot: false, first_name: 'Test' },
        chat: { id: 1, type: 'private', first_name: 'Test' },
        date: 0,
        message_id: 4,
      },
    })
    jest.mocked(handleHelpCancel).mockResolvedValue(false)
    jest.mocked(getUserByTelegramId).mockResolvedValue({ data: null })

    await expect(step1Handler(ctx, next)).rejects.toThrow(
      `User with ID ${userId} does not exist.`
    )
  })
})
