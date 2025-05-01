import { describe, it, expect, beforeEach, mock, afterEach } from 'bun:test'
import { createVoiceAvatar } from '@/services/plan_b/createVoiceAvatar'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces' // Допустим, этот интерфейс используется для типизации бота

// --- Мокирование Зависимостей --- //

// Мок Supabase
const mockSupabaseUpdate = mock(() => ({ eq: mockSupabaseEq }))
const mockSupabaseEq = mock(() => Promise.resolve({ error: null }))
const mockGetUserByTelegramId = mock((id: string) =>
  Promise.resolve({
    id: 'db-id',
    telegram_id: id,
    username: 'testuser',
    level: 5,
    voice_id_elevenlabs: null,
    created_at: '',
    updated_at: '',
  })
)
const mockUpdateUserLevel = mock((id: string, level: number) =>
  Promise.resolve({ data: null, error: null })
)

mock.module('@/core/supabase', () => ({
  supabase: {
    from: mock(() => ({ update: mockSupabaseUpdate })),
  },
  getUserByTelegramIdString: mockGetUserByTelegramId,
  updateUserLevelPlusOne: mockUpdateUserLevel,
}))

// Мок ElevenLabs
const mockCreateVoiceElevenLabs = mock(
  (params: { fileUrl: string; username: string }) =>
    Promise.resolve('mock_voice_id')
)
mock.module('@/core/elevenlabs/createVoiceElevenLabs', () => ({
  createVoiceElevenLabs: mockCreateVoiceElevenLabs,
}))

// Мок Хелперов Ошибок
const mockSendServiceErrorToUser = mock(
  (bot: any, id: string, error: Error, isRu: boolean) => Promise.resolve()
)
const mockSendServiceErrorToAdmin = mock((bot: any, id: string, error: Error) =>
  Promise.resolve()
)
mock.module('@/helpers/error', () => ({
  sendServiceErrorToUser: mockSendServiceErrorToUser,
  sendServiceErrorToAdmin: mockSendServiceErrorToAdmin,
}))

// Мок Telegraf
const mockSendMessage = mock((chatId: string, text: string) =>
  Promise.resolve({ message_id: 123 })
)
const mockBotInstance = {
  telegram: {
    sendMessage: mockSendMessage,
  },
} as unknown as Telegraf<MyContext>

// --- Тесты --- //

describe('Plan B: createVoiceAvatar Service', () => {
  beforeEach(() => {
    // Сброс моков перед каждым тестом
    mockSupabaseUpdate.mockClear()
    mockSupabaseEq.mockClear().mockResolvedValue({ error: null })
    mockGetUserByTelegramId.mockClear().mockResolvedValue({
      id: 'db-id',
      telegram_id: '12345',
      username: 'testuser',
      level: 5,
      voice_id_elevenlabs: null,
      created_at: '',
      updated_at: '',
    })
    mockUpdateUserLevel
      .mockClear()
      .mockResolvedValue({ data: null, error: null })
    mockCreateVoiceElevenLabs.mockClear().mockResolvedValue('mock_voice_id')
    mockSendServiceErrorToUser.mockClear()
    mockSendServiceErrorToAdmin.mockClear()
    mockSendMessage.mockClear()
  })

  afterEach(() => {
    mock.restore()
  })

  it('should successfully create a voice avatar and update user', async () => {
    // Arrange
    const fileUrl = 'http://example.com/audio.mp3'
    const telegram_id = '12345'
    const username = 'testuser'
    const isRu = false
    const expectedVoiceId = 'mock_voice_id'

    // Act
    const result = await createVoiceAvatar(
      fileUrl,
      telegram_id,
      username,
      isRu,
      mockBotInstance
    )

    // Assert
    // 1. Проверяем результат функции
    expect(result).toEqual({ voiceId: expectedVoiceId })

    // 2. Проверяем вызовы зависимостей
    expect(mockGetUserByTelegramId).toHaveBeenCalledWith(telegram_id)
    expect(mockUpdateUserLevel).not.toHaveBeenCalled() // Уровень не должен обновляться (level = 5)
    expect(mockSendMessage).toHaveBeenCalledTimes(2) // Начало и конец
    expect(mockSendMessage).toHaveBeenNthCalledWith(
      1,
      telegram_id,
      '⏳ Creating voice avatar...'
    )
    expect(mockCreateVoiceElevenLabs).toHaveBeenCalledWith({
      fileUrl,
      username,
    })
    expect(mockSupabaseUpdate).toHaveBeenCalledWith({
      voice_id_elevenlabs: expectedVoiceId,
    })
    expect(mockSupabaseEq).toHaveBeenCalledWith('username', username)
    expect(mockSendMessage).toHaveBeenNthCalledWith(
      2,
      telegram_id,
      expect.stringContaining('successfully created')
    )

    // 3. Проверяем, что ошибки не отправлялись
    expect(mockSendServiceErrorToUser).not.toHaveBeenCalled()
    expect(mockSendServiceErrorToAdmin).not.toHaveBeenCalled()
  })

  it('should throw error and notify user/admin if user not found', async () => {
    // Arrange
    const fileUrl = 'http://example.com/audio.mp3'
    const telegram_id = 'not_found_user'
    const username = 'unknownuser'
    const isRu = true

    // Мокируем getUserByTelegramIdString, чтобы вернуть null
    mockGetUserByTelegramId.mockResolvedValueOnce(null)

    // Act & Assert
    await expect(
      createVoiceAvatar(fileUrl, telegram_id, username, isRu, mockBotInstance)
    ).rejects.toThrow(`User with ID ${telegram_id} does not exist.`)

    // Проверяем, что другие важные функции не вызывались
    expect(mockCreateVoiceElevenLabs).not.toHaveBeenCalled()
    expect(mockSupabaseUpdate).not.toHaveBeenCalled()

    // Проверяем отправку сообщений об ошибке
    expect(mockSendServiceErrorToUser).toHaveBeenCalledTimes(1)
    expect(mockSendServiceErrorToAdmin).toHaveBeenCalledTimes(1)
    expect(mockSendMessage).not.toHaveBeenCalled() // Сообщения о процессе/успехе не отправляются
  })

  it('should throw error and notify user/admin if ElevenLabs fails', async () => {
    // Arrange
    const fileUrl = 'http://example.com/audio.mp3'
    const telegram_id = '12345' // Существующий пользователь
    const username = 'testuser'
    const isRu = false

    // Мокируем createVoiceElevenLabs, чтобы вернуть null
    mockCreateVoiceElevenLabs.mockResolvedValueOnce(null)

    // Act & Assert
    await expect(
      createVoiceAvatar(fileUrl, telegram_id, username, isRu, mockBotInstance)
    ).rejects.toThrow('Ошибка при создании голоса')

    // Проверяем, что Supabase не обновлялся
    expect(mockSupabaseUpdate).not.toHaveBeenCalled()

    // Проверяем отправку сообщений об ошибке
    expect(mockSendServiceErrorToUser).toHaveBeenCalledTimes(1)
    expect(mockSendServiceErrorToAdmin).toHaveBeenCalledTimes(1)

    // Проверяем, что сообщение об успехе не отправлялось
    expect(mockSendMessage).toHaveBeenCalledTimes(1) // Только начальное сообщение
    expect(mockSendMessage).toHaveBeenCalledWith(
      telegram_id,
      '⏳ Creating voice avatar...'
    )
  })

  it('should throw error and notify user/admin if Supabase update fails', async () => {
    // Arrange
    const fileUrl = 'http://example.com/audio.mp3'
    const telegram_id = '12345' // Существующий пользователь
    const username = 'testuser'
    const isRu = true
    const mockError = new Error('Supabase DB Error')

    // Мокируем Supabase .eq(), чтобы вернуть ошибку
    mockSupabaseEq.mockResolvedValueOnce({ error: mockError })

    // Act & Assert
    await expect(
      createVoiceAvatar(fileUrl, telegram_id, username, isRu, mockBotInstance)
    ).rejects.toThrow('Ошибка при сохранении данных')

    // Проверяем, что ElevenLabs вызывался
    expect(mockCreateVoiceElevenLabs).toHaveBeenCalledTimes(1)

    // Проверяем вызовы Supabase
    expect(mockSupabaseUpdate).toHaveBeenCalledWith({
      voice_id_elevenlabs: 'mock_voice_id',
    })
    expect(mockSupabaseEq).toHaveBeenCalledWith('username', username)

    // Проверяем отправку сообщений об ошибке
    expect(mockSendServiceErrorToUser).toHaveBeenCalledTimes(1)
    expect(mockSendServiceErrorToAdmin).toHaveBeenCalledTimes(1)

    // Проверяем, что сообщение об успехе не отправлялось
    expect(mockSendMessage).toHaveBeenCalledTimes(1) // Только начальное сообщение
    expect(mockSendMessage).toHaveBeenCalledWith(
      telegram_id,
      '⏳ Создаю голосовой аватар...'
    )
  })

  it('should update user level if current level is 6', async () => {
    // Arrange
    const fileUrl = 'http://example.com/audio.mp3'
    const telegram_id = 'level_up_user'
    const username = 'levelupuser'
    const isRu = false
    const initialLevel = 6

    // Мокируем getUserByTelegramIdString, чтобы вернуть пользователя с уровнем 6
    mockGetUserByTelegramId.mockResolvedValueOnce({
      id: 'db-id-lvl6',
      telegram_id,
      username,
      level: initialLevel,
      voice_id_elevenlabs: null,
      created_at: '',
      updated_at: '',
    })

    // Act
    await createVoiceAvatar(
      fileUrl,
      telegram_id,
      username,
      isRu,
      mockBotInstance
    )

    // Assert
    // Проверяем, что уровень пользователя был обновлен
    expect(mockUpdateUserLevel).toHaveBeenCalledTimes(1)
    expect(mockUpdateUserLevel).toHaveBeenCalledWith(telegram_id, initialLevel)

    // Проверяем остальные успешные вызовы
    expect(mockCreateVoiceElevenLabs).toHaveBeenCalledTimes(1)
    expect(mockSupabaseUpdate).toHaveBeenCalledTimes(1)
    expect(mockSendMessage).toHaveBeenCalledTimes(2)
    expect(mockSendServiceErrorToUser).not.toHaveBeenCalled()
  })

  it('should handle unexpected errors during execution', async () => {
    // Arrange
    const fileUrl = 'http://example.com/audio.mp3'
    const telegram_id = '12345'
    const username = 'testuser'
    const isRu = false
    const unexpectedError = new Error('Unexpected internal error')

    // Мокируем createVoiceElevenLabs, чтобы выбросить ошибку
    mockCreateVoiceElevenLabs.mockImplementationOnce(() => {
      throw unexpectedError
    })

    // Act & Assert
    await expect(
      createVoiceAvatar(fileUrl, telegram_id, username, isRu, mockBotInstance)
    ).rejects.toThrow(unexpectedError)

    // Проверяем, что Supabase не обновлялся
    expect(mockSupabaseUpdate).not.toHaveBeenCalled()

    // Проверяем отправку сообщений об ошибке
    expect(mockSendServiceErrorToUser).toHaveBeenCalledTimes(1)
    expect(mockSendServiceErrorToUser).toHaveBeenCalledWith(
      mockBotInstance,
      telegram_id,
      unexpectedError,
      isRu
    )
    expect(mockSendServiceErrorToAdmin).toHaveBeenCalledTimes(1)
    expect(mockSendServiceErrorToAdmin).toHaveBeenCalledWith(
      mockBotInstance,
      telegram_id,
      unexpectedError
    )

    // Проверяем, что сообщение об успехе не отправлялось
    expect(mockSendMessage).toHaveBeenCalledTimes(1) // Только начальное сообщение
  })

  // TODO: Добавить больше тестов для разных сценариев:
  // - Проверка отправки сообщений пользователю (текст в зависимости от isRu)
})
