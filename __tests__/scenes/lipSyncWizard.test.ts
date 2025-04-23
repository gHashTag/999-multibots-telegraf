import { Composer, Scenes } from 'telegraf'
import lipSyncWizard from '@/scenes/lipSyncWizard'
import * as lipSyncModule from '@/services/generateLipSync'
import { MyContext, MySession } from '@/interfaces'
import makeMockContext from '../utils/mockTelegrafContext'

// Мокаем generateLipSync
jest.mock('@/services/generateLipSync', () => ({
  generateLipSync: jest.fn(),
}))

// Типизируем моки
const mockedGenerateLipSync =
  lipSyncModule.generateLipSync as jest.MockedFunction<
    typeof lipSyncModule.generateLipSync
  >

describe('lipSyncWizard', () => {
  // Создаем миддлвары для каждого шага через Composer.unwrap
  const wizardScene = lipSyncWizard as Scenes.WizardScene<MyContext>
  const step0Middleware = Composer.unwrap(wizardScene.steps[0])
  const step1Middleware = Composer.unwrap(wizardScene.steps[1])
  const step2Middleware = Composer.unwrap(wizardScene.steps[2])

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

    // Инициализируем wizard и session если нужно
    if (!ctx.session) {
      ctx.session = {} as MySession
    }
    if (!ctx.wizard) {
      ctx.wizard = {
        cursor: 0,
        state: {},
        next: jest.fn(),
        back: jest.fn(),
        selectStep: jest.fn(),
      } as any
    }
  })

  it('step0 prompts for video and advances', async () => {
    await step0Middleware(ctx, next)

    expect(ctx.reply).toHaveBeenCalledWith('Отправьте видео или URL видео', {
      reply_markup: { remove_keyboard: true },
    })
    expect(ctx.wizard.next).toHaveBeenCalled()
    expect(next).toHaveBeenCalled()
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

    // Инициализируем session и wizard
    if (!ctx.session) {
      ctx.session = {} as MySession
    }
    if (!ctx.wizard) {
      ctx.wizard = {
        cursor: 1,
        state: {},
        next: jest.fn(),
        back: jest.fn(),
        selectStep: jest.fn(),
      } as any
    }

    // Мокируем telegram.getFile для возврата большого файла
    ;(ctx.telegram.getFile as jest.Mock).mockResolvedValue({
      file_size: MAX_SIZE + 1,
      file_path: 'p',
    })

    await step1Middleware(ctx, next)

    expect(ctx.reply).toHaveBeenCalledWith(
      'Ошибка: видео слишком большое. Максимальный размер: 50MB'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step1 handles URL message and advances', async () => {
    ctx = makeMockContext({
      update_id: 3,
      message: {
        text: 'https://example.com/video.mp4',
        from: { id: 1, language_code: 'ru', is_bot: false, first_name: 'Test' },
        chat: { id: 1, type: 'private', first_name: 'Test' },
        date: Date.now(),
        message_id: 3,
      },
    })

    // Инициализируем wizard и session
    if (!ctx.session) {
      ctx.session = {} as MySession
    }
    if (!ctx.wizard) {
      ctx.wizard = {
        cursor: 1,
        state: {},
        next: jest.fn(),
        back: jest.fn(),
        selectStep: jest.fn(),
      } as any
    }

    await step1Middleware(ctx, next)

    expect(ctx.session.videoUrl).toBe('https://example.com/video.mp4')
    expect(ctx.reply).toHaveBeenCalledWith(
      'Отправьте аудио, голосовое сообщение или URL аудио'
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
    expect(next).toHaveBeenCalled()
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

    // Инициализируем wizard и session
    if (!ctx.session) {
      ctx.session = { videoUrl: 'v' } as MySession
    }
    if (!ctx.wizard) {
      ctx.wizard = {
        cursor: 2,
        state: {},
        next: jest.fn(),
        back: jest.fn(),
        selectStep: jest.fn(),
      } as any
    }

    // Мокируем ответы
    ;(ctx.telegram.getFile as jest.Mock).mockResolvedValueOnce({
      file_size: 100,
      file_path: 'ap',
    })

    mockedGenerateLipSync.mockResolvedValue(undefined)

    await step2Middleware(ctx, next)

    expect(mockedGenerateLipSync).toHaveBeenCalledWith(
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

    // Инициализируем wizard и session
    if (!ctx.session) {
      ctx.session = { videoUrl: 'v' } as MySession
    }
    if (!ctx.wizard) {
      ctx.wizard = {
        cursor: 2,
        state: {},
        next: jest.fn(),
        back: jest.fn(),
        selectStep: jest.fn(),
      } as any
    }

    // Мокируем ответы
    ;(ctx.telegram.getFile as jest.Mock).mockResolvedValueOnce({
      file_size: 100,
      file_path: 'ap2',
    })

    mockedGenerateLipSync.mockRejectedValue(new Error('err'))

    await step2Middleware(ctx, next)

    expect(ctx.reply).toHaveBeenCalledWith(
      'Произошла ошибка при обработке видео'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})
