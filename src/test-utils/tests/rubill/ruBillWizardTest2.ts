import { TestResult } from '@/test-utils/types'
import { logger } from '@/utils/logger'
import { createMockContext } from '@/test-utils/helpers/createMockContext'
import { getRuBillWizard } from '@/scenes/getRuBillWizard'
import { createMockFn } from '@/test-utils/mocks/telegrafMock'
import { LocalSubscription } from '@/scenes/getRuBillWizard'
import { TestContext } from '@/test-utils/core/TelegramSceneTester'
import { BaseScene } from 'telegraf/typings/scenes'

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
      user: {
        telegram_id: '12345678',
        username: 'test_user',
      },
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
        async (text: string, extra?: any) => {
          logger.info('📩 Мок-ответ бота:', {
            description: 'Mock bot reply',
            text,
            extra,
          })
          const ctx = mockContext as TestContext & { sentReplies?: any[] }
          if (!ctx.sentReplies) {
            ctx.sentReplies = []
          }
          ctx.sentReplies.push({
            text,
            extra,
            timestamp: Date.now(),
          })
          return { message_id: ctx.sentReplies.length }
        }
      )
    }

    // Запускаем сцену для работы с счетом
    try {
      // Получаем wizard и его middleware
      const wizard = getRuBillWizard() as BaseScene<TestContext>
      const middlewares = wizard.middleware()
      const generateInvoiceStep = middlewares[0]

      // Вызываем функцию напрямую
      await generateInvoiceStep(mockContext as TestContext, () => {})
    } catch (sceneError) {
      logger.error('❌ Ошибка при запуске сцены:', {
        description: 'Error running scene step',
        error:
          sceneError instanceof Error ? sceneError.message : String(sceneError),
        stack: sceneError instanceof Error ? sceneError.stack : undefined,
      })
    }

    // Проверяем, что пользователю было отправлено сообщение
    const ctx = mockContext as TestContext & { sentReplies?: any[] }
    const sentReplies = ctx.sentReplies || []
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
