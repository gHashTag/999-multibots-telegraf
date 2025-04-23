import { sendPaymentInfo } from '@/core/supabase/sendPaymentInfo'
import * as supabaseModule from '@/core/supabase'
import { logger } from '@/utils/logger'
import { createBotByName } from '@/core/bot'

// Мокируем модули
jest.mock('@/core/supabase', () => {
  const mockSelectBuilder = {
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(),
  }

  const mockFromBuilder = {
    select: jest.fn().mockReturnValue(mockSelectBuilder),
  }

  return {
    supabase: {
      from: jest.fn().mockReturnValue(mockFromBuilder),
    },
  }
})

jest.mock('@/core/bot', () => ({
  createBotByName: jest.fn(),
}))

jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}))

describe('sendPaymentInfo', () => {
  const mockPaymentData = {
    inv_id: '123456',
    bot_name: 'testBot',
    amount: 100,
    telegram_id: '123456789',
    currency: 'RUB',
    username: 'testuser',
    stars: 10,
  }

  const mockBot = {
    telegram: {
      sendMessage: jest.fn().mockResolvedValue(true),
    },
  }

  // Получаем мокированный объект supabase
  const mockSupabase = supabaseModule.supabase as jest.Mocked<
    typeof supabaseModule.supabase
  > & {
    from: jest.Mock
  }

  beforeEach(() => {
    jest.clearAllMocks()

    // Получаем цепочку моков для установки возвращаемых значений
    const mockSelectBuilder = mockSupabase.from('').select('') as unknown as {
      eq: jest.Mock
      single: jest.Mock
    }

    // Устанавливаем возвращаемое значение для single()
    mockSelectBuilder.single.mockResolvedValue({
      data: mockPaymentData,
      error: null,
    })

    // Мокируем createBotByName
    ;(createBotByName as jest.Mock).mockResolvedValue({
      bot: mockBot,
      groupId: '-100123456789',
    })
  })

  it('should send payment info successfully and return true', async () => {
    const result = await sendPaymentInfo('123456')

    // Проверяем, что функция вернула true
    expect(result).toBe(true)

    // Проверяем, что supabase был вызван с правильными параметрами
    expect(mockSupabase.from).toHaveBeenCalledWith('payments_v2')
    expect(mockSupabase.from('').select).toHaveBeenCalledWith('*')
    expect(mockSupabase.from('').select('').eq).toHaveBeenCalledWith(
      'inv_id',
      '123456'
    )
    expect(
      mockSupabase.from('').select('').eq('', '').single
    ).toHaveBeenCalled()

    // Проверяем, что createBotByName был вызван с правильным параметром
    expect(createBotByName).toHaveBeenCalledWith('testBot')

    // Проверяем, что сообщение было отправлено
    expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
      '-100123456789',
      expect.stringContaining('Новый платеж!')
    )

    // Проверяем, что логи успеха были вызваны
    expect(logger.info).toHaveBeenCalledWith(
      '✅ Информация о платеже получена:',
      expect.objectContaining({
        description: 'Payment info fetched successfully',
        invId: '123456',
      })
    )

    expect(logger.info).toHaveBeenCalledWith(
      '✅ Уведомление об оплате отправлено в группу:',
      expect.objectContaining({
        description: 'Payment notification sent to group',
      })
    )
  })

  it('should return false if payment data is not found', async () => {
    // Получаем цепочку моков для переопределения возвращаемого значения
    const mockSelectBuilder = mockSupabase.from('').select('') as unknown as {
      eq: jest.Mock
      single: jest.Mock
    }

    // Устанавливаем мок для случая, когда данные не найдены
    mockSelectBuilder.single.mockResolvedValue({
      data: null,
      error: null,
    })

    const result = await sendPaymentInfo('123456')

    // Проверяем, что функция вернула false
    expect(result).toBe(false)

    // Проверяем, что был вызван лог ошибки
    expect(logger.error).toHaveBeenCalledWith(
      '❌ Ошибка при получении информации о платеже:',
      expect.objectContaining({
        description: 'Error fetching payment info by invId',
        invId: '123456',
      })
    )

    // Проверяем, что createBotByName не был вызван
    expect(createBotByName).not.toHaveBeenCalled()
  })

  it('should return false if there is an error fetching payment data', async () => {
    // Получаем цепочку моков для переопределения возвращаемого значения
    const mockSelectBuilder = mockSupabase.from('').select('') as unknown as {
      eq: jest.Mock
      single: jest.Mock
    }

    // Устанавливаем мок для случая ошибки при запросе
    mockSelectBuilder.single.mockResolvedValue({
      data: null,
      error: { message: 'Database error' },
    })

    const result = await sendPaymentInfo('123456')

    // Проверяем, что функция вернула false
    expect(result).toBe(false)

    // Проверяем, что был вызван лог ошибки
    expect(logger.error).toHaveBeenCalledWith(
      '❌ Ошибка при получении информации о платеже:',
      expect.objectContaining({
        description: 'Error fetching payment info by invId',
        invId: '123456',
        error: 'Database error',
      })
    )

    // Проверяем, что createBotByName не был вызван
    expect(createBotByName).not.toHaveBeenCalled()
  })

  it('should return false if createBotByName returns null', async () => {
    // Устанавливаем мок для случая, когда createBotByName возвращает null
    ;(createBotByName as jest.Mock).mockResolvedValue(null)

    const result = await sendPaymentInfo('123456')

    // Проверяем, что функция вернула false
    expect(result).toBe(false)

    // Проверяем, что был вызван лог ошибки
    expect(logger.error).toHaveBeenCalledWith(
      '❌ Не удалось создать экземпляр бота для отправки уведомления:',
      expect.objectContaining({
        description: 'Failed to create bot instance for notification',
        bot_name: 'testBot',
        invId: '123456',
      })
    )

    // Проверяем, что сообщение не было отправлено
    expect(mockBot.telegram.sendMessage).not.toHaveBeenCalled()
  })
})
