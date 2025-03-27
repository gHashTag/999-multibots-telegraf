import { inngest } from '@/core/inngest/clients'
import { broadcastMessage } from './broadcastMessage'
import { broadcastService } from '@/services/broadcast.service'

// Мокаем модули
jest.mock('@/core/inngest/clients', () => ({
  inngest: {
    createFunction: jest.fn().mockImplementation((_, __, handler) => {
      return {
        fn: handler,
        id: 'broadcast-message',
      }
    }),
  },
}))

jest.mock('@/services/broadcast.service', () => ({
  broadcastService: {
    sendToAllUsers: jest.fn(),
  },
}))

describe('broadcastMessage Inngest function', () => {
  const mockEvent = {
    data: {
      imageUrl: 'https://example.com/image.jpg',
      text: 'Тестовое сообщение',
    },
  }

  const mockStep = {
    run: jest.fn().mockImplementation((_, fn) => fn()),
    sleep: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should call broadcastService.sendToAllUsers with correct parameters', async () => {
    // Извлекаем обработчик напрямую из третьего аргумента createFunction
    const mockCreateFunction = (inngest.createFunction as jest.Mock).mock
      .calls[0][2]

    // Вызываем обработчик
    await mockCreateFunction({ event: mockEvent, step: mockStep } as any)

    // Проверяем, что сервис был вызван с правильными параметрами
    expect(broadcastService.sendToAllUsers).toHaveBeenCalledWith(
      mockEvent.data.imageUrl,
      mockEvent.data.text
    )
  })

  it('should return success response when broadcast completed', async () => {
    // Извлекаем обработчик напрямую из третьего аргумента createFunction
    const mockCreateFunction = (inngest.createFunction as jest.Mock).mock
      .calls[0][2]

    // Настраиваем мок для успешного выполнения
    mockStep.run.mockImplementationOnce((_, fn) => {
      return fn().then(() => ({ success: true }))
    })

    // Вызываем обработчик
    const result = await mockCreateFunction({
      event: mockEvent,
      step: mockStep,
    } as any)

    // Проверяем результат
    expect(result).toMatchObject({
      success: true,
      message: 'Broadcast sent to all users',
    })
    expect(result).toHaveProperty('timestamp')
  })
})
