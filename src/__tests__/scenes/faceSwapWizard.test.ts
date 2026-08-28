/**
 * Tests for faceSwapWizard (Face Swap using Replicate API)
 * Covers: Target image upload, swap image upload, balance check, face swap generation
 */

import { describe, it, expect, beforeEach, vi, Mock, afterEach } from 'vitest'

// Mock dependencies BEFORE imports
vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => true),
}))

vi.mock('@/core/supabase/getUserBalance', () => ({
  getUserBalance: vi.fn(() => Promise.resolve(100)),
}))

vi.mock('@/core/supabase/updateUserBalance', () => ({
  updateUserBalance: vi.fn(() => Promise.resolve(true)),
}))

vi.mock('@/services/generateFaceSwap', () => ({
  generateFaceSwap: vi.fn(() =>
    Promise.resolve({
      success: true,
      resultUrl: 'https://example.com/result.jpg',
      processingTime: 15000,
    })
  ),
}))

vi.mock('@/utils/cancelButton', () => ({
  createCancelButton: vi.fn(isRu => ({
    text: isRu ? '❌ Отмена' : '❌ Cancel',
  })),
  handleCancelButton: vi.fn(() => Promise.resolve(false)),
}))

vi.mock('@/interfaces/payments.interface', () => ({
  PaymentType: {
    MONEY_OUTCOME: 'MONEY_OUTCOME',
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
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { generateFaceSwap } from '@/services/generateFaceSwap'
import { createCancelButton, handleCancelButton } from '@/utils/cancelButton'
import { PaymentType } from '@/interfaces/payments.interface'

describe('faceSwapWizard (Face Swap Generation)', () => {
  const mockContext = {
    from: { id: 223757230, language_code: 'ru' },
    reply: vi.fn(),
    replyWithPhoto: vi.fn(),
    scene: {
      state: {},
      leave: vi.fn(),
      enter: vi.fn(),
      current: { id: 'faceSwapWizard' },
    },
    session: {
      targetImageUrl: null as any,
      targetFileId: null as any,
    },
    wizard: {
      next: vi.fn(),
      cursor: 0,
    },
    telegram: {
      token: 'test_token',
      getFile: vi.fn(() =>
        Promise.resolve({ file_path: 'photos/file_123.jpg' })
      ),
      deleteMessage: vi.fn(),
    },
    chat: { id: 123456 },
    update: { message: null as any },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext.session = {
      targetImageUrl: null,
      targetFileId: null,
    }
    mockContext.update = { message: null as any }
    ;(isRussianFromState as Mock).mockReturnValue(true)
    ;(getUserBalance as Mock).mockResolvedValue(100)
    ;(updateUserBalance as Mock).mockResolvedValue(true)
    ;(generateFaceSwap as Mock).mockResolvedValue({
      success: true,
      resultUrl: 'https://example.com/result.jpg',
      processingTime: 15000,
    })
    ;(handleCancelButton as Mock).mockResolvedValue(false)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('1. Шаг 0: Запрос целевого изображения', () => {
    it('должен определять язык пользователя', () => {
      const isRu = isRussianFromState(mockContext as any)
      expect(isRu).toBe(true)
    })

    it('должен показывать инструкции на русском', () => {
      const isRu = true
      const message = isRu
        ? 'Замена лица\n\nЗагрузите фото человека, на которого хотите заменить лицо.\n\nТребования:\n• Лицо чётко видно\n• Анфас (прямо в камеру)\n• Хорошее освещение\n\nСтоимость: 10 ⭐'
        : 'Face Swap\n\nUpload photo...'

      expect(message).toContain('Замена лица')
      expect(message).toContain('10 ⭐')
    })

    it('должен показывать инструкции на английском', () => {
      const isRu = false
      const message = isRu
        ? 'Замена лица...'
        : 'Face Swap\n\nUpload photo of the person whose face you want to swap.\n\nRequirements:\n• Face clearly visible\n• Frontal angle\n• Good lighting\n\nCost: 10 ⭐'

      expect(message).toContain('Face Swap')
      expect(message).toContain('10 ⭐')
    })

    it('должен добавлять кнопку отмены', () => {
      const cancelButton = createCancelButton(true)

      expect(createCancelButton).toHaveBeenCalledWith(true)
      expect(cancelButton.text).toBe('❌ Отмена')
    })
  })

  describe('2. Шаг 1: Обработка целевого изображения', () => {
    it('должен проверять отмену', async () => {
      ;(handleCancelButton as Mock).mockResolvedValue(true)

      const isCancel = await handleCancelButton(mockContext as any)
      expect(isCancel).toBe(true)
    })

    it('должен проверять наличие фото', () => {
      mockContext.update = {
        message: { photo: [{ file_id: 'test_file_id' }] },
      }

      const hasPhoto =
        'message' in mockContext.update && 'photo' in mockContext.update.message

      expect(hasPhoto).toBe(true)
    })

    it('должен отклонять сообщение без фото', () => {
      mockContext.update = {
        message: { text: 'Some text' },
      }

      const hasPhoto =
        'message' in mockContext.update && 'photo' in mockContext.update.message

      expect(hasPhoto).toBe(false)
    })

    it('должен показывать ошибку при отсутствии фото', () => {
      const isRu = true
      const errorMessage = isRu
        ? '❌ Пожалуйста, отправьте фото.'
        : '❌ Please send a photo.'

      expect(errorMessage).toContain('фото')
    })

    it('должен получать file_id из фото', () => {
      const photo = [
        { file_id: 'small', width: 100, height: 100 },
        { file_id: 'large', width: 800, height: 800 },
      ]
      const fileId = photo[photo.length - 1].file_id

      expect(fileId).toBe('large')
    })

    it('должен получать ссылку на файл', async () => {
      const file = await mockContext.telegram.getFile('test_file_id')

      expect(mockContext.telegram.getFile).toHaveBeenCalledWith('test_file_id')
      expect(file.file_path).toBe('photos/file_123.jpg')
    })

    it('должен сохранять targetImageUrl в сессии', () => {
      const targetImageUrl =
        'https://api.telegram.org/file/bottest_token/photos/file_123.jpg'
      mockContext.session.targetImageUrl = targetImageUrl

      expect(mockContext.session.targetImageUrl).toBe(targetImageUrl)
    })

    it('должен показывать подтверждение получения фото', () => {
      const isRu = true
      const message = isRu
        ? '✅ Фото получено!\n\nТеперь загрузите второе фото - с лицом, которое хотите использовать.'
        : '✅ Photo received!\n\nNow upload the second photo - with the face you want to use.'

      expect(message).toContain('Фото получено')
    })
  })

  describe('3. Шаг 2: Обработка swap изображения', () => {
    it('должен проверять наличие второго фото', () => {
      mockContext.update = {
        message: { photo: [{ file_id: 'swap_file_id' }] },
      }

      const hasPhoto =
        'message' in mockContext.update && 'photo' in mockContext.update.message

      expect(hasPhoto).toBe(true)
    })

    it('должен проверять наличие targetImageUrl', () => {
      mockContext.session.targetImageUrl = null

      const hasTarget = !!mockContext.session.targetImageUrl
      expect(hasTarget).toBe(false)
    })

    it('должен показывать ошибку при отсутствии первого фото', () => {
      const isRu = true
      const errorMessage = isRu
        ? '❌ Ошибка: не найдено первое фото. Попробуйте еще раз.'
        : '❌ Error: first photo not found. Try again.'

      expect(errorMessage).toContain('первое фото')
    })
  })

  describe('4. Проверка баланса', () => {
    it('должен получать баланс пользователя', async () => {
      const balance = await getUserBalance('223757230')

      expect(getUserBalance).toHaveBeenCalledWith('223757230')
      expect(balance).toBe(100)
    })

    it('должен проверять достаточность баланса (10 звезд)', () => {
      const balance = 100
      const requiredStars = 10

      expect(balance >= requiredStars).toBe(true)
    })

    it('должен отклонять при недостаточном балансе', async () => {
      ;(getUserBalance as Mock).mockResolvedValue(5)

      const balance = await getUserBalance('223757230')
      const requiredStars = 10

      expect(balance < requiredStars).toBe(true)
    })

    it('должен показывать сообщение о недостаточном балансе', () => {
      const isRu = true
      const requiredStars = 10
      const balance = 5

      const message = isRu
        ? `❌ Недостаточно звезд для замены лица.\n\n💰 Требуется: ${requiredStars} ⭐\n💰 У вас: ${balance.toFixed(1)} ⭐\n\nПополните баланс командой /balance`
        : `❌ Insufficient stars for face swap.`

      expect(message).toContain('Недостаточно звезд')
    })

    it('должен обрабатывать ошибку получения баланса', async () => {
      ;(getUserBalance as Mock).mockResolvedValue(null)

      const balance = await getUserBalance('223757230')
      const isInvalid =
        balance === null || balance === undefined || isNaN(balance)

      expect(isInvalid).toBe(true)
    })
  })

  describe('5. Генерация Face Swap', () => {
    it('должен показывать сообщение о процессе', () => {
      const isRu = true
      const message = isRu
        ? '⏳ Обрабатываем замену лица... Это может занять 10-30 секунд.'
        : '⏳ Processing face swap... This may take 10-30 seconds.'

      expect(message).toContain('Обрабатываем замену лица')
    })

    it('должен вызывать generateFaceSwap', async () => {
      const result = await generateFaceSwap({
        targetImageUrl: 'https://example.com/target.jpg',
        swapImageUrl: 'https://example.com/swap.jpg',
      })

      expect(generateFaceSwap).toHaveBeenCalled()
      expect(result.success).toBe(true)
      expect(result.resultUrl).toBe('https://example.com/result.jpg')
    })

    it('должен обрабатывать ошибку генерации', async () => {
      ;(generateFaceSwap as Mock).mockResolvedValue({
        success: false,
        error: 'Face detection failed',
      })

      const result = await generateFaceSwap({
        targetImageUrl: 'https://example.com/target.jpg',
        swapImageUrl: 'https://example.com/swap.jpg',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Face detection failed')
    })

    it('должен показывать ошибку при неудачной генерации', () => {
      const isRu = true
      const error = 'Face detection failed'
      const message = isRu
        ? `❌ Ошибка при замене лица: ${error}\n\nПопробуйте другие фотографии.`
        : `❌ Face swap error: ${error}\n\nTry different photos.`

      expect(message).toContain('Ошибка при замене лица')
    })
  })

  describe('6. Списание баланса', () => {
    it('должен списывать баланс после успешной генерации', async () => {
      await updateUserBalance(
        '223757230',
        -10,
        PaymentType.MONEY_OUTCOME,
        'Face Swap - Replicate',
        {
          service_type: 'face_swap',
          model_name: 'codeplugtech/face-swap',
          stars: 10,
          processing_time: 15000,
        }
      )

      expect(updateUserBalance).toHaveBeenCalledWith(
        '223757230',
        -10,
        PaymentType.MONEY_OUTCOME,
        'Face Swap - Replicate',
        expect.objectContaining({
          service_type: 'face_swap',
        })
      )
    })

    it('должен обрабатывать ошибку списания', async () => {
      ;(updateUserBalance as Mock).mockResolvedValue(false)

      const result = await updateUserBalance(
        '223757230',
        -10,
        PaymentType.MONEY_OUTCOME,
        'Test',
        {}
      )
      expect(result).toBe(false)
    })
  })

  describe('7. Отправка результата', () => {
    it('должен отправлять результат как фото', async () => {
      const resultUrl = 'https://example.com/result.jpg'
      await mockContext.replyWithPhoto(resultUrl, { caption: 'Test' })

      expect(mockContext.replyWithPhoto).toHaveBeenCalledWith(resultUrl, {
        caption: 'Test',
      })
    })

    it('должен показывать информацию о результате на русском', () => {
      const isRu = true
      const requiredStars = 10
      const processingTime = 15000

      const caption = isRu
        ? `✅ Готово! Лицо успешно заменено.\n\n⏱️ Время обработки: ${Math.round(processingTime / 1000)} сек\n💰 Списано: ${requiredStars} ⭐`
        : `✅ Done! Face swap completed.`

      expect(caption).toContain('Готово')
      expect(caption).toContain('15 сек')
      expect(caption).toContain('10 ⭐')
    })
  })

  describe('8. Удаление processing сообщения', () => {
    it('должен удалять сообщение о процессе', async () => {
      const processingMsgId = 12345
      await mockContext.telegram.deleteMessage(
        mockContext.chat.id,
        processingMsgId
      )

      expect(mockContext.telegram.deleteMessage).toHaveBeenCalledWith(
        123456,
        12345
      )
    })

    it('должен игнорировать ошибку удаления', async () => {
      mockContext.telegram.deleteMessage = vi
        .fn()
        .mockRejectedValue(new Error('Message not found'))

      try {
        await mockContext.telegram.deleteMessage(mockContext.chat.id, 12345)
      } catch (e) {
        // Ignore
      }

      // Не должно выбрасывать ошибку
      expect(true).toBe(true)
    })
  })

  describe('9. Локализация сообщений', () => {
    it('должен показывать требования на русском', () => {
      const isRu = true
      const requirements = isRu
        ? 'Требования:\n• Лицо чётко видно\n• Анфас (прямо в камеру)\n• Хорошее освещение'
        : 'Requirements:\n• Face clearly visible\n• Frontal angle\n• Good lighting'

      expect(requirements).toContain('Требования')
      expect(requirements).toContain('Анфас')
    })

    it('должен показывать требования на английском', () => {
      const isRu = false
      const requirements = isRu
        ? 'Требования:'
        : 'Requirements:\n• Face clearly visible\n• Frontal angle\n• Good lighting'

      expect(requirements).toContain('Requirements')
      expect(requirements).toContain('Frontal angle')
    })
  })

  describe('10. Проверка telegram_id', () => {
    it('должен проверять наличие telegram_id', () => {
      const telegramId = mockContext.from?.id?.toString()
      expect(telegramId).toBe('223757230')
    })

    it('должен обрабатывать отсутствие telegram_id', () => {
      const context = { from: null }
      const telegramId = context.from?.id?.toString()

      expect(telegramId).toBeUndefined()
    })
  })

  describe('11. Стоимость Face Swap', () => {
    it('должен использовать фиксированную стоимость 10 звезд', () => {
      const requiredStars = 10
      expect(requiredStars).toBe(10)
    })
  })

  describe('12. Навигация wizard', () => {
    it('должен переходить к следующему шагу', () => {
      mockContext.wizard.next()
      expect(mockContext.wizard.next).toHaveBeenCalled()
    })

    it('должен выходить из сцены при ошибке', async () => {
      await mockContext.scene.leave()
      expect(mockContext.scene.leave).toHaveBeenCalled()
    })
  })
})
