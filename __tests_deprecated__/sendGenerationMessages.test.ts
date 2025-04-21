import makeMockContext from '../utils/mockTelegrafContext'
// Mock supabase and mainMenu
jest.mock('../../src/core/supabase', () => ({
  getReferalsCountAndUserData: jest.fn().mockResolvedValue({ count: 2, subscription: 'stars', level: 1 }),
}))
jest.mock('../../src/menu/mainMenu', () => ({
  mainMenu: jest.fn().mockResolvedValue({ reply_markup: { keyboard: [['X']] } }),
}))
import { sendGenerationCancelledMessage } from '../../src/menu/sendGenerationCancelledMessage'
import { sendGenerationErrorMessage } from '../../src/menu/sendGenerationErrorMessage'
import { sendGenericErrorMessage } from '../../src/menu/sendGenericErrorMessage'
import { sendPhotoDescriptionRequest } from '../../src/menu/sendPhotoDescriptionRequest'
import { sendPromptImprovementFailureMessage } from '../../src/menu/sendPromptImprovementFailureMessage'
import { sendPromptImprovementMessage } from '../../src/menu/sendPromptImprovementMessage'

describe('sendGenerationCancelledMessage', () => {
  it('replies cancellation and keyboard', async () => {
    const ctx = makeMockContext()
    ctx.from.language_code = 'ru'
    await sendGenerationCancelledMessage(ctx as any, true)
    expect(ctx.reply).toHaveBeenCalledWith(
      '❌ Генерация отменена',
      expect.objectContaining({ reply_markup: { keyboard: [['X']] } })
    )
  })
})

describe('sendGenerationErrorMessage', () => {
  it('replies error and keyboard', async () => {
    const ctx = makeMockContext()
    ctx.from.language_code = 'en'
    await sendGenerationErrorMessage(ctx as any, false)
    expect(ctx.reply).toHaveBeenCalledWith(
      '❌ Generation error',
      expect.objectContaining({ reply_markup: { keyboard: [['X']] } })
    )
  })
})

describe('sendGenericErrorMessage', () => {
  it('replies generic error and keyboard', async () => {
    const ctx = makeMockContext()
    ctx.from.language_code = 'ru'
    await sendGenericErrorMessage(ctx as any, true, new Error('oops'))
    expect(ctx.reply).toHaveBeenCalledWith(
      '❌ Произошла ошибка. Пожалуйста, попробуйте позже.\n\nОшибка: oops',
      expect.objectContaining({ reply_markup: { keyboard: [['X']] } })
    )
  })
})

describe('sendPhotoDescriptionRequest', () => {
  it('replies photo description request with keyboard', async () => {
    const ctx = makeMockContext()
    ctx.from.language_code = 'en'
    await sendPhotoDescriptionRequest(ctx as any)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Provide a description for the photo:',
      expect.objectContaining({ reply_markup: { keyboard: [['X']] } })
    )
  })
})

describe('sendPromptImprovementFailureMessage', () => {
  it('replies failure message', async () => {
    const ctx = makeMockContext()
    ctx.from.language_code = 'ru'
    await sendPromptImprovementFailureMessage(ctx as any)
    expect(ctx.reply).toHaveBeenCalledWith('Не удалось улучшить запрос.', expect.anything())
  })
})

describe('sendPromptImprovementMessage', () => {
  it('replies improvement message', async () => {
    const ctx = makeMockContext()
    ctx.from.language_code = 'en'
    await sendPromptImprovementMessage(ctx as any, 'new prompt')
    expect(ctx.reply).toHaveBeenCalledWith('Improved prompt: new prompt')
  })
})