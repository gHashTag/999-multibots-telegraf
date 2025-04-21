import { Composer } from 'telegraf'
import lipSyncWizard from '@/scenes/lipSyncWizard'
import { generateLipSync } from '@/services/generateLipSync'

// Mocks
jest.mock('@/services/generateLipSync', () => ({ generateLipSync: jest.fn() }))

describe('lipSyncWizard', () => {
  const steps = (lipSyncWizard as any).steps as Function[]
  const [step0, step1, step2] = steps
  let ctx: any
  let next: jest.Mock
  const MAX_SIZE = 50 * 1024 * 1024

  beforeEach(() => {
    jest.clearAllMocks()
    next = jest.fn()
    ctx = {
      reply: jest.fn(),
      wizard: { next: jest.fn() },
      scene: { leave: jest.fn() },
      from: { id: 1, language_code: 'ru' },
      message: {},
      telegram: { getFile: jest.fn(), token: 'tok' },
      botInfo: { username: 'bot' },
      session: {},
    }
  })

  it('step0 prompts for video and advances', async () => {
    await step0(ctx, next)
    expect(ctx.reply).toHaveBeenCalledWith('Отправьте видео или URL видео', {
      reply_markup: { remove_keyboard: true },
    })
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step1 handles too large video and leaves', async () => {
    ctx.message = { video: { file_id: 'vid' } }(
      ctx.telegram.getFile as jest.Mock
    ).mockResolvedValue({ file_size: MAX_SIZE + 1, file_path: 'p' })
    await step1(ctx, next)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Ошибка: видео слишком большое. Максимальный размер: 50MB'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step1 handles video url via message.text and advances', async () => {
    ctx.message = { text: 'http://video' }
    await step1(ctx, next)
    expect(ctx.session.videoUrl).toBe('http://video')
    expect(ctx.reply).toHaveBeenCalledWith(
      'Отправьте аудио, голосовое сообщение или URL аудио'
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step2 handles too large audio and leaves', async () => {
    ctx.session.videoUrl = 'v'
    ctx.message = { audio: { file_id: 'aid' } }(
      ctx.telegram.getFile as jest.Mock
    ).mockResolvedValue({ file_size: MAX_SIZE + 1, file_path: 'ap' })
    await step2(ctx, next)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Ошибка: аудио слишком большое. Максимальный размер: 50MB'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step2 processes valid audio and calls generateLipSync then leaves', async () => {
    ctx.session.videoUrl = 'v'
    ctx.message = { voice: { file_id: 'file1' } }(
      ctx.telegram.getFile as jest.Mock
    )
      .mockResolvedValueOnce({ file_size: 100, file_path: 'vp' })
      .mockResolvedValueOnce({ file_size: 50, file_path: 'ap' })
    ;(generateLipSync as jest.Mock).mockResolvedValue(undefined)
    await step2(ctx, next)
    expect(generateLipSync).toHaveBeenCalledWith(
      'v',
      'https://api.telegram.org/file/bottok/ap',
      '1',
      'bot'
    )
    expect(ctx.reply).toHaveBeenCalledWith(
      '🎥 Видео отправлено на обработку. Ждите результата'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step2 catches error in generateLipSync and replies', async () => {
    ctx.session.videoUrl = 'v'
    ctx.message = { voice: { file_id: 'file2' } }(
      ctx.telegram.getFile as jest.Mock
    )
      .mockResolvedValueOnce({ file_size: 100, file_path: 'vp2' })
      .mockResolvedValueOnce({ file_size: 100, file_path: 'ap2' })(
        generateLipSync as jest.Mock
      )
      .mockRejectedValue(new Error('err'))
    await step2(ctx, next)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Произошла ошибка при обработке видео'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})
