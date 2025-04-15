import { mockBot } from '@/test-utils/mocks/mockBot'
import mockApi from '@/test-utils/core/mock'

/**
 * Инициализирует мок-бот для тестирования
 */
export function initMockBot(): void {
  // Сбрасываем предыдущие моки
  for (const method in mockBot.telegram) {
    if ((mockBot.telegram as any)[method]?.mock) {
      ;(mockBot.telegram as any)[method].mockReset()
    }
  }

  // Устанавливаем базовые мок-методы для telegram
  if (!(mockBot.telegram.sendMessage as any)?.mock) {
    mockBot.telegram.sendMessage = mockApi.create() as any
  }

  if (!(mockBot.telegram.sendPhoto as any)?.mock) {
    mockBot.telegram.sendPhoto = mockApi.create() as any
  }

  if (!(mockBot.telegram.sendVideo as any)?.mock) {
    mockBot.telegram.sendVideo = mockApi.create() as any
  }

  if (!(mockBot.telegram.sendDocument as any)?.mock) {
    mockBot.telegram.sendDocument = mockApi.create() as any
  }

  if (!(mockBot.telegram.sendAudio as any)?.mock) {
    mockBot.telegram.sendAudio = mockApi.create() as any
  }

  if (!(mockBot.telegram.answerCbQuery as any)?.mock) {
    mockBot.telegram.answerCbQuery = mockApi.create() as any
  }

  if (!(mockBot.telegram.deleteMessage as any)?.mock) {
    mockBot.telegram.deleteMessage = mockApi.create() as any
  }

  if (!(mockBot.telegram.editMessageText as any)?.mock) {
    mockBot.telegram.editMessageText = mockApi.create() as any
  }

  if (!(mockBot.telegram.editMessageReplyMarkup as any)?.mock) {
    mockBot.telegram.editMessageReplyMarkup = mockApi.create() as any
  }
}
