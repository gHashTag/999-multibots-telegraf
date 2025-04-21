/**
 * Tests for improvePromptWizard
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { Composer } from 'telegraf'
import { improvePromptWizard } from '../../src/scenes/improvePromptWizard'
import makeMockContext from '../utils/mockTelegrafContext'
import { MyContext, ModeEnum } from '../../src/interfaces'

// Mock dependencies
jest.mock('@/core/openai/upgradePrompt', () => ({ upgradePrompt: jest.fn() }))
jest.mock('@/menu/sendPromptImprovementMessage', () => ({
  sendPromptImprovementMessage: jest.fn(),
}))
jest.mock('@/menu/sendPromptImprovementFailureMessage', () => ({
  sendPromptImprovementFailureMessage: jest.fn(),
}))
jest.mock('@/menu/sendGenericErrorMessage', () => ({
  sendGenericErrorMessage: jest.fn(),
}))
jest.mock('@/services/generateNeuroImage', () => ({
  generateNeuroImage: jest.fn(),
}))
jest.mock('@/services/generateTextToVideo', () => ({
  generateTextToVideo: jest.fn(),
}))
jest.mock('@/services/generateTextToImage', () => ({
  generateTextToImage: jest.fn(),
}))
jest.mock('@/services/generateImageFromPrompt', () => ({
  generateImageFromPrompt: jest.fn(),
}))

import { upgradePrompt } from '@/core/openai/upgradePrompt'
import { sendPromptImprovementMessage } from '@/menu/sendPromptImprovementMessage'
import { sendPromptImprovementFailureMessage } from '@/menu/sendPromptImprovementFailureMessage'
import { sendGenericErrorMessage } from '@/menu/sendGenericErrorMessage'
import { generateNeuroImage } from '@/services/generateNeuroImage'
import { generateTextToVideo } from '@/services/generateTextToVideo'
import { generateTextToImage } from '@/services/generateTextToImage'
import { generateImageFromPrompt } from '@/services/generateImageFromPrompt'

describe('improvePromptWizard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('step 0: missing ctx.from leaves scene', async () => {
    const ctx = makeMockContext({ update_id: 1 })
    const step0 = Composer.unwrap(improvePromptWizard.steps[0])
    await step0(ctx, async () => {})
    expect(ctx.reply).toHaveBeenCalledWith('User identification error')
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 0: upgradePrompt fails -> failure message and leave', async () => {
    const ctx = makeMockContext(
      {
        message: {
          from: {
            id: 1,
            is_bot: false,
            first_name: 'Test',
            language_code: 'ru',
          },
          text: 'any',
        },
      },
      { prompt: 'orig' }
    )
    ;(
      sendPromptImprovementMessage as jest.Mock<() => Promise<void>>
    ).mockResolvedValue(undefined)
    ;(
      upgradePrompt as jest.Mock<() => Promise<string | null>>
    ).mockResolvedValueOnce(null)
    const step0 = Composer.unwrap(improvePromptWizard.steps[0])
    await step0(ctx, async () => {})
    expect(sendPromptImprovementMessage).toHaveBeenCalledWith(ctx, true)
    expect(sendPromptImprovementFailureMessage).toHaveBeenCalledWith(ctx, true)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 0: upgradePrompt succeeds -> reply improved and next', async () => {
    const ctx = makeMockContext(
      {
        message: {
          from: {
            id: 1,
            is_bot: false,
            first_name: 'Test',
            language_code: 'en',
          },
          text: 'any',
        },
      },
      { prompt: 'hello' }
    )
    ;(
      sendPromptImprovementMessage as jest.Mock<() => Promise<void>>
    ).mockResolvedValue(undefined)
    ;(
      upgradePrompt as jest.Mock<() => Promise<string | null>>
    ).mockResolvedValueOnce('improved')
    const step0 = Composer.unwrap(improvePromptWizard.steps[0])
    await step0(ctx, async () => {})
    expect(sendPromptImprovementMessage).toHaveBeenCalledWith(ctx, false)
    expect(ctx.session.prompt).toBe('improved')
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Improved prompt:'),
      expect.objectContaining({ parse_mode: 'MarkdownV2' })
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step 1: no message leaves scene', async () => {
    const ctx = makeMockContext({
      callback_query: {
        id: '1',
        from: { id: 1, is_bot: false, first_name: 'Test' },
        message: undefined,
        data: 'any',
      },
    })
    const step1 = Composer.unwrap(improvePromptWizard.steps[1])
    await step1(ctx, async () => {})
    expect(ctx.scene.leave).not.toHaveBeenCalled()
  })

  it('step 1: cancel case', async () => {
    const ctx = makeMockContext(
      {
        message: {
          from: {
            id: 1,
            is_bot: false,
            first_name: 'Test',
            language_code: 'en',
          },
          text: '❌ Cancel',
        },
      },
      {
        prompt: 'p',
        mode: ModeEnum.NeuroPhotoV2,
        userModel: {
          model_url: 'a/b:c',
          model_name: 'test_model',
          trigger_word: 'test_trigger',
        },
      }
    )
    const step1 = Composer.unwrap(improvePromptWizard.steps[1])
    await step1(ctx, async () => {})
    expect(ctx.reply).toHaveBeenCalledWith('Operation cancelled')
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 1: yes generate for neuro_photo', async () => {
    const ctx = makeMockContext(
      {
        message: {
          from: {
            id: 1,
            username: 'u',
            is_bot: false,
            first_name: 'Test',
            language_code: 'ru',
          },
          text: '✅ Да. Cгенерировать?',
        },
      },
      {
        prompt: 'pr',
        mode: ModeEnum.NeuroPhotoV2,
        userModel: {
          model_url: 'a/b:c',
          model_name: 'test_model',
          trigger_word: 'test_trigger',
        },
      }
    )
    ;(
      generateNeuroImage as jest.Mock<() => Promise<any>>
    ).mockResolvedValueOnce(undefined)
    const step1 = Composer.unwrap(improvePromptWizard.steps[1])
    await step1(ctx, async () => {})
    expect(generateNeuroImage).toHaveBeenCalledWith(
      'pr',
      'a/b:c',
      1,
      '1',
      ctx,
      undefined
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('should navigate to menuScene if no mode in session', async () => {
    const ctx = makeMockContext(
      {
        message: {
          from: { id: 1, is_bot: false, first_name: 'Test' },
          text: 'any',
        },
      },
      {
        prompt: 'p',
        userModel: {
          model_url: 'a/b:c',
          model_name: 'test_model',
          trigger_word: 'test_trigger',
        },
      }
    )
    const step1 = Composer.unwrap(improvePromptWizard.steps[1])
    await step1(ctx, async () => {})
    expect(ctx.reply).toHaveBeenCalledWith('An error occurred.')
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('should navigate to menuScene if userModel not in session', async () => {
    const ctx = makeMockContext(
      {
        message: {
          from: { id: 1, is_bot: false, first_name: 'Test' },
          text: 'any',
        },
      },
      {
        prompt: 'p',
        mode: ModeEnum.NeuroPhotoV2,
      }
    )
    const step1 = Composer.unwrap(improvePromptWizard.steps[1])
    await step1(ctx, async () => {})
    expect(ctx.reply).toHaveBeenCalledWith('An error occurred.')
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('should call generateImageFromPrompt for neuro_photo mode (RU)', async () => {
    const ctx = makeMockContext(
      {
        message: {
          from: {
            id: 1,
            username: 'u',
            is_bot: false,
            first_name: 'Test',
            language_code: 'ru',
          },
          text: 'any',
        },
      },
      {
        prompt: 'pr',
        mode: ModeEnum.NeuroPhotoV2,
        userModel: {
          model_url: 'a/b:c',
          model_name: 'test_model',
          trigger_word: 'test_trigger',
        },
      }
    )
    ;(
      generateImageFromPrompt as jest.Mock<() => Promise<string | void>>
    ).mockResolvedValue('done')

    const step1 = Composer.unwrap(improvePromptWizard.steps[1])
    await step1(ctx, async () => {})
    expect(generateImageFromPrompt).toHaveBeenCalledWith(
      ctx,
      'a/b:c',
      'pr',
      true
    )
    expect(ctx.reply).not.toHaveBeenCalled()
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})
