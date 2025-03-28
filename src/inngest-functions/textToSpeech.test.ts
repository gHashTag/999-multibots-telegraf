import { inngest } from '@/core/inngest/clients'
import { textToSpeechFunction } from './textToSpeech.inngest'
import { elevenlabs } from '@/core/elevenlabs'
import { createWriteStream } from 'fs'
import { getBotByName } from '@/core/bot'
import { errorMessage, errorMessageAdmin } from '@/helpers'
import {
  getUserByTelegramIdString,
  updateUserLevelPlusOne,
} from '@/core/supabase'

// Мокаем модули
jest.mock('@/core/inngest/clients', () => ({
  inngest: {
    createFunction: jest.fn().mockImplementation((_, __, handler) => {
      return {
        fn: handler,
        id: 'text-to-speech',
      }
    }),
    send: jest.fn().mockResolvedValue({ ids: ['mock-event-id'] }),
  },
}))

jest.mock('@/core/elevenlabs', () => ({
  elevenlabs: {
    generate: jest.fn(),
  },
}))

jest.mock('fs', () => ({
  createWriteStream: jest.fn().mockReturnValue({
    on: jest.fn().mockImplementation(function (event, callback) {
      if (event === 'finish') {
        callback()
      }
      return this
    }),
    pipe: jest.fn(),
  }),
}))

jest.mock('@/core/bot', () => ({
  getBotByName: jest.fn().mockReturnValue({
    bot: {
      telegram: {
        sendMessage: jest.fn().mockResolvedValue({}),
        sendAudio: jest.fn().mockResolvedValue({}),
      },
    },
  }),
}))

jest.mock('@/helpers', () => ({
  errorMessage: jest.fn(),
  errorMessageAdmin: jest.fn(),
}))

jest.mock('@/core/supabase', () => ({
  getUserByTelegramIdString: jest.fn().mockResolvedValue({ level: 1 }),
  updateUserLevelPlusOne: jest.fn().mockResolvedValue({}),
}))

describe('textToSpeechFunction Inngest функция', () => {
  const mockEvent = {
    data: {
      text: 'Тестовый текст для преобразования в речь',
      voice_id: 'test-voice-id',
      telegram_id: '123456789',
      is_ru: true,
      bot_name: 'test_bot',
      username: 'test_user',
    },
  }

  const mockStep = {
    run: jest.fn().mockImplementation((stepName, fn) => {
      if (stepName === 'generate-speech') {
        return {
          success: true,
          audioUrl: '/tmp/test_audio.mp3',
        }
      }
      return fn()
    }),
    sleep: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('должна успешно обрабатывать запрос на преобразование текста в речь', async () => {
    // Настраиваем моки
    const mockAudioStream = {
      pipe: jest.fn(),
    }

    // Мокируем функцию генерации речи
    elevenlabs.generate.mockResolvedValue(mockAudioStream)

    // Извлекаем обработчик из createFunction
    const mockCreateFunction = (inngest.createFunction as jest.Mock).mock
      .calls[0][2]

    // Вызываем обработчик
    const result = await mockCreateFunction({
      event: mockEvent,
      step: mockStep,
    } as any)

    // Проверяем результат
    expect(result).toEqual({
      success: true,
      audioUrl: '/tmp/test_audio.mp3',
    })

    // Проверяем вызов getUserByTelegramIdString
    expect(getUserByTelegramIdString).toHaveBeenCalledWith(
      mockEvent.data.telegram_id
    )

    // Проверяем отправку события payment/process
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'payment/process',
        data: expect.objectContaining({
          telegram_id: mockEvent.data.telegram_id,
          mode: 'TextToSpeech',
        }),
      })
    )

    // Проверяем отправку уведомления пользователю
    expect(
      getBotByName(mockEvent.data.bot_name).bot.telegram.sendMessage
    ).toHaveBeenCalledWith(mockEvent.data.telegram_id, '⏳ Генерация аудио...')

    // Проверяем генерацию речи
    expect(elevenlabs.generate).toHaveBeenCalledWith({
      voice: mockEvent.data.voice_id,
      model_id: 'eleven_turbo_v2_5',
      text: mockEvent.data.text,
    })

    // Проверяем отправку аудио пользователю
    expect(
      getBotByName(mockEvent.data.bot_name).bot.telegram.sendAudio
    ).toHaveBeenCalledWith(
      mockEvent.data.telegram_id,
      { source: '/tmp/test_audio.mp3' },
      expect.any(Object)
    )
  })

  it('должна обрабатывать ошибки при генерации речи', async () => {
    // Настраиваем мок для шага с ошибкой
    const mockStepWithError = {
      ...mockStep,
      run: jest.fn().mockImplementation((stepName, fn) => {
        if (stepName === 'generate-speech') {
          return {
            success: false,
            error: new Error('Ошибка генерации речи'),
          }
        }
        return fn()
      }),
    }

    // Извлекаем обработчик из createFunction
    const mockCreateFunction = (inngest.createFunction as jest.Mock).mock
      .calls[0][2]

    // Вызываем обработчик с ожиданием ошибки
    await expect(
      mockCreateFunction({
        event: mockEvent,
        step: mockStepWithError,
      } as any)
    ).rejects.toThrow('Ошибка генерации речи')

    // Проверяем вызов обработчика ошибок
    expect(errorMessage).toHaveBeenCalled()
    expect(errorMessageAdmin).toHaveBeenCalled()
  })
})
