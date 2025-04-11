import { logger } from '@/utils/logger'
import { TestResult } from '@/test-utils/types'
import { inngestTestEngine } from '@/test-utils/config'
import { createTestUser, TestUser } from '@/test-utils/helpers/createTestUser'
import { createTestAvatar, Avatar } from '@/test-utils/helpers/createTestAvatar'
import {
  createMockAmbassador,
  Ambassador,
} from '@/test-utils/helpers/createMockAmbassador'
import { createMockPayment } from '@/test-utils/helpers/createMockPayment'
import { cleanupTestData } from '@/test-utils/helpers/cleanupTestData'
import { ModeEnum } from '@/types/mode'

/**
 * Тест для проверки отправки уведомлений амбассадорам о платежах в их ботах
 */
export async function testAmbassadorPaymentNotification(): Promise<TestResult> {
  logger.info('🎯 Запуск теста уведомлений амбассадоров о платежах', {
    description: 'Testing ambassador payment notification',
    testName: 'testAmbassadorPaymentNotification',
  })

  // Тестовые данные
  let testUser: TestUser | null = null
  let testAvatar: Avatar | null = null
  let mockAmbassador: Ambassador | null = null

  try {
    // Создаем тестового амбассадора
    logger.info('🔍 Создание тестового амбассадора', {
      description: 'Creating mock ambassador for test',
    })
    mockAmbassador = await createMockAmbassador({
      telegramId: '9876543210',
      username: 'test_ambassador',
      fullName: 'Test Ambassador',
    })

    // Создаем тестового пользователя
    logger.info('🔍 Создание тестового пользователя', {
      description: 'Creating test user',
    })
    testUser = await createTestUser({
      telegramId: '1234567890',
      username: 'test_user',
      fullName: 'Test User',
    })

    // Создаем тестовый аватар (бот), привязанный к амбассадору
    logger.info('🔍 Создание тестового аватара (бота)', {
      description: 'Creating test avatar linked to ambassador',
    })
    testAvatar = await createTestAvatar({
      name: 'Test Bot',
      owner_id: mockAmbassador.id,
      ambassador_id: mockAmbassador.id,
    })

    // Очищаем очередь событий перед тестом
    logger.info('🧹 Очистка очереди событий перед тестом', {
      description: 'Clearing event queue before test',
    })
    await inngestTestEngine.clearEvents()

    // Создаем платежное событие для бота амбассадора
    logger.info('💰 Симуляция платежного события', {
      description: 'Simulating payment event for ambassador bot',
      avatarId: testAvatar.id,
      userId: testUser.id,
    })

    // Отправляем событие payment/process
    await inngestTestEngine.sendEvent({
      name: 'payment/process',
      data: {
        telegram_id: testUser.telegramId,
        amount: 100, // Сумма платежа
        stars: 100, // Звезды (внутренняя валюта)
        type: 'money_income', // Тип транзакции
        description: 'Test payment for ambassador notification',
        bot_name: testAvatar.name,
        avatar_id: testAvatar.id, // ID бота амбассадора
        service_type: ModeEnum.TopUpBalance,
      },
    })

    // Ждем обработки события и отправки уведомления
    logger.info('⏳ Ожидание обработки платежа и отправки уведомления', {
      description: 'Waiting for payment processing and notification dispatch',
    })
    await inngestTestEngine.waitForEvents({ timeoutMs: 5000 })

    // Проверяем, что событие уведомления для амбассадора было отправлено
    logger.info('🔍 Проверка отправки уведомления амбассадору', {
      description: 'Checking ambassador notification event',
    })

    const ambassadorNotificationEvents = await inngestTestEngine.getEvents({
      name: 'notification/ambassador',
      filter: event =>
        event.data.ambassador_id === mockAmbassador.id &&
        event.data.avatar_id === testAvatar.id,
    })

    // Проверяем, что уведомление было отправлено
    if (ambassadorNotificationEvents.length === 0) {
      logger.error('❌ Уведомление амбассадору не было отправлено', {
        description: 'Ambassador notification was not sent',
        ambassadorId: mockAmbassador.id,
        avatarId: testAvatar.id,
      })

      return {
        success: false,
        message: 'Уведомление амбассадору о платеже не было отправлено',
        name: 'testAmbassadorPaymentNotification',
      }
    }

    // Проверяем содержимое уведомления
    const notificationEvent = ambassadorNotificationEvents[0]
    logger.info('✅ Уведомление амбассадору успешно отправлено', {
      description: 'Ambassador notification was sent successfully',
      eventData: notificationEvent.data,
    })

    // Валидируем данные в уведомлении
    if (
      notificationEvent.data.ambassador_id !== mockAmbassador.id ||
      notificationEvent.data.avatar_id !== testAvatar.id ||
      notificationEvent.data.amount !== 100 ||
      !notificationEvent.data.user_id
    ) {
      logger.error('❌ Данные в уведомлении некорректны', {
        description: 'Invalid data in ambassador notification',
        expected: {
          ambassador_id: mockAmbassador.id,
          avatar_id: testAvatar.id,
          amount: 100,
        },
        actual: notificationEvent.data,
      })

      return {
        success: false,
        message: 'Данные в уведомлении амбассадору некорректны',
        name: 'testAmbassadorPaymentNotification',
      }
    }

    // Тест пройден успешно
    return {
      success: true,
      message:
        'Уведомление амбассадору о платеже успешно отправлено и проверено',
      name: 'testAmbassadorPaymentNotification',
    }
  } catch (error: any) {
    // Логируем ошибку
    logger.error('❌ Ошибка при тестировании уведомлений амбассадоров', {
      description: 'Error while testing ambassador notifications',
      error: error.message,
      stack: error.stack,
    })

    return {
      success: false,
      message: `Ошибка при тестировании: ${error.message}`,
      name: 'testAmbassadorPaymentNotification',
    }
  } finally {
    // Очищаем тестовые данные
    logger.info('🧹 Очистка тестовых данных', {
      description: 'Cleaning up test data',
    })

    try {
      await cleanupTestData({
        users: testUser ? [testUser.id] : [],
        avatars: testAvatar ? [testAvatar.id] : [],
        ambassadors: mockAmbassador ? [mockAmbassador.id] : [],
      })
    } catch (cleanupError: any) {
      logger.error('❌ Ошибка при очистке тестовых данных', {
        description: 'Error during test data cleanup',
        error: cleanupError.message,
      })
    }
  }
}
