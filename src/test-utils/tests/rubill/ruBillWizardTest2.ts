import { TestResult } from '@/test-utils/types'
import { logger } from '@/utils/logger'
import { createMockContext } from '@/test-utils/helpers/createMockContext'
import { getRuBillWizard } from '@/scenes/getRuBillWizard'
import { inngestMock, createMockFn } from '@/test-utils/mocks/telegrafMock'
import { LocalSubscription } from '@/scenes/getRuBillWizard'

/**
 * Тестирует сцену создания счета RuBillWizard
 */
export async function testRuBillWizardSceneSimple(): Promise<TestResult> {
  logger.info('🚀 Начало теста RuBillWizard (простая версия)', {
    description: 'Starting simplified RuBillWizard test',
  })

  try {
    // 1. Тестирование успешного сценария
    logger.info('🧪 Тест успешного создания счета', {
      description: 'Test successful invoice creation',
    })

    // Создаем мок-контекст с нужными данными для сессии
    const mockContext = createMockContext({
      userId: 12345678,
      username: 'test_user',
      sessionData: {
        selectedPayment: {
          amount: 100,
          stars: 100,
          subscription: 'neuroblogger' as LocalSubscription,
        },
        email: 'test@example.com',
      },
    })

    // Добавляем мок-методы для Telegram
    const mockTelegram = mockContext.telegram as any
    if (!mockTelegram.sendMessage) {
      mockTelegram.sendMessage = createMockFn().mockResolvedValue({
        message_id: 1,
      })
    }

    // Мокируем reply для контекста, если его нет
    if (!mockContext.reply) {
      mockContext.reply = createMockFn().mockImplementation(
        async (text, extra) => {
          logger.info('📩 Мок-ответ бота:', {
            description: 'Mock bot reply',
            text,
            extra,
          })
          if (!mockContext.sentReplies) {
            ;(mockContext as any).sentReplies = []
          }
          ;(mockContext as any).sentReplies.push({
            text,
            extra,
            timestamp: Date.now(),
          })
          return { message_id: (mockContext as any).sentReplies.length }
        }
      )
    }

    // Запускаем сцену для работы с счетом
    try {
      // Получаем первый шаг (генерация счета)
      const generateInvoiceStep = getRuBillWizard.steps[0]

      // Вызываем функцию напрямую
      await (generateInvoiceStep as Function)(mockContext)
    } catch (sceneError) {
      logger.error('❌ Ошибка при запуске сцены:', {
        description: 'Error running scene step',
        error:
          sceneError instanceof Error ? sceneError.message : String(sceneError),
        stack: sceneError instanceof Error ? sceneError.stack : undefined,
      })
    }

    // Проверяем, что пользователю было отправлено сообщение
    const sentReplies = (mockContext as any).sentReplies || []
    logger.info('📋 Отправленные сообщения:', {
      description: 'Sent messages',
      count: sentReplies.length,
      messages: sentReplies.map((r: any) => ({
        text: r.text?.substring(0, 50) + '...',
      })),
    })

    // Проверяем наличие сообщения с кнопкой оплаты
    const hasPurchaseLink = sentReplies.some(
      (reply: any) => reply.text && reply.text.includes('🤑 Подписка')
    )

    if (!hasPurchaseLink) {
      throw new Error('Сообщение о подписке не было отправлено')
    }

    logger.info('✅ Тест RuBillWizard завершен успешно', {
      description: 'RuBillWizard test completed successfully',
    })

    return {
      success: true,
      message: 'Тест RuBillWizard успешно пройден',
      name: 'RuBillWizard Scene Test (Simple)',
    }
  } catch (error) {
    logger.error('❌ Ошибка в тесте RuBillWizard:', {
      description: 'Error in RuBillWizard test',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    return {
      success: false,
      message: `Ошибка теста RuBillWizard: ${error instanceof Error ? error.message : String(error)}`,
      name: 'RuBillWizard Scene Test (Simple)',
    }
  }
}
