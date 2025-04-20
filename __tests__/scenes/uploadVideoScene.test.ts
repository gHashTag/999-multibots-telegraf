/**
 * Тесты для сцены uploadVideoScene
 */
import { MiddlewareFn, Scenes } from 'telegraf'
import { uploadVideoScene } from '@/scenes/uploadVideoScene'
import { makeMockContext, MockContextWithSession } from '../utils/mockContext'
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { MyContext, MySession } from '@/interfaces'
import { UserFromGetMe, Message } from 'telegraf/types'
import { uploadVideoToServer } from '@/services/uploadVideoToServer'

// Mock dependencies
jest.mock('@/services/uploadVideoToServer')
jest.mock('@/menu', () => ({
  cancelMenu: jest.fn(),
  sendGenericErrorMessage: jest.fn(),
}))
jest.mock('@/handlers/handleHelpCancel', () => ({
  handleHelpCancel: jest.fn<() => Promise<boolean>>(),
}))

import { cancelMenu, sendGenericErrorMessage } from '@/menu'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'

// Типизируем моки
const mockedUploadVideoToServer = uploadVideoToServer as jest.MockedFunction<
  typeof uploadVideoToServer
>
const mockedCancelMenu = cancelMenu as jest.Mock
const mockedSendGenericError = sendGenericErrorMessage as jest.Mock
const mockedHandleHelpCancel = handleHelpCancel as jest.MockedFunction<typeof handleHelpCancel>

// Определяем мок next
const mockNext = jest.fn<() => Promise<void>>().mockResolvedValue()

describe('uploadVideoScene', () => {
  let ctx: MockContextWithSession<Scenes.WizardSessionData & MySession>
  const mockBotInfo: UserFromGetMe = {
    id: 1, is_bot: true, first_name: 'TestBot', username: 'TestBot',
    can_join_groups: true,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
  }

  // Получаем шаги сцены
  const steps = uploadVideoScene.steps as MiddlewareFn<MyContext>[]
  const step0 = steps[0]
  const step1 = steps[1]
  const step2 = steps[2]

  beforeEach(() => {
    jest.clearAllMocks()
    mockNext.mockClear()
    // Создаем базовый контекст здесь
    ctx = makeMockContext(
      { update_id: 1 },
      { scene: { enter: jest.fn(), leave: jest.fn() }, session: {} },
      { botInfo: mockBotInfo }
    )
  })

  it('step0: prompts for video upload', async () => {
    mockedCancelMenu.mockReturnValue({ text: 'Cancel', keyboard: [] })

    // Вызываем шаг с next
    await step0(ctx, mockNext)

    expect(ctx.reply).toHaveBeenCalledWith(
      'Пожалуйста, отправьте видео для генерации голосового аватара.',
      { reply_markup: { keyboard: [] } }
    )
    // Проверяем переход к следующему шагу
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step1: handles cancel', async () => {
    // Создаем контекст с сообщением 'Отмена'
    const cancelMessage: Message.TextMessage = { message_id: 1, date: 1, chat: { id: 1, type: 'private', first_name: 'User' }, from: { id: 1, is_bot: false, first_name: 'User' }, text: 'Отмена' }
    ctx = makeMockContext(
      { update_id: 1, message: cancelMessage },
      { scene: { enter: jest.fn(), leave: jest.fn() }, session: {} },
      { botInfo: mockBotInfo }
    )
    mockedHandleHelpCancel.mockResolvedValue(true)

    // Вызываем шаг с next
    await step1(ctx, mockNext)

    expect(mockedHandleHelpCancel).toHaveBeenCalledWith(ctx)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step1: handles large video file', async () => {
    // Создаем контекст с большим видео
    const largeVideoMessage: Message.VideoMessage = {
      message_id: 1, date: 1, chat: { id: 1, type: 'private', first_name: 'User' }, from: { id: 1, is_bot: false, first_name: 'User' },
      video: { file_id: 'vid1', file_unique_id: 'vid1_unique', duration: 10, width: 10, height: 10, file_size: 60 * 1024 * 1024 }
    }
    ctx = makeMockContext(
      { update_id: 1, message: largeVideoMessage },
      { scene: { enter: jest.fn(), leave: jest.fn() }, session: {} },
      { botInfo: mockBotInfo }
    )
    mockedHandleHelpCancel.mockResolvedValue(false)

    // Вызываем шаг с next
    await step1(ctx, mockNext)

    expect(ctx.reply).toHaveBeenCalledWith('Видео должно быть меньше 50 МБ.')
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step1: handles non-video message', async () => {
    // Создаем контекст с текстовым сообщением
    const textMessage: Message.TextMessage = { message_id: 1, date: 1, chat: { id: 1, type: 'private', first_name: 'User' }, from: { id: 1, is_bot: false, first_name: 'User' }, text: 'hello' }
    ctx = makeMockContext(
      { update_id: 1, message: textMessage },
      { scene: { enter: jest.fn(), leave: jest.fn() }, session: {} },
      { botInfo: mockBotInfo }
    )
    mockedHandleHelpCancel.mockResolvedValue(false)

    // Вызываем шаг с next
    await step1(ctx, mockNext)

    expect(mockedSendGenericError).toHaveBeenCalledWith(ctx, true)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step1: processes valid video and asks for voice', async () => {
    // Создаем контекст с валидным видео
    const validVideoMessage: Message.VideoMessage = {
      message_id: 1, date: 1, chat: { id: 1, type: 'private', first_name: 'User' }, from: { id: 1, is_bot: false, first_name: 'User' },
      video: { file_id: 'vid2', file_unique_id: 'vid2_unique', duration: 10, width: 10, height: 10, file_size: 10 * 1024 * 1024 }
    }
    ctx = makeMockContext(
      { update_id: 1, message: validVideoMessage },
      { scene: { enter: jest.fn(), leave: jest.fn() }, session: {} },
      { botInfo: mockBotInfo }
    )
    mockedHandleHelpCancel.mockResolvedValue(false)
    mockedCancelMenu.mockReturnValue({ text: 'Cancel', keyboard: [] })

    // Вызываем шаг с next
    await step1(ctx, mockNext)

    expect(ctx.session.videoUrl).toBe('vid2')
    expect(ctx.reply).toHaveBeenCalledWith(
      'Отлично! Теперь отправьте голосовое сообщение (до 1 минуты) или аудиофайл (до 10 МБ) с записью голоса для аватара.',
      { reply_markup: { keyboard: [] } }
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step2: handles cancel', async () => {
    // Создаем контекст с сообщением 'Отмена'
    const cancelMessage: Message.TextMessage = { message_id: 1, date: 1, chat: { id: 1, type: 'private', first_name: 'User' }, from: { id: 2, is_bot: false, first_name: 'User' }, text: 'Отмена' }
    ctx = makeMockContext(
      { update_id: 1, message: cancelMessage },
      { scene: { enter: jest.fn(), leave: jest.fn() }, session: { videoUrl: 'url.mp4' } },
      { botInfo: mockBotInfo }
    )
    mockedHandleHelpCancel.mockResolvedValue(true)

    // Вызываем шаг с next
    await step2(ctx, mockNext)

    expect(mockedHandleHelpCancel).toHaveBeenCalledWith(ctx)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step2: handles non-voice/audio message', async () => {
    // Создаем контекст с текстовым сообщением
    const textMessage: Message.TextMessage = { message_id: 1, date: 1, chat: { id: 1, type: 'private', first_name: 'User' }, from: { id: 3, is_bot: false, first_name: 'User' }, text: 'some text' }
    ctx = makeMockContext(
      { update_id: 1, message: textMessage },
      { scene: { enter: jest.fn(), leave: jest.fn() }, session: { videoUrl: 'url.mp4' } },
      { botInfo: mockBotInfo }
    )
    mockedHandleHelpCancel.mockResolvedValue(false)

    // Вызываем шаг с next
    await step2(ctx, mockNext)

    expect(mockedSendGenericError).toHaveBeenCalledWith(ctx, true)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step2: processes valid voice message and generates avatar', async () => {
    // Создаем контекст с голосовым сообщением
    const voiceMessage: Message.VoiceMessage = {
      message_id: 1, date: 1, chat: { id: 1, type: 'private', first_name: 'User' }, from: { id: 4, is_bot: false, first_name: 'User' },
      voice: { file_id: 'voice1', file_unique_id: 'voice1_unique', duration: 30, mime_type: 'audio/ogg' }
    }
    ctx = makeMockContext(
      { update_id: 1, message: voiceMessage },
      { scene: { enter: jest.fn(), leave: jest.fn() }, session: { videoUrl: 'url.mp4' } },
      { botInfo: mockBotInfo }
    )
    mockedHandleHelpCancel.mockResolvedValue(false)
    mockedUploadVideoToServer.mockResolvedValue(undefined)

    // Вызываем шаг с next
    await step2(ctx, mockNext)

    expect(mockedUploadVideoToServer).toHaveBeenCalledWith(ctx, 'url.mp4', 'voice1', '4')
    expect(ctx.reply).toHaveBeenCalledWith('Видео успешно загружено и обрабатывается.')
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})