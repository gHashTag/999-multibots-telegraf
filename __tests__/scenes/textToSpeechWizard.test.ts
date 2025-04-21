import { Composer } from 'telegraf'
import textToSpeechWizard from '@/scenes/textToSpeechWizard'
import { isRussian } from '@/helpers/language'
import { getVoiceId } from '@/core/supabase'
import { generateTextToSpeech } from '@/services/generateTextToSpeech'
import { createHelpCancelKeyboard } from '@/menu'
import { handleHelpCancel } from '@/handlers'

jest.mock('@/helpers/language', () => ({ isRussian: jest.fn() }))
jest.mock('@/core/supabase', () => ({ getVoiceId: jest.fn() }))
jest.mock('@/services/generateTextToSpeech', () => ({
  generateTextToSpeech: jest.fn(),
}))
jest.mock('@/menu', () => ({ createHelpCancelKeyboard: jest.fn() }))
jest.mock('@/handlers', () => ({ handleHelpCancel: jest.fn() }))

describe('textToSpeechWizard', () => {
  const [step0, step1] = textToSpeechWizard.steps as [any, any]
  let ctx: any
  const next = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    ctx = {
      reply: jest.fn(),
      wizard: { next: jest.fn() },
      from: { id: 1, language_code: 'ru', username: 'u' },
      message: { text: 'hello' },
      chat: { id: 1 },
      botInfo: { username: 'bot' },
      session: {},
    }
  })

  it('step0 should prompt and advance', async () => {
    ;(isRussian as jest.Mock)
      .mockReturnValue(true)(createHelpCancelKeyboard as jest.Mock)
      .mockReturnValue({ reply_markup: {} })
    await step0(ctx, next)
    expect(ctx.reply).toHaveBeenCalledWith(
      '🎙️ Отправьте текст, для преобразования его в голос',
      { reply_markup: {} }
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step1 should ask to send text when no message', async () => {
    ctx.message = {}(
      // missing text
      isRussian as jest.Mock
    ).mockReturnValue(true)
    await step1(ctx, next)
    expect(ctx.reply).toHaveBeenCalledWith('✍️ Пожалуйста, отправьте текст')
    expect(ctx.wizard.next).not.toHaveBeenCalled()
  })

  it('step1 should leave when canceled', async () => {
    ;(handleHelpCancel as jest.Mock).mockResolvedValue(true)
    await step1(ctx, next)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step1 should handle missing voice_id and leave', async () => {
    ;(isRussian as jest.Mock)
      .mockReturnValue(true)(getVoiceId as jest.Mock)
      .mockResolvedValue(null)
    await step1(ctx, next)
    expect(ctx.reply).toHaveBeenCalledWith(
      '🎯 Для корректной работы обучите аватар используя 🎤 Голос для аватара в главном меню'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step1 should generate speech with valid voice_id and leave', async () => {
    ;(isRussian as jest.Mock)
      .mockReturnValue(false)(getVoiceId as jest.Mock)
      .mockResolvedValue('vid1')
    await step1(ctx, next)
    expect(generateTextToSpeech).toHaveBeenCalledWith(
      'hello',
      'vid1',
      1,
      'u',
      false,
      'bot'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})
