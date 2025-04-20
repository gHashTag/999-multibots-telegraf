/**
 * Тесты для сцены uploadVideoScene
 */
import { uploadVideoScene } from '../../src/scenes/uploadVideoScene'
import makeMockContext from '../utils/mockTelegrafContext'

// Мокаем внешние зависимости
jest.mock('../../src/services/uploadVideoToServer', () => ({
  // @ts-ignore
  uploadVideoToServer: jest.fn(),
}))

describe('uploadVideoScene', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('первый шаг: просит отправить видео и вызывает next()', async () => {
    const ctx = makeMockContext()
    // @ts-ignore
    const step0 = uploadVideoScene.steps[0]
    await step0(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      '📹 Пожалуйста, отправьте видеофайл',
      expect.any(Object)
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('второй шаг: валидное видео устанавливает videoUrl и вызывает next()', async () => {
    const ctx = makeMockContext()
    ctx.from = { id: 1, language_code: 'ru' }
    const fakeFile = { file_path: 'video.mp4' }
    ctx.telegram.getFile = jest.fn(() => Promise.resolve(fakeFile))
    ctx.message = { video: { file_id: 'vid1', file_size: 100 } }
    // @ts-ignore
    const step1 = uploadVideoScene.steps[1]
    await step1(ctx)
    expect(ctx.session.videoUrl).toBe(
      `https://api.telegram.org/file/bot${ctx.telegram.token}/${fakeFile.file_path}`
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('второй шаг: слишком большое видео вызывает leave()', async () => {
    const ctx = makeMockContext()
    ctx.from = { id: 1, language_code: 'ru' }
    ctx.message = { video: { file_id: 'vid1', file_size: 60 * 1024 * 1024 } }
    // @ts-ignore
    const step1 = uploadVideoScene.steps[1]
    await step1(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      '⚠️ Ошибка: видео слишком большое. Максимальный размер: 50MB'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('второй шаг: отсутствие видео вызывает leave()', async () => {
    const ctx = makeMockContext()
    ctx.from = { id: 1, language_code: 'ru' }
    ctx.message = { text: 'hello' }
    // @ts-ignore
    const step1 = uploadVideoScene.steps[1]
    await step1(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      '❌ Ошибка: видео не предоставлено'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('третий шаг: успешная загрузка и leave()', async () => {
    const ctx = makeMockContext()
    ctx.from = { id: 2, language_code: 'ru' }
    ctx.session = { videoUrl: 'url.mp4' }
    // @ts-ignore
    const uploadMock = jest.requireMock('../../src/services/uploadVideoToServer')
      .uploadVideoToServer
    uploadMock.mockResolvedValueOnce(undefined)
    // @ts-ignore
    const step2 = uploadVideoScene.steps[2]
    await step2(ctx)
    expect(uploadMock).toHaveBeenCalledWith({
      videoUrl: 'url.mp4',
      telegram_id: '2',
      fileName: expect.stringContaining('video_to_url_'),
    })
    expect(ctx.reply).toHaveBeenCalledWith(
      '✅ Видео успешно загружено на сервер'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('третий шаг: ошибка загрузки отправляет сообщение об ошибке и leave()', async () => {
    const ctx = makeMockContext()
    ctx.from = { id: 3, language_code: 'ru' }
    ctx.session = { videoUrl: 'url.mp4' }
    // @ts-ignore
    const uploadMock = jest.requireMock('../../src/services/uploadVideoToServer')
      .uploadVideoToServer
    uploadMock.mockRejectedValueOnce(new Error('fail'))
    // @ts-ignore
    const step2 = uploadVideoScene.steps[2]
    await step2(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      '❌ Ошибка при загрузке видео'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})