import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals'
import makeMockContext from '../utils/mockTelegrafContext'
import { MyContext } from '@/interfaces'

// Mock config and dependencies
jest.mock('@/config', () => ({
  LOCAL_SERVER_URL: 'http://local',
}))
jest.mock('@/price/helpers', () => ({
  // Типизируем мок processBalanceOperation здесь
  processBalanceOperation: jest.fn<
    (
      // Указываем тип аргументов, если они есть, иначе пустой массив
      args: any // Или более конкретный тип, если известен
    ) => Promise<{
      success: boolean
      newBalance: number
      error?: string
      modePrice?: number
    }>
  >(),
}))
// Используем относительный путь для jest.mock
jest.mock('../../src/utils', () => ({
  makeAudioId: jest.fn(() => 'audio123'),
}))
// Мокируем axios глобально для файла
jest.mock('axios')
const axios = require('axios') // Теперь можно require

describe('generateTextToSpeech', () => {
  let generateTextToSpeech: any
  let ctx: MyContext
  let mockProcessBalanceOperation: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    // Получаем мокированные версии
    const helpers = require('@/price/helpers')
    mockProcessBalanceOperation = helpers.processBalanceOperation

    // Настраиваем моки axios для каждого теста
    axios.post.mockResolvedValue({ data: { audio: 'base64data' } })
    axios.isAxiosError.mockReturnValue(false)

    // Мокируем console
    jest.spyOn(console, 'log').mockImplementation(() => {
      /* suppressed */
    })
    jest.spyOn(console, 'error').mockImplementation(() => {
      /* suppressed */
    })

    // Настраиваем FormData
    const mockFormDataAppend = jest.fn<() => void>(() => {
      /* mocked */
    })
    const mockFormData = { append: mockFormDataAppend }
    global.FormData = jest.fn(() => mockFormData) as any

    // Дефолтное значение для мока баланса
    mockProcessBalanceOperation.mockResolvedValue({
      success: true,
      newBalance: 100,
    })

    // Создаем контекст
    ctx = makeMockContext({ from: { id: 5, language_code: 'en' } })

    // Получаем тестируемую функцию
    generateTextToSpeech =
      require('@/services/generateTextToSpeech').generateTextToSpeech
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should call processBalanceOperation, axios.post and return audio', async () => {
    // Arrange
    const text = 'hello'
    const language = 'en'
    const telegram_id = 5
    const bot_name = 'botX'

    // Act
    const result = await generateTextToSpeech(
      text,
      language,
      telegram_id,
      bot_name,
      ctx
    )

    // Assert
    expect(mockProcessBalanceOperation).toHaveBeenCalledWith({
      ctx,
      telegram_id,
      serviceName: 'text_to_speech',
      is_ru: false,
      bot_name,
    })
    expect(require('../../src/utils').makeAudioId).toHaveBeenCalledWith(
      telegram_id
    )
    expect(axios.post).toHaveBeenCalledWith(
      'http://local/generate/text-to-speech',
      expect.objectContaining({ append: expect.any(Function) }), // Проверяем наличие append
      expect.any(Object) // Проверяем заголовки и тип ответа
    )
    // Указываем тип для formDataInstance
    const formDataInstance: FormData = (global.FormData as jest.Mock).mock
      .results[0].value
    expect(formDataInstance.append).toHaveBeenCalledWith('text', text)
    expect(formDataInstance.append).toHaveBeenCalledWith('language', language)
    expect(formDataInstance.append).toHaveBeenCalledWith('audio_id', 'audio123')
    expect(result).toBe('base64data')
  })

  it('should return null if balance check fails', async () => {
    // Arrange
    mockProcessBalanceOperation.mockResolvedValueOnce({
      success: false,
      newBalance: 10,
    })

    // Act
    const result = await generateTextToSpeech('hello', 'en', 5, 'botX', ctx)

    // Assert
    expect(result).toBeNull()
    expect(axios.post).not.toHaveBeenCalled()
  })

  it('should return null if axios post fails', async () => {
    // Arrange
    const error = new Error('Network error')
    axios.post.mockRejectedValueOnce(error) // Модифицируем мок для axios

    // Act
    const result = await generateTextToSpeech('hello', 'en', 5, 'botX', ctx)

    // Assert
    expect(result).toBeNull()
  })

  it('should call ElevenLabs API and return audio URL on success', async () => {
    const mockText = 'Hello, world!'
    const mockVoiceId = 'voice-123'
    const mockStream = new PassThrough() // Create a readable stream
    const mockAudioUrl = 'http://mock-audio.url/audio.mp3'

    // Mock the ElevenLabs client method
    mockedElevenLabsClient.generate.mockResolvedValue(mockStream)
    // Mock the Supabase storage upload
    mockedUploadFileToSupabaseStorage.mockResolvedValue(mockAudioUrl)

    // Simulate reading from the stream (important for the test to proceed)
    setImmediate(() => {
      mockStream.push(Buffer.from('fake audio data'))
      mockStream.push(null) // End the stream
    })

    const result = await generateTextToSpeech(mockText, mockVoiceId)

    expect(mockedElevenLabsClient.generate).toHaveBeenCalledWith({
      voice_id: mockVoiceId,
      text: mockText,
      // model_id: 'eleven_multilingual_v2', // Verify if default is used or specify if needed
    })
    expect(mockedUploadFileToSupabaseStorage).toHaveBeenCalledWith(
      mockStream, // Check if the stream is passed
      expect.stringContaining('audio/mpeg'), // Check content type
      expect.stringMatching(/\.mp3$/) // Check if filename ends with .mp3
    )
    expect(result).toBe(mockAudioUrl)
  })

  it('should throw error if ElevenLabs API fails', async () => {
    const mockText = 'Test error case'
    const mockVoiceId = 'voice-error'
    const mockError = new Error('ElevenLabs API Error')

    mockedElevenLabsClient.generate.mockRejectedValue(mockError)

    await expect(generateTextToSpeech(mockText, mockVoiceId)).rejects.toThrow(
      'ElevenLabs API Error'
    )
    expect(mockedUploadFileToSupabaseStorage).not.toHaveBeenCalled()
  })

  it('should throw error if Supabase upload fails', async () => {
    const mockText = 'Test upload failure'
    const mockVoiceId = 'voice-upload-fail'
    const mockStream = new PassThrough()
    const mockError = new Error('Supabase Upload Error')

    mockedElevenLabsClient.generate.mockResolvedValue(mockStream)
    mockedUploadFileToSupabaseStorage.mockRejectedValue(mockError)

    // Simulate stream data
    setImmediate(() => {
      mockStream.push(Buffer.from('audio data'))
      mockStream.push(null)
    })

    await expect(generateTextToSpeech(mockText, mockVoiceId)).rejects.toThrow(
      'Supabase Upload Error'
    )
    expect(mockedUploadFileToSupabaseStorage).toHaveBeenCalledTimes(1)
  })

  // Add tests for invalid input if necessary (e.g., empty text)
})
