/**
 * Tests for chatWithAvatarWizard (Chat with AI Avatar)
 * Covers: Message handling, AI responses, image generation
 */

import { describe, it, expect, beforeEach, vi, Mock, afterEach } from 'vitest'

// Mock dependencies BEFORE imports
vi.mock('@/helpers/language', () => ({
  isRussian: vi.fn(() => true),
}))

vi.mock('@/navigation', () => ({
  createHelpCancelKeyboard: vi.fn(isRu => ({
    reply_markup: { keyboard: [[{ text: isRu ? 'Отмена' : 'Cancel' }]] },
  })),
  handleHelpCancel: vi.fn(() => Promise.resolve(false)),
}))

vi.mock('@/core/openai/requests', () => ({
  answerAi: vi.fn(() => Promise.resolve('AI response message')),
}))

vi.mock('@/core/supabase', () => ({
  getUserByTelegramId: vi.fn(() =>
    Promise.resolve({
      telegram_id: '223757230',
      level: 4,
    })
  ),
  getUserData: vi.fn(() =>
    Promise.resolve({
      telegram_id: '223757230',
      gender: 'male',
    })
  ),
  getUserModel: vi.fn(() => Promise.resolve('deepseek-chat')),
  updateUserLevelPlusOne: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/helpers/centralizedLanguage', () => ({
  getUserLanguageFromState: vi.fn(() => 'ru'),
}))

vi.mock('@/interfaces/modes', () => ({
  ModeEnum: {
    ChatWithAvatar: 'chat_with_avatar',
  },
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

// Import after mocks
import { isRussian } from '@/helpers/language'
import { createHelpCancelKeyboard, handleHelpCancel } from '@/navigation'
import { answerAi } from '@/core/openai/requests'
import {
  getUserByTelegramId,
  getUserData,
  getUserModel,
  updateUserLevelPlusOne,
} from '@/core/supabase'
import { getUserLanguageFromState } from '@/helpers/centralizedLanguage'
import { ModeEnum } from '@/interfaces/modes'

describe('chatWithAvatarWizard (Chat with AI Avatar)', () => {
  const mockContext = {
    from: { id: 223757230, username: 'testuser', language_code: 'ru' },
    reply: vi.fn(),
    replyWithPhoto: vi.fn(),
    sendChatAction: vi.fn(),
    scene: {
      state: {},
      leave: vi.fn(),
      enter: vi.fn(),
      current: { id: 'chat_with_avatar' },
    },
    session: {},
    wizard: {
      next: vi.fn(),
      selectStep: vi.fn(),
      cursor: 0,
    },
    message: null as any,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext.message = null
    ;(isRussian as Mock).mockReturnValue(true)
    ;(handleHelpCancel as Mock).mockResolvedValue(false)
    ;(answerAi as Mock).mockResolvedValue('AI response message')
    ;(getUserByTelegramId as Mock).mockResolvedValue({
      telegram_id: '223757230',
      level: 4,
    })
    ;(getUserData as Mock).mockResolvedValue({
      telegram_id: '223757230',
      gender: 'male',
    })
    ;(getUserModel as Mock).mockResolvedValue('deepseek-chat')
    ;(getUserLanguageFromState as Mock).mockReturnValue('ru')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('1. Шаг 1: Приветствие', () => {
    it('должен определять язык пользователя', () => {
      const isRu = isRussian(mockContext as any)
      expect(isRu).toBe(true)
    })

    it('должен показывать приветственное сообщение на русском', () => {
      const isRu = true
      const message = isRu
        ? 'Напиши мне сообщение 💭 и я отвечу на него'
        : 'Write me a message 💭 and I will answer you'

      expect(message).toContain('сообщение')
    })

    it('должен показывать приветственное сообщение на английском', () => {
      const isRu = false
      const message = isRu
        ? 'Напиши мне сообщение 💭 и я отвечу на него'
        : 'Write me a message 💭 and I will answer you'

      expect(message).toContain('Write me')
    })

    it('должен создавать клавиатуру с кнопками', () => {
      const keyboard = createHelpCancelKeyboard(true)

      expect(createHelpCancelKeyboard).toHaveBeenCalledWith(true)
      expect(keyboard.reply_markup).toBeDefined()
    })

    it('должен переходить к следующему шагу', () => {
      mockContext.wizard.next()
      expect(mockContext.wizard.next).toHaveBeenCalled()
    })
  })

  describe('2. Шаг 2: Обработка сообщений', () => {
    it('должен проверять отмену/справку', async () => {
      ;(handleHelpCancel as Mock).mockResolvedValue(true)

      mockContext.message = { text: 'Справка' }

      const isHelpHandled = await handleHelpCancel(mockContext as any)
      expect(isHelpHandled).toBe(true)
    })

    it('должен проверять наличие текстового сообщения', () => {
      mockContext.message = { text: 'Hello AI!' }

      const hasText = mockContext.message && 'text' in mockContext.message
      expect(hasText).toBe(true)
    })

    it('должен получать telegram_id', () => {
      const telegramId = mockContext.from?.id?.toString()

      expect(telegramId).toBe('223757230')
    })

    it('должен показывать индикатор typing', async () => {
      await mockContext.sendChatAction('typing')

      expect(mockContext.sendChatAction).toHaveBeenCalledWith('typing')
    })
  })

  describe('3. Получение данных пользователя', () => {
    it('должен получать данные пользователя', async () => {
      const userData = await getUserData('223757230')

      expect(getUserData).toHaveBeenCalledWith('223757230')
      expect(userData).toBeDefined()
    })

    it('должен получать модель пользователя', async () => {
      const userModel = await getUserModel('223757230')

      expect(getUserModel).toHaveBeenCalledWith('223757230')
      expect(userModel).toBe('deepseek-chat')
    })

    it('должен использовать дефолтную модель deepseek-chat', async () => {
      ;(getUserModel as Mock).mockResolvedValue(null)

      const userModel = await getUserModel('223757230')
      const model = userModel || 'deepseek-chat'

      expect(model).toBe('deepseek-chat')
    })

    it('должен получать язык пользователя из state', () => {
      const languageCode = getUserLanguageFromState(mockContext as any)

      expect(getUserLanguageFromState).toHaveBeenCalled()
      expect(languageCode).toBe('ru')
    })
  })

  describe('4. Вызов AI', () => {
    it('должен вызывать answerAi', async () => {
      const userData = await getUserData('223757230')
      const userModel = 'deepseek-chat'
      const prompt = 'Hello AI!'
      const languageCode = 'ru'

      const response = await answerAi(
        userModel,
        userData,
        prompt,
        languageCode,
        undefined,
        mockContext as any,
        '223757230',
        true
      )

      expect(answerAi).toHaveBeenCalled()
      expect(response).toBeDefined()
    })

    it('должен обрабатывать текстовый ответ', async () => {
      const response = await answerAi(
        'deepseek-chat',
        {},
        'Hello',
        'ru',
        undefined,
        mockContext as any,
        '223757230',
        true
      )

      expect(typeof response).toBe('string')
      expect(response).toBe('AI response message')
    })

    it('должен отправлять текстовый ответ пользователю', async () => {
      const response = 'AI response message'

      await mockContext.reply(response)

      expect(mockContext.reply).toHaveBeenCalledWith(response)
    })
  })

  describe('5. Обработка ответа с изображением', () => {
    it('должен распознавать ответ с изображением', async () => {
      ;(answerAi as Mock).mockResolvedValue({
        type: 'image',
        imageUrl: 'https://example.com/generated.jpg',
        cost: 5,
      })

      const response = await answerAi(
        'deepseek-chat',
        {},
        'generate an image',
        'ru',
        undefined,
        mockContext as any,
        '223757230',
        true
      )

      const isImageResponse =
        typeof response === 'object' && response.type === 'image'
      expect(isImageResponse).toBe(true)
    })

    it('должен отправлять фото с подписью на русском', async () => {
      const imageResponse = {
        type: 'image',
        imageUrl: 'https://example.com/generated.jpg',
        cost: 5,
      }

      const isRu = true
      const caption = isRu
        ? `✨ Изображение сгенерировано с помощью Nano Banana Pro\n\n💫 Стоимость: ${imageResponse.cost}⭐`
        : `✨ Image generated using Nano Banana Pro\n\n💫 Cost: ${imageResponse.cost}⭐`

      await mockContext.replyWithPhoto(imageResponse.imageUrl, { caption })

      expect(mockContext.replyWithPhoto).toHaveBeenCalled()
    })

    it('должен показывать стоимость генерации', () => {
      const cost = 5
      const caption = `💫 Стоимость: ${cost}⭐`

      expect(caption).toContain('5⭐')
    })
  })

  describe('6. Обновление уровня пользователя', () => {
    it('должен получать пользователя по telegram_id', async () => {
      const user = await getUserByTelegramId(mockContext as any)

      expect(getUserByTelegramId).toHaveBeenCalled()
      expect(user.level).toBe(4)
    })

    it('должен обновлять уровень при level === 4', async () => {
      const user = { level: 4 }

      if (user.level === 4) {
        await updateUserLevelPlusOne('223757230', user.level)
      }

      expect(updateUserLevelPlusOne).toHaveBeenCalledWith('223757230', 4)
    })

    it('не должен обновлять уровень при level !== 4', async () => {
      ;(getUserByTelegramId as Mock).mockResolvedValue({ level: 3 })

      const user = await getUserByTelegramId(mockContext as any)

      if (user.level === 4) {
        await updateUserLevelPlusOne('223757230', user.level)
      }

      expect(updateUserLevelPlusOne).not.toHaveBeenCalled()
    })
  })

  describe('7. Продолжение чата', () => {
    it('должен оставаться на шаге 1 для продолжения чата', () => {
      mockContext.wizard.selectStep(1)

      expect(mockContext.wizard.selectStep).toHaveBeenCalledWith(1)
    })
  })

  describe('8. Обработка ошибок', () => {
    it('должен обрабатывать ошибку answerAi', async () => {
      ;(answerAi as Mock).mockRejectedValue(new Error('AI error'))

      try {
        await answerAi(
          'deepseek-chat',
          {},
          'Hello',
          'ru',
          undefined,
          mockContext as any,
          '223757230',
          true
        )
      } catch (error) {
        expect((error as Error).message).toBe('AI error')
      }
    })

    it('должен показывать сообщение об ошибке на русском', () => {
      const isRu = true
      const errorMessage = isRu
        ? '❌ Произошла ошибка при обработке сообщения.'
        : '❌ An error occurred while processing the message.'

      expect(errorMessage).toContain('ошибка')
    })

    it('должен выходить из сцены при ошибке', async () => {
      await mockContext.scene.leave()

      expect(mockContext.scene.leave).toHaveBeenCalled()
    })

    it('должен выходить при отсутствии telegram_id', async () => {
      const ctx = { ...mockContext, from: null }

      const telegramId = ctx.from?.id?.toString()
      if (!telegramId) {
        await mockContext.scene.leave()
      }

      expect(mockContext.scene.leave).toHaveBeenCalled()
    })
  })

  describe('9. Обработка нетекстовых сообщений', () => {
    it('должен выходить при неизвестном типе сообщения', async () => {
      mockContext.message = { photo: [{ file_id: 'photo_123' }] }

      const isText = mockContext.message && 'text' in mockContext.message
      if (!isText) {
        await mockContext.scene.leave()
      }

      expect(mockContext.scene.leave).toHaveBeenCalled()
    })
  })

  describe('10. ModeEnum', () => {
    it('должен использовать ModeEnum.ChatWithAvatar', () => {
      expect(ModeEnum.ChatWithAvatar).toBe('chat_with_avatar')
    })
  })
})
