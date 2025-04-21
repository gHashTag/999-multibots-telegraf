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
    () => Promise<{
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
    const formDataInstance = (global.FormData as jest.Mock).mock.results[0]
      .value
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
})
