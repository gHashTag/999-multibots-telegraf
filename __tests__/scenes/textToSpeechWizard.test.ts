/**
 * Tests for textToSpeechWizard
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { textToSpeechWizard } from '../../src/scenes/textToSpeechWizard'
import makeMockContext from '../utils/mockTelegrafContext'

// Mock dependencies
jest.mock('../../src/core/supabase', () => ({
  getVoiceId: jest.fn(),
  getUserBalance: jest.fn(),
}))
jest.mock('../../src/services/generateTextToSpeech', () => ({ generateTextToSpeech: jest.fn() }))
jest.mock('@/price/helpers', () => ({
  sendBalanceMessage: jest.fn(),
  sendInsufficientStarsMessage: jest.fn(),
  voiceConversationCost: 5,
}))
jest.mock('@/helpers', () => ({ isRussian: jest.fn().mockReturnValue(false) }))
jest.mock('@/menu', () => ({ createHelpCancelKeyboard: jest.fn().mockReturnValue({}), }))
jest.mock('@/handlers', () => ({ handleHelpCancel: jest.fn().mockResolvedValue(false) }))

import { getVoiceId, getUserBalance } from '../../src/core/supabase'
import { generateTextToSpeech } from '../../src/services/generateTextToSpeech'
import { sendBalanceMessage, sendInsufficientStarsMessage, voiceConversationCost } from '@/price/helpers'
import { isRussian } from '@/helpers'
import { createHelpCancelKeyboard } from '@/menu'
import { handleHelpCancel } from '@/handlers'

describe('textToSpeechWizard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('step 0: prompts for text and moves next', async () => {
    const ctx = makeMockContext()
    // @ts-ignore
    const step0 = textToSpeechWizard.steps[0]
    await step0(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      '🎙️ Send text, to convert it to voice',
      expect.any(Object)
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step 1: no message.text replies error', async () => {
    const ctx = makeMockContext()
    // simulate no message or missing text
    // @ts-ignore
    const step1 = textToSpeechWizard.steps[1]
    await step1(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      '✍️ Please send text'
    )
    // should not leave or generate
    expect(handleHelpCancel).not.toHaveBeenCalled()
    expect(generateTextToSpeech).not.toHaveBeenCalled()
  })

  it('step 1: with text but no voice_id asks to train avatar and leaves', async () => {
    const ctx = makeMockContext({ message: { text: 'Hello' } })
    (getVoiceId as jest.Mock).mockResolvedValueOnce(null)
    // @ts-ignore
    const step1 = textToSpeechWizard.steps[1]
    await step1(ctx)
    expect(getVoiceId).toHaveBeenCalledWith(ctx.from.id.toString())
    expect(ctx.reply).toHaveBeenCalledWith(
      '🎯 For correct operation, train the avatar using 🎤 Voice for avatar in the main menu'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 1: with text and voice_id generates speech and leaves', async () => {
    const ctx = makeMockContext({ message: { text: 'Hello world' } })
    (getVoiceId as jest.Mock).mockResolvedValueOnce('voice123')
    // @ts-ignore
    const step1 = textToSpeechWizard.steps[1]
    await step1(ctx)
    expect(getVoiceId).toHaveBeenCalledWith(ctx.from.id.toString())
    expect(generateTextToSpeech).toHaveBeenCalledWith(
      'Hello world',
      'voice123',
      ctx.from.id,
      ctx.from.username || '',
      false,
      ctx.botInfo?.username
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})