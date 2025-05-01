import {
  describe,
  it,
  expect,
  mock,
  beforeEach,
  afterEach,
  spyOn,
} from 'bun:test'
import { NotificationService } from '@/services/plan_b/notification.service'
import * as botHelpers from '@/core/bot'
import { BotName } from '@/interfaces'

// Создаем мок-функции отдельно
const mockSendMessage = mock(() => Promise.resolve({} as any)) // Мок sendMessage
const mockGetBotByName = mock(() =>
  Promise.resolve({ bot: mockTelegrafInstance })
) // Мок getBotByName

const mockTelegrafInstance = {
  telegram: {
    sendMessage: mockSendMessage,
  },
}

// Мокируем модуль botHelpers, используя созданные мок-функции
mock.module('@/core/bot', () => ({
  getBotByName: mockGetBotByName,
}))

describe('NotificationService', () => {
  let notificationService: NotificationService
  // Убираем getBotByNameMock, так как теперь мокируем напрямую
  // let getBotByNameMock: ReturnType<typeof spyOn>

  const mockTelegramId = '123456'
  const mockBotName: BotName = 'ai_koshey_bot'
  const mockErrorMessage = 'Something went wrong during training.'

  beforeEach(() => {
    notificationService = new NotificationService()
    // Сбрасываем счетчики и вызовы моков
    mockSendMessage.mockClear()
    mockGetBotByName.mockClear()

    // Перенастраиваем getBotByName на всякий случай
    mockGetBotByName.mockResolvedValue({ bot: mockTelegrafInstance })
  })

  afterEach(() => {
    mock.restore()
  })

  describe('sendTrainingError', () => {
    it('should call getBotByName and sendMessage with correct parameters', async () => {
      await notificationService.sendTrainingError(
        mockTelegramId,
        mockBotName,
        mockErrorMessage
      )

      expect(mockGetBotByName).toHaveBeenCalledTimes(1) // Используем прямой мок
      expect(mockGetBotByName).toHaveBeenCalledWith(mockBotName)

      expect(mockSendMessage).toHaveBeenCalledTimes(1)
      expect(mockSendMessage).toHaveBeenCalledWith(
        mockTelegramId,
        expect.stringContaining(mockErrorMessage),
        { parse_mode: 'Markdown' }
      )
    })

    it('should truncate the error message if truncateError is true', async () => {
      const longErrorMessage = 'a'.repeat(2500)
      const truncatedMessagePart = 'a'.repeat(2000)

      await notificationService.sendTrainingError(
        mockTelegramId,
        mockBotName,
        longErrorMessage,
        { truncateError: true, maxLength: 2000 }
      )

      expect(mockSendMessage).toHaveBeenCalledTimes(1)
      expect(mockSendMessage).toHaveBeenCalledWith(
        mockTelegramId,
        expect.stringContaining(`${truncatedMessagePart}...`), // Проверяем усеченное сообщение
        { parse_mode: 'Markdown' }
      )
    })

    it('should not send message if telegramId is undefined', async () => {
      await notificationService.sendTrainingError(
        undefined,
        mockBotName,
        mockErrorMessage
      )
      expect(mockGetBotByName).not.toHaveBeenCalled() // Используем прямой мок
      expect(mockSendMessage).not.toHaveBeenCalled()
    })

    it('should handle errors during bot instance retrieval', async () => {
      const error = new Error('Bot not found')
      mockGetBotByName.mockRejectedValue(error) // Используем прямой мок
      const consoleErrorSpy = spyOn(console, 'error')

      await notificationService.sendTrainingError(
        mockTelegramId,
        mockBotName,
        mockErrorMessage
      )

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '💥 Ошибка отправки уведомления:',
        { telegramId: mockTelegramId, error: error.message }
      )
      expect(mockSendMessage).not.toHaveBeenCalled()
      consoleErrorSpy.mockRestore()
    })

    it('should handle errors during sendMessage', async () => {
      const error = new Error('Telegram send error')
      mockSendMessage.mockRejectedValue(error)
      const consoleErrorSpy = spyOn(console, 'error')

      await notificationService.sendTrainingError(
        mockTelegramId,
        mockBotName,
        mockErrorMessage
      )

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '💥 Ошибка отправки уведомления:',
        { telegramId: mockTelegramId, error: error.message }
      )
      consoleErrorSpy.mockRestore()
    })
  })

  describe('sendSuccessNotification', () => {
    it('should call getBotByName and sendMessage with correct parameters (RU)', async () => {
      await notificationService.sendSuccessNotification(
        mockTelegramId,
        mockBotName,
        true // is_ru = true
      )

      expect(mockGetBotByName).toHaveBeenCalledTimes(1) // Используем прямой мок
      expect(mockGetBotByName).toHaveBeenCalledWith(mockBotName)

      expect(mockSendMessage).toHaveBeenCalledTimes(1)
      expect(mockSendMessage).toHaveBeenCalledWith(
        mockTelegramId,
        expect.stringContaining('🎉 Обучение завершено! 🎉'),
        { parse_mode: 'Markdown' }
      )
    })

    it('should call getBotByName and sendMessage with correct parameters (EN)', async () => {
      await notificationService.sendSuccessNotification(
        mockTelegramId,
        mockBotName,
        false // is_ru = false
      )

      expect(mockGetBotByName).toHaveBeenCalledTimes(1) // Используем прямой мок
      expect(mockGetBotByName).toHaveBeenCalledWith(mockBotName)

      expect(mockSendMessage).toHaveBeenCalledTimes(1)
      expect(mockSendMessage).toHaveBeenCalledWith(
        mockTelegramId,
        expect.stringContaining('🎉 Training completed! 🎉'),
        { parse_mode: 'Markdown' }
      )
    })

    it('should handle errors during bot instance retrieval', async () => {
      const error = new Error('Bot not found')
      mockGetBotByName.mockRejectedValue(error) // Используем прямой мок
      const consoleErrorSpy = spyOn(console, 'error')

      await notificationService.sendSuccessNotification(
        mockTelegramId,
        mockBotName,
        true
      )

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Ошибка отправки успешного уведомления:',
        error
      )
      expect(mockSendMessage).not.toHaveBeenCalled()
      consoleErrorSpy.mockRestore()
    })

    it('should handle errors during sendMessage', async () => {
      const error = new Error('Telegram send error')
      mockSendMessage.mockRejectedValue(error)
      const consoleErrorSpy = spyOn(console, 'error')

      await notificationService.sendSuccessNotification(
        mockTelegramId,
        mockBotName,
        true
      )

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Ошибка отправки успешного уведомления:',
        error
      )
      consoleErrorSpy.mockRestore()
    })
  })
})
