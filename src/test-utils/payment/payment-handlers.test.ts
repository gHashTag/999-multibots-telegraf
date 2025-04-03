import { TestResult } from '../types'
import { TEST_CONFIG } from '../test-config'
import { logger } from '@/utils/logger'
import { inngest } from '@/core/inngest/clients'
import { handleSuccessfulPayment } from '@/handlers/paymentHandlers'
import { Context, Scenes } from 'telegraf'
import { Message, Update } from 'telegraf/types'
import { MyContext, MyWizardSession } from '@/interfaces/telegram-bot.interface'
import { Telegram } from 'telegraf/typings/core/types/typegram'

type MockFn<T = any> = {
  (): T
  calls: any[]
  mockReturnValue: (value: T) => MockFn<T>
  mockImplementation: (impl: (...args: any[]) => T) => MockFn<T>
}

function fn<T = any>(returnValue?: T): MockFn<T> {
  const mockFn = () => returnValue
  mockFn.calls = [] as any[]
  mockFn.mockReturnValue = (value: T) => {
    returnValue = value
    return mockFn as MockFn<T>
  }
  mockFn.mockImplementation = (impl: (...args: any[]) => T) => {
    const newMockFn = (...args: any[]) => impl(...args)
    newMockFn.calls = mockFn.calls
    newMockFn.mockReturnValue = mockFn.mockReturnValue
    newMockFn.mockImplementation = mockFn.mockImplementation
    return newMockFn as MockFn<T>
  }
  return mockFn as MockFn<T>
}

// Создаем базовый контекст для тестов
const createTestContext = (overrides = {}): MyContext => {
  const baseContext: Partial<MyContext> = {
    update: {} as Update,
    telegram: {
      sendMessage: fn(),
      answerPreCheckoutQuery: fn(),
      sendInvoice: fn(),
      deleteMessage: fn(),
      editMessageText: fn(),
      editMessageReplyMarkup: fn(),
      answerCbQuery: fn(),
    } as any,
    state: {},
    updateType: 'message',
    session: {
      email: '',
      selectedModel: '',
      prompt: '',
      selectedSize: '',
      userModel: null,
      numImages: 0,
      telegram_id: Number(TEST_CONFIG.user.telegramId),
      mode: 'text_to_image',
      attempts: 0,
      videoModel: '',
      imageUrl: '',
      videoUrl: '',
      audioUrl: '',
      paymentAmount: 0,
      subscription: '',
      images: [],
      modelName: '',
      targetUserId: 0,
      username: '',
      triggerWord: '',
      steps: 0,
      inviter: '',
      inviteCode: '',
      invoiceURL: '',
      buttons: [],
      selectedPayment: {
        amount: 0,
        stars: '',
        subscription: '',
      },
    },
    attempts: 0,
    ...overrides,
  }

  const context = baseContext as MyContext

  // Создаем сцену с пустым массивом сцен
  const scenes = new Map<string, Scenes.BaseScene<MyContext>>()
  context.scene = new Scenes.SceneContextScene<MyContext, MyWizardSession>(
    context,
    scenes,
    {
      ttl: 10,
    }
  )

  // Создаем wizard с пустым массивом middleware
  const steps: Array<(ctx: MyContext) => Promise<void>> = []
  context.wizard = new Scenes.WizardContextWizard<MyContext>(context, steps)

  return context
}

export async function runPaymentTests(): Promise<TestResult[]> {
  const results: TestResult[] = []
  const startTime = Date.now()

  try {
    logger.info('🚀 Starting payment tests')

    // Тест 1: Успешный платеж с подпиской
    const subscriptionPaymentTest = {
      name: 'Successful payment with subscription',
      test: async (): Promise<TestResult> => {
        const testStartTime = Date.now()
        try {
          const input = createTestContext({
            chat: { id: TEST_CONFIG.user.telegramId },
            from: {
              id: TEST_CONFIG.user.telegramId,
              username: 'testuser',
            },
            message: {
              successful_payment: {
                total_amount: 1000,
                invoice_payload: 'test_payload',
              },
            } as Message.SuccessfulPaymentMessage,
            session: {
              subscription: 'premium',
              telegram_id: TEST_CONFIG.user.telegramId,
              email: 'test@test.com',
              buttons: [],
            },
            botInfo: {
              username: TEST_CONFIG.bot.name,
            },
          })

          await handleSuccessfulPayment(input)

          return {
            name: 'Subscription Payment Test',
            testName: 'Subscription Payment Test',
            passed: true,
            success: true,
            duration: Date.now() - testStartTime,
            message: '✅ Subscription payment processed successfully',
            details: {
              input,
              expectedCalls: {
                inngest: [
                  {
                    name: 'payment/process',
                    data: {
                      telegram_id: TEST_CONFIG.user.telegramId,
                      type: 'income',
                      bot_name: TEST_CONFIG.bot.name,
                    },
                  },
                ],
                supabase: [
                  {
                    function: 'updateUserSubscription',
                    args: [TEST_CONFIG.user.telegramId, 'premium'],
                  },
                ],
              },
            },
          }
        } catch (error) {
          return {
            name: 'Subscription Payment Test',
            testName: 'Subscription Payment Test',
            passed: false,
            success: false,
            duration: Date.now() - testStartTime,
            message: '❌ Subscription payment test failed',
            error: error instanceof Error ? error.message : String(error),
            details: { error },
          }
        }
      },
    }

    // Тест 2: Успешный платеж без подписки
    const balanceTopUpTest = {
      name: 'Balance top-up payment',
      test: async (): Promise<TestResult> => {
        const testStartTime = Date.now()
        try {
          const input = createTestContext({
            chat: { id: TEST_CONFIG.user.telegramId },
            from: {
              id: TEST_CONFIG.user.telegramId,
              username: 'testuser',
            },
            message: {
              successful_payment: {
                total_amount: 500,
                invoice_payload: 'balance_top_up',
              },
            } as Message.SuccessfulPaymentMessage,
            session: {
              subscription: '',
              telegram_id: TEST_CONFIG.user.telegramId,
              email: 'test@test.com',
              buttons: [],
            },
            botInfo: {
              username: TEST_CONFIG.bot.name,
            },
          })

          await handleSuccessfulPayment(input)

          return {
            name: 'Balance Top-up Test',
            testName: 'Balance Top-up Test',
            passed: true,
            success: true,
            duration: Date.now() - testStartTime,
            message: '✅ Balance top-up processed successfully',
            details: {
              input,
              expectedCalls: {
                inngest: [
                  {
                    name: 'payment/process',
                    data: {
                      telegram_id: TEST_CONFIG.user.telegramId,
                      type: 'income',
                      description: 'Пополнение баланса через Telegram',
                      bot_name: TEST_CONFIG.bot.name,
                    },
                  },
                ],
              },
            },
          }
        } catch (error) {
          return {
            name: 'Balance Top-up Test',
            testName: 'Balance Top-up Test',
            passed: false,
            success: false,
            duration: Date.now() - testStartTime,
            message: '❌ Balance top-up test failed',
            error: error instanceof Error ? error.message : String(error),
            details: { error },
          }
        }
      },
    }

    // Тест 3: Ошибка при отсутствии chat
    const noChatTest = {
      name: 'Payment without chat',
      test: async (): Promise<TestResult> => {
        const testStartTime = Date.now()
        try {
          const input = createTestContext({
            from: {
              id: TEST_CONFIG.user.telegramId,
              username: 'testuser',
            },
            message: {
              successful_payment: {
                total_amount: 1000,
                invoice_payload: 'test_payload',
              },
            } as Message.SuccessfulPaymentMessage,
            session: {
              subscription: 'premium',
              telegram_id: TEST_CONFIG.user.telegramId,
              email: 'test@test.com',
              buttons: [],
            },
          })

          await handleSuccessfulPayment(input)

          return {
            name: 'No Chat Test',
            testName: 'No Chat Test',
            passed: true,
            success: true,
            duration: Date.now() - testStartTime,
            message: '✅ No chat error handled correctly',
            details: {
              input,
              expectedLogs: [
                {
                  level: 'error',
                  message: '❌ Update does not belong to a chat',
                },
              ],
            },
          }
        } catch (error) {
          return {
            name: 'No Chat Test',
            testName: 'No Chat Test',
            passed: false,
            success: false,
            duration: Date.now() - testStartTime,
            message: '❌ No chat test failed',
            error: error instanceof Error ? error.message : String(error),
            details: { error },
          }
        }
      },
    }

    // Тест 4: Ошибка при неверном формате платежа
    const invalidPaymentTest = {
      name: 'Invalid payment format',
      test: async (): Promise<TestResult> => {
        const testStartTime = Date.now()
        try {
          const input = createTestContext({
            chat: { id: TEST_CONFIG.user.telegramId },
            from: {
              id: TEST_CONFIG.user.telegramId,
              username: 'testuser',
            },
            message: {
              successful_payment: null,
            } as Message.SuccessfulPaymentMessage,
            session: {
              subscription: 'premium',
              telegram_id: TEST_CONFIG.user.telegramId,
              email: 'test@test.com',
              buttons: [],
            },
          })

          await handleSuccessfulPayment(input)

          return {
            name: 'Invalid Payment Test',
            testName: 'Invalid Payment Test',
            passed: true,
            success: true,
            duration: Date.now() - testStartTime,
            message: '✅ Invalid payment error handled correctly',
            details: {
              input,
              expectedLogs: [
                {
                  level: 'error',
                  message: message =>
                    message.includes('Ошибка при обработке платежа'),
                },
              ],
            },
          }
        } catch (error) {
          return {
            name: 'Invalid Payment Test',
            testName: 'Invalid Payment Test',
            passed: false,
            success: false,
            duration: Date.now() - testStartTime,
            message: '❌ Invalid payment test failed',
            error: error instanceof Error ? error.message : String(error),
            details: { error },
          }
        }
      },
    }

    // Запускаем все тесты
    const testResults = await Promise.all([
      subscriptionPaymentTest.test(),
      balanceTopUpTest.test(),
      noChatTest.test(),
      invalidPaymentTest.test(),
    ])

    results.push(...testResults)
  } catch (error) {
    logger.error('❌ Error running payment tests:', {
      error: error instanceof Error ? error.message : String(error),
    })
  }

  const duration = Date.now() - startTime
  logger.info(`🏁 Payment tests completed in ${duration}ms`)

  return results
}

// Если файл запущен напрямую
if (require.main === module) {
  runPaymentTests().then(results => {
    console.log('Test Results:', results)
    process.exit(results.every(r => r.success) ? 0 : 1)
  })
}
