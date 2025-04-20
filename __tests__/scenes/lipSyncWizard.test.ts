/**
 * Tests for lipSyncWizard
 */
import { lipSyncWizard } from '../../src/scenes/lipSyncWizard'
import makeMockContext from '../utils/mockTelegrafContext'

// Mock dependencies
jest.mock('../../src/services/generateLipSync', () => ({ generateLipSync: jest.fn() }))

import { generateLipSync } from '../../src/services/generateLipSync'

describe('lipSyncWizard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('step 0: prompts for video and moves next', async () => {
    const ctx = makeMockContext()
    // @ts-ignore
    const step0 = lipSyncWizard.steps[0]
    // default ctx.from.language_code = 'ru'
    await step0(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Отправьте видео или URL видео',
      { reply_markup: { remove_keyboard: true } }
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step 1: video too large replies error and leaves', async () => {
    const ctx = makeMockContext({}, { message: { video: { file_id: 'file123' } } })
    // mock getFile returning large size
    ctx.telegram.getFile = jest.fn().mockResolvedValue({ file_size: 100 * 1024 * 1024, file_path: 'video.mp4' })
    // @ts-ignore
    const step1 = lipSyncWizard.steps[1]
    await step1(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Ошибка: видео слишком большое. Максимальный размер: 50MB'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 1: with text sets session and prompts audio', async () => {
    const url = 'http://video.url'
    const ctx = makeMockContext({}, { message: { text: url } })
    // @ts-ignore
    const step1 = lipSyncWizard.steps[1]
    await step1(ctx)
    expect(ctx.session.videoUrl).toBe(url)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Отправьте аудио, голосовое сообщение или URL аудио'
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step 2: no audio replies error and leaves', async () => {
    const ctx = makeMockContext()
    // @ts-ignore
    const step2 = lipSyncWizard.steps[2]
    await step2(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Ошибка: аудио не предоставлено'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 2: with text generates lip sync and leaves', async () => {
    const video = 'vurl'
    const audio = 'aurl'
    const ctx = makeMockContext({}, { message: { text: audio } })
    // pre-set session.videoUrl
    ctx.session.videoUrl = video
    // set from.id
    ctx.from.id = 777
    // @ts-ignore
    const step2 = lipSyncWizard.steps[2]
    await step2(ctx)
    expect(generateLipSync).toHaveBeenCalledWith(
      video,
      audio,
      '777',
      ctx.botInfo?.username
    )
    expect(ctx.reply).toHaveBeenCalledWith(
      '🎥 Видео отправлено на обработку. Ждите результата'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})