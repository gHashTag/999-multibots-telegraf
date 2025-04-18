/**
 * Tests for improvePromptWizard
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { improvePromptWizard } from '../../src/scenes/improvePromptWizard'
import makeMockContext from '../utils/mockTelegrafContext'

// Mock dependencies
jest.mock('@/core/openai/upgradePrompt', () => ({ upgradePrompt: jest.fn() }))
jest.mock('@/menu/sendPromptImprovementMessage', () => ({ sendPromptImprovementMessage: jest.fn() }))
jest.mock('@/menu/sendPromptImprovementFailureMessage', () => ({ sendPromptImprovementFailureMessage: jest.fn() }))
jest.mock('@/menu/sendGenericErrorMessage', () => ({ sendGenericErrorMessage: jest.fn() }))
jest.mock('@/services/generateNeuroImage', () => ({ generateNeuroImage: jest.fn() }))
jest.mock('@/services/generateTextToVideo', () => ({ generateTextToVideo: jest.fn() }))
jest.mock('@/services/generateTextToImage', () => ({ generateTextToImage: jest.fn() }))

import { upgradePrompt } from '@/core/openai/upgradePrompt'
import { sendPromptImprovementMessage } from '@/menu/sendPromptImprovementMessage'
import { sendPromptImprovementFailureMessage } from '@/menu/sendPromptImprovementFailureMessage'
import { sendGenericErrorMessage } from '@/menu/sendGenericErrorMessage'
import { generateNeuroImage } from '@/services/generateNeuroImage'
import { generateTextToVideo } from '@/services/generateTextToVideo'
import { generateTextToImage } from '@/services/generateTextToImage'

describe('improvePromptWizard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('step 0: missing ctx.from leaves scene', async () => {
    const ctx = makeMockContext()
    delete ctx.from
    // @ts-ignore
    const step0 = improvePromptWizard.steps[0]
    await step0(ctx)
    expect(ctx.reply).toHaveBeenCalledWith('User identification error')
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 0: upgradePrompt fails -> failure message and leave', async () => {
    const ctx = makeMockContext()
    ctx.from.language_code = 'ru'
    ctx.session = { prompt: 'orig' }
    ;(sendPromptImprovementMessage as jest.Mock).mockResolvedValue(undefined)
    ;(upgradePrompt as jest.Mock).mockResolvedValueOnce(null)
    // @ts-ignore
    const step0 = improvePromptWizard.steps[0]
    await step0(ctx)
    expect(sendPromptImprovementMessage).toHaveBeenCalledWith(ctx, true)
    expect(sendPromptImprovementFailureMessage).toHaveBeenCalledWith(ctx, true)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 0: upgradePrompt succeeds -> reply improved and next', async () => {
    const ctx = makeMockContext()
    ctx.from.language_code = 'en'
    ctx.session = { prompt: 'hello' }
    ;(sendPromptImprovementMessage as jest.Mock).mockResolvedValue(undefined)
    ;(upgradePrompt as jest.Mock).mockResolvedValueOnce('improved')
    // @ts-ignore
    const step0 = improvePromptWizard.steps[0]
    await step0(ctx)
    expect(sendPromptImprovementMessage).toHaveBeenCalledWith(ctx, false)
    expect(ctx.session.prompt).toBe('improved')
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Improved prompt:'),
      expect.objectContaining({ parse_mode: 'MarkdownV2' })
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step 1: no message leaves scene', async () => {
    const ctx = makeMockContext()
    // @ts-ignore
    const step1 = improvePromptWizard.steps[1]
    await step1(ctx)
    // Should not leave scene when no message text provided
    expect(ctx.scene.leave).not.toHaveBeenCalled()
  })

  it('step 1: cancel case', async () => {
    const ctx = makeMockContext({}, { message: { text: '❌ Cancel' } })
    ctx.from.language_code = 'en'
    ctx.session = { prompt: 'p', mode: 'neuro_photo', userModel: { model_url: 'url' } }
    // @ts-ignore
    const step1 = improvePromptWizard.steps[1]
    await step1(ctx)
    expect(ctx.reply).toHaveBeenCalledWith('Operation cancelled')
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 1: yes generate for neuro_photo', async () => {
    // simulate Russian locale for branch
    const ctx = makeMockContext(
      {},
      { message: { text: '✅ Да. Cгенерировать?' } }
    )
    ctx.from = { id: 1, username: 'u', language_code: 'ru' }
    ctx.session = { prompt: 'pr', mode: 'neuro_photo', userModel: { model_url: 'url' } }
    // step 1 generate branch, no handleHelpCancel
    ;(generateNeuroImage as jest.Mock).mockResolvedValueOnce(undefined)
    // @ts-ignore
    const step1 = improvePromptWizard.steps[1]
    await step1(ctx)
    expect(generateNeuroImage).toHaveBeenCalledWith(
      'pr', 'url', 1, '1', ctx, undefined
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})