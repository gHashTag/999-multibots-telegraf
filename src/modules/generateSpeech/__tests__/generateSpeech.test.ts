import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateSpeech, GenerateSpeechDependencies } from '../index'
import { Readable, Writable } from 'stream'
import { pipeline as streamPipelineCb } from 'stream'
import { pipeline as streamPipelinePromises } from 'stream/promises'
import { ModeEnum } from '@/interfaces/modes'

// --- Mock Dependencies ---
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}

// Mock readable stream for ElevenLabs
const mockAudioStream = new Readable({
  read() {
    this.push(Buffer.from('mock audio data'))
    this.push(null) // End the stream
  },
})

const mockElevenLabsClient = {
  generate: vi.fn().mockResolvedValue(mockAudioStream),
}

// Mock writable stream for fs
class MockWriteStream extends Writable {
  _write(
    chunk: any,
    encoding: string,
    callback: (error?: Error | null) => void
  ) {
    // Simulate successful write
    callback()
  }
}
let mockWriteStreamInstance: MockWriteStream
const mockFs = {
  createWriteStream: vi.fn(() => {
    mockWriteStreamInstance = new MockWriteStream()
    // Immediately emit 'finish' for simplicity in most tests
    setTimeout(() => mockWriteStreamInstance.emit('finish'), 0)
    return mockWriteStreamInstance as any // Cast to satisfy type
  }),
}

const mockPath = {
  join: vi.fn((...args) => args.filter(Boolean).join('/')), // Basic mock
}

const mockOs = {
  tmpdir: vi.fn(() => '/mock/tmp'), // Mock temporary directory
}

const mockSupabaseUserOps = {
  getUserByTelegramIdString: vi.fn(),
  updateUserLevelPlusOne: vi.fn(),
}

const mockErrorHandlers = {
  sendServiceErrorToUser: vi.fn(),
  sendServiceErrorToAdmin: vi.fn(),
}

const mockPriceCalculator = vi.fn()
const mockBalanceProcessor = vi.fn()

const mockTelegram = {
  sendMessage: vi.fn().mockResolvedValue({ message_id: 1 } as any),
  sendAudio: vi.fn().mockResolvedValue({ message_id: 2 } as any),
}
const mockTelegramApiProvider = {
  getTelegramApi: vi.fn().mockResolvedValue(mockTelegram),
}

const mockHelpers = {
  toBotName: vi.fn(name => name || 'default_bot'),
}

const mockElevenlabsApiKey = 'test-api-key'

// ИЗМЕНЕНИЕ: Создаем мок для streamPipelinePromises
const mockStreamPipeline = vi.fn()

// --- Tests --- //
describe('Module: generateSpeech', () => {
  let dependencies: GenerateSpeechDependencies
  let request: any // Use 'any' for simplicity in tests, refine if needed

  beforeEach(() => {
    // Сбрасываем моки индивидуально
    mockLogger.info.mockClear()
    mockLogger.error.mockClear()
    mockLogger.warn.mockClear()
    mockElevenLabsClient.generate.mockClear()
    mockFs.createWriteStream.mockClear()
    mockPath.join.mockClear()
    mockOs.tmpdir.mockClear()
    mockSupabaseUserOps.getUserByTelegramIdString.mockClear()
    mockSupabaseUserOps.updateUserLevelPlusOne.mockClear()
    mockErrorHandlers.sendServiceErrorToUser.mockClear()
    mockErrorHandlers.sendServiceErrorToAdmin.mockClear()
    mockPriceCalculator.mockClear()
    mockBalanceProcessor.mockClear()
    mockTelegramApiProvider.getTelegramApi.mockClear()
    mockTelegram.sendMessage.mockClear()
    mockTelegram.sendAudio.mockClear()
    mockHelpers.toBotName.mockClear()
    mockStreamPipeline.mockClear() // Сбрасываем мок pipeline

    // Настраиваем моки заново
    mockSupabaseUserOps.getUserByTelegramIdString.mockResolvedValue({
      id: 'user-id-123',
      telegram_id: '12345',
      level: 5,
    } as any)
    mockSupabaseUserOps.updateUserLevelPlusOne.mockResolvedValue({})
    mockPriceCalculator.mockReturnValue({ stars: 10 })
    mockBalanceProcessor.mockResolvedValue({ success: true, newBalance: 90 })
    mockTelegramApiProvider.getTelegramApi.mockResolvedValue(
      mockTelegram as any
    )
    mockTelegram.sendMessage.mockResolvedValue({ message_id: 1 } as any)
    mockTelegram.sendAudio.mockResolvedValue({ message_id: 2 } as any)

    // Настраиваем успешный мок для ElevenLabs по умолчанию
    const successAudioStream = new Readable({
      read() {
        this.push(Buffer.from('ok'))
        this.push(null)
      },
    })
    mockElevenLabsClient.generate.mockResolvedValue(successAudioStream)

    // Настраиваем успешный мок для pipeline по умолчанию
    mockStreamPipeline.mockResolvedValue(undefined)

    // Настраиваем мок для createWriteStream
    mockFs.createWriteStream = vi.fn(() => {
      mockWriteStreamInstance = new MockWriteStream()
      return mockWriteStreamInstance as any
    })

    dependencies = {
      logger: mockLogger,
      elevenlabs: mockElevenLabsClient,
      fs: mockFs as any,
      path: mockPath,
      os: mockOs,
      supabase: mockSupabaseUserOps,
      errorHandlers: mockErrorHandlers,
      priceCalculator: mockPriceCalculator,
      balanceProcessor: mockBalanceProcessor,
      telegramApiProvider: mockTelegramApiProvider,
      helpers: mockHelpers,
      elevenlabsApiKey: mockElevenlabsApiKey,
      // ИЗМЕНЕНИЕ: Передаем мок streamPipeline
      streamPipeline: mockStreamPipeline,
    }

    request = {
      text: 'Hello world',
      voice_id: 'voice-xyz',
      telegram_id: '12345',
      is_ru: false,
      bot_name: 'test_bot',
    }
  })

  it('should generate speech successfully (happy path)', async () => {
    const result = await generateSpeech(request, dependencies)

    expect(result).toBeDefined()
    expect(result).toHaveProperty('audioPath')
    expect(result.audioPath).toMatch(/\/mock\/tmp\/audio_\d+\.mp3$/)

    // Verify dependencies called
    expect(mockSupabaseUserOps.getUserByTelegramIdString).toHaveBeenCalledWith(
      request.telegram_id
    )
    expect(mockPriceCalculator).toHaveBeenCalledWith(ModeEnum.TextToSpeech)
    expect(mockBalanceProcessor).toHaveBeenCalledWith({
      telegram_id: Number(request.telegram_id),
      paymentAmount: 10,
      is_ru: request.is_ru,
    })
    expect(mockTelegramApiProvider.getTelegramApi).toHaveBeenCalledWith(
      request.bot_name
    )
    const resolvedTelegramApi = await mockTelegramApiProvider.getTelegramApi(
      request.bot_name
    )
    expect(resolvedTelegramApi).toBe(mockTelegram)
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(2) // Start + Balance
    expect(mockElevenLabsClient.generate).toHaveBeenCalledWith({
      voice: request.voice_id,
      model_id: 'eleven_turbo_v2_5',
      text: request.text,
    })
    expect(mockFs.createWriteStream).toHaveBeenCalledTimes(1)
    expect(mockTelegram.sendAudio).toHaveBeenCalledTimes(1)
    expect(mockSupabaseUserOps.updateUserLevelPlusOne).not.toHaveBeenCalled() // Level 5 != 7
    expect(mockErrorHandlers.sendServiceErrorToUser).not.toHaveBeenCalled()
    expect(mockErrorHandlers.sendServiceErrorToAdmin).not.toHaveBeenCalled()
    expect(mockLogger.error).not.toHaveBeenCalled()
  })

  it('should update user level if level is 7', async () => {
    mockSupabaseUserOps.getUserByTelegramIdString.mockResolvedValueOnce({
      id: 'user-id-777',
      telegram_id: '777',
      level: 7,
    } as any)
    request.telegram_id = '777'

    await generateSpeech(request, dependencies)

    expect(mockSupabaseUserOps.updateUserLevelPlusOne).toHaveBeenCalledWith(
      '777',
      7
    )
  })

  it('should throw error if user not found', async () => {
    mockSupabaseUserOps.getUserByTelegramIdString.mockResolvedValueOnce(null)

    await expect(generateSpeech(request, dependencies)).rejects.toThrow(
      `Пользователь с ID ${request.telegram_id} не найден.`
    )

    expect(mockErrorHandlers.sendServiceErrorToUser).toHaveBeenCalledTimes(1)
    expect(mockErrorHandlers.sendServiceErrorToAdmin).toHaveBeenCalledTimes(1)
    expect(mockBalanceProcessor).not.toHaveBeenCalled()
  })

  it('should throw error if price calculation fails', async () => {
    mockPriceCalculator.mockReturnValueOnce(null)

    await expect(generateSpeech(request, dependencies)).rejects.toThrow(
      'Не удалось рассчитать стоимость для TextToSpeech.'
    )
    expect(mockErrorHandlers.sendServiceErrorToUser).toHaveBeenCalledTimes(1)
    expect(mockErrorHandlers.sendServiceErrorToAdmin).toHaveBeenCalledTimes(1)
    expect(mockBalanceProcessor).not.toHaveBeenCalled()
  })

  it('should throw error if balance check fails', async () => {
    mockBalanceProcessor.mockResolvedValueOnce({
      success: false,
      error: 'Insufficient stars',
    })

    await expect(generateSpeech(request, dependencies)).rejects.toThrow(
      'Insufficient stars'
    )

    expect(mockErrorHandlers.sendServiceErrorToUser).toHaveBeenCalledTimes(1)
    expect(mockErrorHandlers.sendServiceErrorToAdmin).toHaveBeenCalledTimes(1)
    expect(mockElevenLabsClient.generate).not.toHaveBeenCalled()
  })

  it('should throw error if ElevenLabs API key is missing', async () => {
    dependencies.elevenlabsApiKey = '' // Simulate missing key

    await expect(generateSpeech(request, dependencies)).rejects.toThrow(
      'API ключ ElevenLabs отсутствует.'
    )
    expect(mockErrorHandlers.sendServiceErrorToUser).toHaveBeenCalledTimes(1)
    expect(mockErrorHandlers.sendServiceErrorToAdmin).toHaveBeenCalledTimes(1)
    expect(mockElevenLabsClient.generate).not.toHaveBeenCalled()
  })

  it('should throw error if Telegram API provider fails', async () => {
    mockTelegramApiProvider.getTelegramApi.mockResolvedValueOnce(null)

    await expect(generateSpeech(request, dependencies)).rejects.toThrow(
      `Инстанс Telegram API для бота ${request.bot_name} не найден.`
    )
    expect(mockErrorHandlers.sendServiceErrorToUser).toHaveBeenCalledTimes(1)
    expect(mockErrorHandlers.sendServiceErrorToAdmin).toHaveBeenCalledTimes(1)
    expect(mockElevenLabsClient.generate).not.toHaveBeenCalled()
  })

  it('should handle ElevenLabs generate error', async () => {
    const elevenLabsError = new Error('ElevenLabs API Error')
    // ИЗМЕНЕНИЕ: Теперь generate возвращает поток, ошибка будет при pipeline
    const errorAudioStream = new Readable({
      read() {
        this.destroy(elevenLabsError)
      },
    })
    mockElevenLabsClient.generate.mockResolvedValueOnce(errorAudioStream)
    // Мокируем ошибку pipeline
    mockStreamPipeline.mockRejectedValueOnce(elevenLabsError)

    await expect(generateSpeech(request, dependencies)).rejects.toThrow(
      'ElevenLabs API Error'
    )

    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(1) // Only the 'Generating...'
    expect(mockStreamPipeline).toHaveBeenCalledTimes(1) // Pipeline был вызван
    expect(mockErrorHandlers.sendServiceErrorToUser).toHaveBeenCalledTimes(1)
    expect(mockErrorHandlers.sendServiceErrorToAdmin).toHaveBeenCalledTimes(1)
    expect(mockTelegram.sendAudio).not.toHaveBeenCalled()
  })

  it('should handle file write stream error', async () => {
    const writeError = new Error('Disk full')
    // Arrange: Настроим pipeline на отклонение с ошибкой записи
    mockStreamPipeline.mockRejectedValueOnce(writeError)
    // ElevenLabs должен отработать успешно
    const successAudioStream = new Readable({
      read() {
        this.push(Buffer.from('ok'))
        this.push(null)
      },
    })
    mockElevenLabsClient.generate.mockResolvedValueOnce(successAudioStream)

    await expect(generateSpeech(request, dependencies)).rejects.toThrow(
      'Disk full'
    )

    expect(mockElevenLabsClient.generate).toHaveBeenCalledTimes(1)
    expect(mockFs.createWriteStream).toHaveBeenCalledTimes(1)
    expect(mockStreamPipeline).toHaveBeenCalledTimes(1)
    expect(mockErrorHandlers.sendServiceErrorToUser).toHaveBeenCalledWith(
      expect.any(String),
      request.telegram_id,
      writeError, // Ожидаем ошибку pipeline
      request.is_ru
    )
    expect(mockErrorHandlers.sendServiceErrorToAdmin).toHaveBeenCalledWith(
      expect.any(String),
      request.telegram_id,
      writeError // Ожидаем ошибку pipeline
    )
    expect(mockTelegram.sendAudio).not.toHaveBeenCalled()
  })

  it('should handle error during telegram sendAudio/sendMessage after file write', async () => {
    const sendError = new Error('Telegram send failed')
    // Arrange: pipeline успешен, ElevenLabs успешен
    mockStreamPipeline.mockResolvedValue(undefined)
    const successAudioStream = new Readable({
      read() {
        this.push(Buffer.from('ok'))
        this.push(null)
      },
    })
    mockElevenLabsClient.generate.mockResolvedValueOnce(successAudioStream)
    // Мокируем ошибку при отправке аудио
    mockTelegram.sendAudio.mockRejectedValueOnce(sendError)

    // Act: Функция должна УСПЕШНО завершиться (ошибка отправки не фатальна для генерации)
    const result = await generateSpeech(request, dependencies)
    expect(result).toBeDefined()
    expect(result.audioPath).toMatch(/\/mock\/tmp\/audio_\d+\.mp3$/)

    // Assert: Проверяем, что все шаги до отправки были выполнены
    expect(mockElevenLabsClient.generate).toHaveBeenCalledTimes(1)
    expect(mockFs.createWriteStream).toHaveBeenCalledTimes(1)
    expect(mockStreamPipeline).toHaveBeenCalledTimes(1)
    expect(mockTelegram.sendAudio).toHaveBeenCalledTimes(1) // Попытка отправки была
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(1) // Только 'Generating...'
    // Проверяем, что ошибка отправки залогирована и отправлена админу
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining(
        'Ошибка при отправке аудио/сообщения после записи'
      ),
      expect.anything()
    )
    expect(mockErrorHandlers.sendServiceErrorToAdmin).toHaveBeenCalledWith(
      expect.any(String),
      request.telegram_id,
      sendError
    )
    // Ошибка пользователю в этом случае НЕ отправляется
    expect(mockErrorHandlers.sendServiceErrorToUser).not.toHaveBeenCalled()
  })
})
