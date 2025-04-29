import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  mock,
  spyOn,
} from 'bun:test'

// Удаляем моки модулей os и path
// mock.module('os', () => ({ tmpdir: () => '/mock/tmp' }));
// mock.module('path', () => {
//   const actualPath = require('path');
//   return { ...actualPath, join: (...args: string[]) => args.join('/') };
// });

import { generateSpeech } from '@/services/plan_b/generateSpeech'
import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'
import { Telegraf } from 'telegraf'
import { elevenlabs } from '@/core/elevenlabs' // Для мокирования
import * as supabaseCore from '@/core/supabase' // Для мокирования функций supabase
import * as errorHelper from '@/helpers/error' // Для мокирования хелперов ошибок
import * as priceCalculator from '@/price/calculator' // Для мокирования калькулятора
import * as balanceHelper from '@/price/helpers' // Для мокирования processBalanceOperation
import { createWriteStream } from 'fs' // Для мокирования
import os from 'os' // Импортируем реальный os
import path from 'path' // Импортируем реальный path
import { Readable } from 'stream' // <-- Импортируем Readable из Node.js stream

// --- Mocks --- //

// Mock Supabase functions
const mockGetUserByTelegramIdString = mock(() =>
  Promise.resolve({ id: 'user-db-id', telegram_id: '12345', level: 1 })
)
const mockUpdateUserLevelPlusOne = mock(() =>
  Promise.resolve({ data: null, error: null })
)
mock.module('@/core/supabase', () => ({
  ...supabaseCore,
  getUserByTelegramIdString: mockGetUserByTelegramIdString,
  updateUserLevelPlusOne: mockUpdateUserLevelPlusOne,
}))

// Mock Price Calculator
const mockCalculateFinalStarPrice = mock(() => ({
  stars: 3,
  rubles: 30,
  dollars: 0.3,
}))
mock.module('@/price/calculator', () => ({
  ...priceCalculator,
  calculateFinalStarPrice: mockCalculateFinalStarPrice,
}))

// Mock Balance Operation
const mockProcessBalanceOperation = mock(() =>
  Promise.resolve({ success: true, newBalance: 97 })
)
mock.module('@/price/helpers', () => ({
  ...balanceHelper,
  processBalanceOperation: mockProcessBalanceOperation,
}))

// Mock Error Helpers
const mockSendServiceErrorToUser = mock(() => Promise.resolve())
const mockSendServiceErrorToAdmin = mock(() => Promise.resolve())
mock.module('@/helpers/error', () => ({
  ...errorHelper,
  sendServiceErrorToUser: mockSendServiceErrorToUser,
  sendServiceErrorToAdmin: mockSendServiceErrorToAdmin,
}))

// Mock ElevenLabs - исправлено для возврата Node.js Readable stream
const mockElevenlabsGenerate = mock(() => {
  const stream = new Readable({
    read() {},
  })
  stream.push(Buffer.from('mock audio data'))
  stream.push(null) // Сигнализируем конец потока
  return stream // Возвращаем поток Node.js
})
mock.module('@/core/elevenlabs', () => ({
  elevenlabs: {
    generate: mockElevenlabsGenerate,
  },
}))

// Mock fs.createWriteStream and stream events
const mockWriteStream = {
  pipe: mock(),
  on: mock((event: string, callback: (...args: any[]) => void) => {
    if (event === 'finish') {
      // Вызываем колбэк синхронно (или process.nextTick, если нужно отложить на 1 тик)
      callback()
    } else if (event === 'error') {
      // Не вызываем ошибку по умолчанию
    }
    return mockWriteStream // Для чейнинга
  }),
  once: mock((event: string, callback: (...args: any[]) => void) => {
    mockWriteStream.on(event, callback)
    return mockWriteStream
  }),
  end: mock(),
  write: mock(),
  // Добавляем мок для .emit()
  emit: mock((event: string, ...args: any[]) => {
    // console.log(`Mock writeStream emitting: ${event}`);
    return true // Стандартное поведение для emit
  }),
  // Добавляем мок для .removeListener()
  removeListener: mock((event: string, callback: (...args: any[]) => void) => {
    // Просто заглушка
    return mockWriteStream
  }),
}
// Изменяем мок, чтобы он логировал полученный путь
const mockCreateWriteStream = mock((actualPath: string) => {
  console.log('[TEST RUN] mockCreateWriteStream called with:', actualPath)
  return mockWriteStream
})
mock.module('fs', () => ({
  createWriteStream: mockCreateWriteStream,
}))

// Mock Telegraf
const mockSendMessage = mock(() => Promise.resolve({ message_id: 1 }))
const mockSendAudio = mock(() => Promise.resolve({ message_id: 2 }))
const mockBot = {
  telegram: {
    sendMessage: mockSendMessage,
    sendAudio: mockSendAudio,
  },
  botInfo: {
    username: 'test_bot',
  },
} as unknown as Telegraf<MyContext>

// --- Tests --- //

describe('Plan B: generateSpeech Service', () => {
  let mockContext: MyContext

  beforeEach(() => {
    // Удаляем spyOn
    // spyOn(os, 'tmpdir').mockReturnValue('/mock/tmp');

    // Reset mocks
    mockGetUserByTelegramIdString
      .mockClear()
      .mockResolvedValue({ id: 'user-db-id', telegram_id: '12345', level: 1 })
    mockUpdateUserLevelPlusOne.mockClear()
    mockCalculateFinalStarPrice
      .mockClear()
      .mockReturnValue({ stars: 3, rubles: 30, dollars: 0.3 })
    mockProcessBalanceOperation
      .mockClear()
      .mockResolvedValue({ success: true, newBalance: 97 })
    mockSendServiceErrorToUser.mockClear()
    mockSendServiceErrorToAdmin.mockClear()
    mockElevenlabsGenerate.mockClear().mockImplementation(() => {
      const stream = new Readable({
        read() {},
      })
      stream.push(Buffer.from('mock audio data'))
      stream.push(null)
      return stream
    })
    mockCreateWriteStream
      .mockClear()
      .mockImplementation((actualPath: string) => {
        console.log(
          '[TEST beforeEach] mockCreateWriteStream called with:',
          actualPath
        )
        return mockWriteStream
      })
    mockWriteStream.on.mockClear()
    mockWriteStream.pipe.mockClear()
    mockWriteStream.once.mockClear()
    mockWriteStream.emit.mockClear()
    mockWriteStream.removeListener.mockClear()
    mockSendMessage.mockClear().mockResolvedValue({ message_id: 1 })
    mockSendAudio.mockClear().mockResolvedValue({ message_id: 2 })

    // Create a basic mock context for each test
    mockContext = {
      from: { id: 12345, language_code: 'en', username: 'testuser' },
      session: { mode: ModeEnum.TextToSpeech },
      telegram: mockBot.telegram,
      botInfo: mockBot.botInfo,
      // Добавьте другие необходимые свойства ctx, если они используются в generateSpeech
      // Например, reply, scene и т.д., если они нужны для processBalanceOperation или других вызовов
      reply: mock(),
      scene: {
        enter: mock(),
        leave: mock(),
        reenter: mock(),
      },
    } as unknown as MyContext
  })

  afterEach(() => {
    // Убедимся, что mock.restore() вызывается для очистки шпионов
    mock.restore()
  })

  it('should successfully generate speech, save file, and send audio', async () => {
    // Arrange
    const params = {
      text: 'Hello world',
      voice_id: 'voice123',
      telegram_id: '12345',
      is_ru: false,
      bot: mockBot,
      bot_name: 'test_bot',
      ctx: mockContext,
    }
    const expectedAudioPath = '/mock/tmp/audio_*.mp3' // Используем шаблон для Date.now()
    const expectedCost = 3
    const expectedBalanceAfter = 97

    // Act
    const result = await generateSpeech(params)

    // Assert
    // 1. User check
    expect(mockGetUserByTelegramIdString).toHaveBeenCalledWith(
      params.telegram_id
    )

    // 2. Cost calculation
    expect(mockCalculateFinalStarPrice).toHaveBeenCalledWith(
      ModeEnum.TextToSpeech
    )

    // 3. Balance check
    expect(mockProcessBalanceOperation).toHaveBeenCalledWith({
      ctx: params.ctx,
      telegram_id: Number(params.telegram_id),
      paymentAmount: expectedCost,
      is_ru: params.is_ru,
    })

    // 4. ElevenLabs call
    expect(mockElevenlabsGenerate).toHaveBeenCalledWith({
      voice: params.voice_id,
      model_id: 'eleven_turbo_v2_5',
      text: params.text,
    })

    // 5. File writing
    expect(mockCreateWriteStream).toHaveBeenCalledTimes(1)
    expect(mockCreateWriteStream).toHaveBeenCalledWith(
      expect.stringMatching(/audio_\d+\.mp3$/)
    )
    expect(mockWriteStream.on).toHaveBeenCalledWith(
      'finish',
      expect.any(Function)
    )
    expect(mockWriteStream.on).toHaveBeenCalledWith(
      'error',
      expect.any(Function)
    )

    // 6. Telegraf messages
    expect(mockSendMessage).toHaveBeenCalledTimes(2) // Статус + Баланс
    expect(mockSendMessage).toHaveBeenNthCalledWith(
      1,
      params.telegram_id,
      '⏳ Generating audio...'
    )
    expect(mockSendMessage).toHaveBeenNthCalledWith(
      2,
      params.telegram_id,
      `Cost: ${expectedCost.toFixed(2)} ⭐️\nYour balance: ${expectedBalanceAfter.toFixed(2)} ⭐️`
    )
    expect(mockSendAudio).toHaveBeenCalledTimes(1)
    expect(mockSendAudio).toHaveBeenCalledWith(
      params.telegram_id,
      { source: expect.stringMatching(/audio_\d+\.mp3$/) },
      expect.any(Object)
    )

    // 7. Result
    expect(result.audioUrl).toMatch(/audio_\d+\.mp3$/)

    // 8. No errors
    expect(mockSendServiceErrorToUser).not.toHaveBeenCalled()
    expect(mockSendServiceErrorToAdmin).not.toHaveBeenCalled()

    // 9. Level update check (не должен вызываться, т.к. level=1)
    expect(mockUpdateUserLevelPlusOne).not.toHaveBeenCalled()
  })

  // --- Add more tests for other scenarios --- //
  // - User not found
  // - Insufficient balance (mockProcessBalanceOperation returns success: false)
  // - ElevenLabs API key missing
  // - ElevenLabs generate error
  // - File write error (mockWriteStream.on('error', ...))
  // - Telegraf send error (mockSendMessage/mockSendAudio throws)
  // - Level update (user.level === 7)
})
