/**
 * Тесты для сцены voiceAvatarWizard
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { Context, MiddlewareFn } from 'telegraf'
import { Scenes } from 'telegraf' // Импортируем Scenes для WizardScene
import { Update, Message, CallbackQuery, InlineQuery, PreCheckoutQuery, User, Chat, File, Voice, UserFromGetMe } from 'telegraf/typings/core/types/typegram'
import makeMockContext from '../utils/mockTelegrafContext'
import { voiceAvatarWizard } from '../../src/scenes/voiceAvatarWizard/index' // Правильный путь к визарду
import { MyContext, MySession, UserModel } from '../../src/interfaces'
import { createHelpCancelKeyboard } from '../../src/menu/createHelpCancelKeyboard/createHelpCancelKeyboard'
import { isRussian } from '@/helpers/language' // Мок
import { getUserBalance } from '@/core/supabase' // Мок
import { sendInsufficientStarsMessage, sendBalanceMessage, voiceConversationCost } from '@/price/helpers' // Мок
import { handleHelpCancel } from '@/handlers' // Мок
import { generateVoiceAvatar } from '@/services/generateVoiceAvatar' // Мок

// --- Моки ---
jest.mock('../../src/menu/createHelpCancelKeyboard/createHelpCancelKeyboard')
jest.mock('@/helpers/language')
jest.mock('@/core/supabase')
jest.mock('@/price/helpers')
jest.mock('@/handlers')
jest.mock('@/services/generateVoiceAvatar')

const mockedCreateHelpCancelKeyboard = jest.mocked(createHelpCancelKeyboard)
const mockedIsRussian = jest.mocked(isRussian)
const mockedGetUserBalance = jest.mocked(getUserBalance)
const mockedSendInsufficientStarsMessage = jest.mocked(sendInsufficientStarsMessage)
const mockedSendBalanceMessage = jest.mocked(sendBalanceMessage)
const mockedHandleHelpCancel = jest.mocked(handleHelpCancel)
const mockedGenerateVoiceAvatar = jest.mocked(generateVoiceAvatar)

const mockUserModel: UserModel = {
  model_name: 'test-model',
  trigger_word: 'test',
  model_url: 'org/repo:version'
}

const createMockSession = (overrides: Partial<MySession> = {}): MySession => ({
  userModel: mockUserModel,
  targetUserId: '12345',
  images: [],
  cursor: 0,
  // Добавляем другие обязательные поля MySession, если они есть
  // ...
  ...overrides
});
// -------------

describe('voiceAvatarWizard', () => {
  let ctx: MyContext

  // Используем Voice, добавляем duration
  const mockGetFile = jest.fn<() => Promise<Voice>>()

  // Мок для next() - возвращает Promise<void>
  const mockNext = jest.fn<() => Promise<void>>().mockResolvedValue()

  beforeEach(() => {
    jest.clearAllMocks()

    // Настройки моков по умолчанию
    mockedIsRussian.mockReturnValue(true) // По умолчанию русский
    mockedGetUserBalance.mockResolvedValue(100) // Достаточный баланс
    mockedHandleHelpCancel.mockResolvedValue(false) // Не отмена/помощь
    // Добавляем duration в мок Voice
    mockGetFile.mockResolvedValue({ file_id: 'file_id', file_unique_id: 'unique_id', file_path: 'path/to/file', duration: 10 } as Voice)

    mockedCreateHelpCancelKeyboard.mockImplementation((isRu: boolean) => ({
      reply_markup: {
        keyboard: [[{ text: isRu ? 'Помощь' : 'Help' }], [{ text: isRu ? 'Отмена' : 'Cancel' }]],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    } as any))
  })

  // --- Тесты для Шага 0 ---
  it('step 0: should leave if no user ID', async () => {
    const session = createMockSession()
    // Создаем контекст без ctx.from
    ctx = makeMockContext({ message: {} } as Update, session)
    delete (ctx as any).from // Удаляем from для теста

    const step0 = voiceAvatarWizard.steps[0]
    // Передаем mockNext вместо jest.fn()
    await (step0 as MiddlewareFn<MyContext>)(ctx, mockNext)

    expect(ctx.reply).toHaveBeenCalledWith('Ошибка идентификации пользователя')
    expect(ctx.scene.leave).toHaveBeenCalled()
    expect(mockedGetUserBalance).not.toHaveBeenCalled()
    expect(ctx.wizard.next).not.toHaveBeenCalled()
  })

  it('step 0: should leave if balance is insufficient', async () => {
    const session = createMockSession()
    ctx = makeMockContext({ message: { text: 'start', from: { id: 123 } as User } } as Update, session)
    mockedGetUserBalance.mockResolvedValueOnce(voiceConversationCost - 1) // Недостаточный баланс

    const step0 = voiceAvatarWizard.steps[0]
    await (step0 as MiddlewareFn<MyContext>)(ctx, mockNext)

    expect(mockedGetUserBalance).toHaveBeenCalledWith('123')
    expect(mockedSendInsufficientStarsMessage).toHaveBeenCalledWith(ctx, voiceConversationCost - 1, true)
    expect(ctx.scene.leave).toHaveBeenCalled()
    expect(ctx.reply).not.toHaveBeenCalledWith(expect.stringContaining('Пожалуйста, отправьте голосовое'))
    expect(ctx.wizard.next).not.toHaveBeenCalled()
  })

  it('step 0: should prompt for voice, send balance and advance if balance sufficient', async () => {
    const session = createMockSession()
    const fromUser = { id: 123, is_bot: false, first_name: 'Tester', username: 'testuser', language_code: 'ru' }
    const botInfo = { id: 1, is_bot: true, username: 'test_bot', first_name: 'Bot', can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false } as UserFromGetMe
    ctx = makeMockContext({ message: { text: 'start', from: fromUser } } as Update, session, { botInfo })

    const step0 = voiceAvatarWizard.steps[0]
    await (step0 as MiddlewareFn<MyContext>)(ctx, mockNext)

    expect(mockedGetUserBalance).toHaveBeenCalledWith('123')
    expect(mockedSendBalanceMessage).toHaveBeenCalledWith(ctx, 100, voiceConversationCost, true, 'test_bot')
    expect(ctx.reply).toHaveBeenCalledWith(
      '🎙️ Пожалуйста, отправьте голосовое сообщение для создания голосового аватара',
      mockedCreateHelpCancelKeyboard(true)
    )
    expect(mockedCreateHelpCancelKeyboard).toHaveBeenCalledWith(true)
    // Проверяем вызов ctx.wizard.next(), который был сделан внутри шага
    expect(ctx.wizard.next).toHaveBeenCalled()
    expect(ctx.scene.leave).not.toHaveBeenCalled()
  })

  // --- Тесты для Шага 1 ---
  it('step 1: should prompt if message is invalid (no voice/audio/text)', async () => {
    const session = createMockSession()
    // Контекст с update без message или с message без нужных полей
    ctx = makeMockContext({ update_id: 1 }, session)

    const step1 = voiceAvatarWizard.steps[1]
    await (step1 as MiddlewareFn<MyContext>)(ctx, mockNext)

    expect(ctx.reply).toHaveBeenCalledWith('🎙️ Пожалуйста, отправьте голосовое сообщение')
    expect(mockedHandleHelpCancel).not.toHaveBeenCalled()
    expect(ctx.scene.leave).not.toHaveBeenCalled()
  })

  it('step 1: should leave if handleHelpCancel returns true', async () => {
    const session = createMockSession()
    ctx = makeMockContext({ message: { text: 'Отмена' } } as Update, session)
    mockedHandleHelpCancel.mockResolvedValueOnce(true)

    const step1 = voiceAvatarWizard.steps[1]
    await (step1 as MiddlewareFn<MyContext>)(ctx, mockNext)

    expect(mockedHandleHelpCancel).toHaveBeenCalledWith(ctx)
    expect(ctx.scene.leave).toHaveBeenCalled()
    expect(mockGetFile).not.toHaveBeenCalled()
    expect(mockedGenerateVoiceAvatar).not.toHaveBeenCalled()
  })

  it('step 1: should handle voice message, generate avatar and leave', async () => {
    const session = createMockSession()
    const fromUser = { id: 123, is_bot: false, first_name: 'Tester', username: 'testuser', language_code: 'ru' }
    const botInfo = { id: 1, is_bot: true, username: 'test_bot', first_name: 'Bot', can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false } as UserFromGetMe
    const voiceMessage = { message: { voice: { file_id: 'voice_file_id' }, from: fromUser } }
    ctx = makeMockContext(voiceMessage as Update, session, { botInfo })

    ctx.telegram.getFile = mockGetFile

    const step1 = voiceAvatarWizard.steps[1]
    await (step1 as MiddlewareFn<MyContext>)(ctx, mockNext)

    expect(mockedHandleHelpCancel).toHaveBeenCalledWith(ctx)
    expect(mockGetFile).toHaveBeenCalledWith('voice_file_id')
    expect(mockedGenerateVoiceAvatar).toHaveBeenCalledWith(
      `https://api.telegram.org/file/bot${ctx.telegram.token}/path/to/file`,
      'No text provided',
      '123',
      ctx,
      true,
      'test_bot'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
    expect(ctx.reply).not.toHaveBeenCalledWith(expect.stringContaining('Ошибка'))
  })

  it('step 1: should handle audio message, generate avatar and leave', async () => {
    const session = createMockSession()
    const fromUser = { id: 123, is_bot: false, first_name: 'Tester', username: 'testuser', language_code: 'ru' }
    const botInfo = { id: 1, is_bot: true, username: 'test_bot', first_name: 'Bot', can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false } as UserFromGetMe
    const audioMessage = { message: { audio: { file_id: 'audio_file_id' }, from: fromUser } }
    ctx = makeMockContext(audioMessage as Update, session, { botInfo })
    ctx.telegram.getFile = mockGetFile

    const step1 = voiceAvatarWizard.steps[1]
    await (step1 as MiddlewareFn<MyContext>)(ctx, mockNext)

    expect(mockedHandleHelpCancel).toHaveBeenCalledWith(ctx)
    expect(mockGetFile).toHaveBeenCalledWith('audio_file_id')
    expect(mockedGenerateVoiceAvatar).toHaveBeenCalledWith(
      `https://api.telegram.org/file/bot${ctx.telegram.token}/path/to/file`,
      'No text provided',
      '123',
      ctx,
      true,
      'test_bot'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
    expect(ctx.reply).not.toHaveBeenCalledWith(expect.stringContaining('Ошибка'))
  })

  it('step 1: should reply with error and leave if text message is not help/cancel', async () => {
    const session = createMockSession()
    ctx = makeMockContext({ message: { text: 'some random text' } } as Update, session)

    const step1 = voiceAvatarWizard.steps[1]
    await (step1 as MiddlewareFn<MyContext>)(ctx, mockNext)

    expect(mockedHandleHelpCancel).toHaveBeenCalledWith(ctx)
    expect(ctx.reply).toHaveBeenCalledWith('Ошибка: не удалось получить идентификатор файла')
    expect(ctx.scene.leave).toHaveBeenCalled()
    expect(mockGetFile).not.toHaveBeenCalled()
    expect(mockedGenerateVoiceAvatar).not.toHaveBeenCalled()
  })

  it('step 1: should handle getFile error', async () => {
    const session = createMockSession()
    const voiceMessage = { message: { voice: { file_id: 'voice_file_id' } } }
    ctx = makeMockContext(voiceMessage as Update, session)
    ctx.telegram.getFile = mockGetFile
    const getFileError = new Error('Failed to get file')
    mockGetFile.mockRejectedValueOnce(getFileError)

    const step1 = voiceAvatarWizard.steps[1]
    await (step1 as MiddlewareFn<MyContext>)(ctx, mockNext)

    expect(mockedHandleHelpCancel).toHaveBeenCalledWith(ctx)
    expect(mockGetFile).toHaveBeenCalledWith('voice_file_id')
    expect(ctx.reply).toHaveBeenCalledWith('❌ Произошла ошибка при создании голосового аватара. Пожалуйста, попробуйте позже.')
    expect(mockedGenerateVoiceAvatar).not.toHaveBeenCalled()
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 1: should handle generateVoiceAvatar error', async () => {
    const session = createMockSession()
    const voiceMessage = { message: { voice: { file_id: 'voice_file_id' } } }
    ctx = makeMockContext(voiceMessage as Update, session)
    ctx.telegram.getFile = mockGetFile
    const generateError = new Error('Generation failed')
    mockedGenerateVoiceAvatar.mockRejectedValueOnce(generateError)

    const step1 = voiceAvatarWizard.steps[1]
    await (step1 as MiddlewareFn<MyContext>)(ctx, mockNext)

    expect(mockedHandleHelpCancel).toHaveBeenCalledWith(ctx)
    expect(mockGetFile).toHaveBeenCalledWith('voice_file_id')
    expect(mockedGenerateVoiceAvatar).toHaveBeenCalled()
    expect(ctx.reply).toHaveBeenCalledWith('❌ Произошла ошибка при создании голосового аватара. Пожалуйста, попробуйте позже.')
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})