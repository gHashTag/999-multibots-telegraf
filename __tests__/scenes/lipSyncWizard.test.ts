import { Composer, Scenes } from 'telegraf'
import lipSyncWizard from '@/scenes/lipSyncWizard'
import { generateLipSync } from '@/services/generateLipSync'
import { MyContext, MySession } from '@/interfaces'
import makeMockContext from '../utils/mockTelegrafContext'

// Mocks
jest.mock('@/services/generateLipSync', () => ({ generateLipSync: jest.fn() }))

describe('lipSyncWizard', () => {
  const wizardMiddleware = lipSyncWizard.middleware()
  let ctx: MyContext
  let next: jest.Mock
  const MAX_SIZE = 50 * 1024 * 1024

  beforeEach(() => {
    jest.clearAllMocks()
    next = jest.fn()
    ctx = makeMockContext({
      update_id: 1,
      message: {
        from: { id: 1, language_code: 'ru', is_bot: false, first_name: 'Test' },
        chat: { id: 1, type: 'private', first_name: 'Test' },
        date: Date.now(),
        message_id: 1,
      },
    })
    ctx.telegram.getFile = jest.fn()
  })

  it('step0 prompts for video and advances', async () => {
    ctx.wizard.cursor = 0
    await wizardMiddleware(ctx, next)
    expect(ctx.reply).toHaveBeenCalledWith('Отправьте видео или URL видео', {
      reply_markup: { remove_keyboard: true },
    })
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step1 handles too large video and leaves', async () => {
    ctx = makeMockContext({
      update_id: 2,
      message: {
        video: {
          file_id: 'vid',
          file_unique_id: 'uid_vid',
          duration: 10,
          width: 10,
          height: 10,
          mime_type: 'video/mp4',
        },
        from: { id: 1, language_code: 'ru', is_bot: false, first_name: 'Test' },
        chat: { id: 1, type: 'private', first_name: 'Test' },
        date: Date.now(),
        message_id: 2,
      },
    })
    ;(ctx.telegram.getFile as jest.Mock).mockResolvedValue({
      file_size: MAX_SIZE + 1,
      file_path: 'p',
    })
    ctx.wizard.cursor = 1
    await wizardMiddleware(ctx, next)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Ошибка: видео слишком большое. Максимальный размер: 50MB'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step1 handles video url via message.text and advances', async () => {
    ctx = makeMockContext({
      update_id: 3,
      message: {
        text: 'http://video',
        from: { id: 1, language_code: 'ru', is_bot: false, first_name: 'Test' },
        chat: { id: 1, type: 'private', first_name: 'Test' },
        date: Date.now(),
        message_id: 3,
      },
    })
    ctx.wizard.cursor = 1
    await wizardMiddleware(ctx, next)
    expect(ctx.session.videoUrl).toBe('http://video')
    expect(ctx.reply).toHaveBeenCalledWith(
      'Отправьте аудио, голосовое сообщение или URL аудио'
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step2 handles too large audio and leaves', async () => {
    ctx = makeMockContext(
      {
        update_id: 4,
        message: {
          audio: {
            file_id: 'aid',
            file_unique_id: 'uid_aud',
            duration: 5,
            mime_type: 'audio/mpeg',
          },
          from: {
            id: 1,
            language_code: 'ru',
            is_bot: false,
            first_name: 'Test',
          },
          chat: { id: 1, type: 'private', first_name: 'Test' },
          date: Date.now(),
          message_id: 4,
        },
      },
      { videoUrl: 'v' }
    )
    ;(ctx.telegram.getFile as jest.Mock).mockResolvedValue({
      file_size: MAX_SIZE + 1,
      file_path: 'ap',
    })
    ctx.wizard.cursor = 2
    await wizardMiddleware(ctx, next)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Ошибка: аудио слишком большое. Максимальный размер: 50MB'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step2 processes valid audio and calls generateLipSync then leaves', async () => {
    ctx = makeMockContext(
      {
        update_id: 5,
        message: {
          voice: {
            file_id: 'file1',
            file_unique_id: 'uid_voi1',
            duration: 3,
            mime_type: 'audio/ogg',
          },
          from: {
            id: 1,
            language_code: 'ru',
            is_bot: false,
            first_name: 'Test',
          },
          chat: { id: 1, type: 'private', first_name: 'Test' },
          date: Date.now(),
          message_id: 5,
        },
      },
      { videoUrl: 'v' }
    )
    ;(ctx.telegram.getFile as jest.Mock)
      .mockResolvedValueOnce({ file_size: 100, file_path: 'vp' })
      .mockResolvedValueOnce({ file_size: 50, file_path: 'ap' })
    ;(generateLipSync as jest.Mock).mockResolvedValue(undefined)
    ctx.wizard.cursor = 2
    await wizardMiddleware(ctx, next)
    expect(generateLipSync).toHaveBeenCalledWith(
      'v',
      'https://api.telegram.org/file/botundefined/ap',
      '1',
      undefined
    )
    expect(ctx.reply).toHaveBeenCalledWith(
      '🎥 Видео отправлено на обработку. Ждите результата'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step2 catches error in generateLipSync and replies', async () => {
    ctx = makeMockContext(
      {
        update_id: 6,
        message: {
          voice: {
            file_id: 'file2',
            file_unique_id: 'uid_voi2',
            duration: 4,
            mime_type: 'audio/ogg',
          },
          from: {
            id: 1,
            language_code: 'ru',
            is_bot: false,
            first_name: 'Test',
          },
          chat: { id: 1, type: 'private', first_name: 'Test' },
          date: Date.now(),
          message_id: 6,
        },
      },
      { videoUrl: 'v' }
    )
    ;(ctx.telegram.getFile as jest.Mock)
      .mockResolvedValueOnce({ file_size: 100, file_path: 'vp2' })
      .mockResolvedValueOnce({ file_size: 100, file_path: 'ap2' })
    ;(generateLipSync as jest.Mock).mockRejectedValue(new Error('err'))
    ctx.wizard.cursor = 2
    await wizardMiddleware(ctx, next)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Произошла ошибка при обработке видео'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})
