/**
 * Tests for lipSyncWizard
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { lipSyncWizard } from '../../src/scenes/lipSyncWizard'
import makeMockContext from '../utils/mockTelegrafContext'

// Mock dependencies
jest.mock('@/helpers/language', () => ({ isRussian: jest.fn() }))
jest.mock('@/services/generateLipSync', () => ({ generateLipSync: jest.fn() }))

import { isRussian } from '@/helpers/language'
import { generateLipSync } from '@/services/generateLipSync'

describe('lipSyncWizard', () => {
  let ctx: ReturnType<typeof makeMockContext>
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    ctx.from = { id: 5, language_code: 'ru' }
    ctx.telegram.token = 'T'
  })

  it('step 0: prompts for video and next', async () => {
    ;(isRussian as jest.Mock).mockReturnValueOnce(true)
    // @ts-ignore
    const step0 = lipSyncWizard.steps[0]
    await step0(ctx)
    expect(ctx.reply).toHaveBeenCalledWith('Отправьте видео или URL видео', {
      reply_markup: { remove_keyboard: true },
    })
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step 1: large video file leaves scene with error', async () => {
    ctx.from.language_code = 'en'
    const video = { file_id: 'f1' }
    ctx.message = { video }
    ctx.telegram.getFile = jest
      .fn()
      .mockResolvedValue({ file_size: 999999999, file_path: 'p' })
    // @ts-ignore
    const step1 = lipSyncWizard.steps[1]
    await step1(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Error: video is too large. Maximum size: 50MB'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 1: text URL proceeds to next', async () => {
    ctx.from.language_code = 'ru'
    ctx.message = { text: 'http://video' }
    ;(isRussian as jest.Mock).mockReturnValue(true)
    // @ts-ignore
    const step1 = lipSyncWizard.steps[1]
    await step1(ctx)
    expect(ctx.session.videoUrl).toBe('http://video')
    expect(ctx.reply).toHaveBeenCalledWith(
      'Отправьте аудио, голосовое сообщение или URL аудио'
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step 2: missing audio leaves scene', async () => {
    ctx.from.language_code = 'en'
    ctx.message = {}
    // @ts-ignore
    const step2 = lipSyncWizard.steps[2]
    await step2(ctx)
    expect(ctx.reply).toHaveBeenCalledWith('Error: audio not provided')
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 2: processes voice and generates lip sync', async () => {
    ctx.from.language_code = 'ru'
    ctx.session = { videoUrl: 'v' }
    const voice = { file_id: 'f2' }
    ctx.message = { voice }
    ctx.telegram.getFile = jest
      .fn()
      .mockResolvedValue({ file_size: 100, file_path: 'path' })
    // @ts-ignore
    const step2 = lipSyncWizard.steps[2]
    await step2(ctx)
    expect(ctx.session.audioUrl).toBe('https://api.telegram.org/file/botT/path')
    expect(generateLipSync).toHaveBeenCalledWith(
      'v',
      'https://api.telegram.org/file/botT/path',
      '5',
      undefined
    )
    expect(ctx.reply).toHaveBeenCalledWith(
      '🎥 Видео отправлено на обработку. Ждите результата'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})
