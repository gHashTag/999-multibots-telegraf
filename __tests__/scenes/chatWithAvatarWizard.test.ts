/**
 * Tests for chatWithAvatarWizard
 */
import { chatWithAvatarWizard } from '../../src/scenes/chatWithAvatarWizard'
import makeMockContext from '../utils/mockTelegrafContext'

// Mock dependencies
jest.mock('../../src/helpers/language', () => ({ isRussian: jest.fn() }))
// jest.mock('../../src/menu/createHelpCancelKeyboard', () => ({ createHelpCancelKeyboard: jest.fn() }))
jest.mock('../../src/handlers/handleHelpCancel', () => ({
  handleHelpCancel: jest.fn(),
}))
jest.mock('../../src/handlers/handleTextMessage', () => ({
  handleTextMessage: jest.fn(),
}))
jest.mock('../../src/core/supabase', () => ({
  getUserByTelegramId: jest.fn(),
  updateUserLevelPlusOne: jest.fn(),
}))

import { isRussian } from '../../src/helpers/language'
// import { createHelpCancelKeyboard } from '../../src/menu/createHelpCancelKeyboard'
import { handleHelpCancel } from '../../src/handlers/handleHelpCancel'
import { handleTextMessage } from '../../src/handlers/handleTextMessage'
import {
  getUserByTelegramId,
  updateUserLevelPlusOne,
} from '../../src/core/supabase'

describe('chatWithAvatarWizard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('step0: sends prompt and calls next()', async () => {
    const ctx = makeMockContext()
    ;(isRussian as jest.Mock).mockReturnValue(true)
    // Mock keyboard
    // (createHelpCancelKeyboard as jest.Mock).mockReturnValue({ reply_markup: { foo: 'bar' } })

    // Invoke step 0
    // @ts-ignore
    const step0 = chatWithAvatarWizard.steps[0]
    await step0(ctx)

    expect(isRussian).toHaveBeenCalledWith(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Напиши мне сообщение 💭 и я отвечу на него',
      { reply_markup: { foo: 'bar' } }
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step1: no message leaves scene', async () => {
    const ctx = makeMockContext()
    ctx.message = undefined
    // @ts-ignore
    const step1 = chatWithAvatarWizard.steps[1]
    await step1(ctx)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step1: handleHelpCancel true leaves scene', async () => {
    const ctx = makeMockContext({}, { message: { text: 'hi' } })
    ;(handleHelpCancel as jest.Mock).mockResolvedValue(true)
    // @ts-ignore
    const step1 = chatWithAvatarWizard.steps[1]
    await step1(ctx)
    expect(handleHelpCancel).toHaveBeenCalledWith(ctx)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step1: processes text and does not update level when level != 4', async () => {
    const ctx = makeMockContext({}, { message: { text: 'hello' } })
    ;(handleHelpCancel as jest.Mock).mockResolvedValue(false)
    ;(getUserByTelegramId as jest.Mock).mockResolvedValue({
      data: { level: 3 },
    })

    // @ts-ignore
    const step1 = chatWithAvatarWizard.steps[1]
    await step1(ctx)

    expect(handleTextMessage).toHaveBeenCalledWith(ctx)
    expect(updateUserLevelPlusOne).not.toHaveBeenCalled()
  })

  it('step1: processes text and updates level when level === 4', async () => {
    const ctx = makeMockContext({}, { message: { text: 'hello' } })
    ;(handleHelpCancel as jest.Mock).mockResolvedValue(false)
    ;(getUserByTelegramId as jest.Mock).mockResolvedValue({
      data: { level: 4 },
    })

    // @ts-ignore
    const step1 = chatWithAvatarWizard.steps[1]
    await step1(ctx)

    expect(handleTextMessage).toHaveBeenCalledWith(ctx)
    expect(updateUserLevelPlusOne).toHaveBeenCalledWith(
      ctx.from.id.toString(),
      4
    )
  })

  it('step1: throws if user does not exist', async () => {
    const ctx = makeMockContext({}, { message: { text: 'hello' } })
    ;(handleHelpCancel as jest.Mock).mockResolvedValue(false)
    ;(getUserByTelegramId as jest.Mock).mockResolvedValue({ data: null })

    // @ts-ignore
    const step1 = chatWithAvatarWizard.steps[1]
    await expect(step1(ctx)).rejects.toThrow(
      `User with ID ${ctx.from.id} does not exist.`
    )
  })
})
