import { VercelRequest, VercelResponse } from '@vercel/node'
import { Scenes } from 'telegraf'
import {
  MockFunction,
  makeMockFunction,
  createMockContext,
  TestContext,
  assertHasCalled,
  assertMessageSent,
  assertCalledWith,
  assertMessageSentWith,
  logInfo,
  logError,
  TestResults,
  TestSuite,
  runTests,
} from '../../test-utils'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { getRuBillWizard } from '@/scenes/getRuBillWizard'
import * as helper from '@/scenes/getRuBillWizard/helper'
import * as supabaseModule from '@/core/supabase'
import * as coreModule from '@/core'
import { logger } from '@/utils/logger'
import { inngest } from '@/inngest-functions/clients'

jest.mock('@/utils/logger')
jest.mock('@/inngest-functions/clients')

describe('getRuBillWizard', () => {
  // Моки для внешних зависимостей
  let mockIsRussian: MockFunction<typeof import('@/helpers').isRussian>
  let mockGetInvoiceId: MockFunction<typeof helper.getInvoiceId>
  let mockUpdateUserSubscription: MockFunction<typeof supabaseModule.updateUserSubscription>
  let mockCreatePayment: MockFunction<typeof supabaseModule.createPayment>
  let mockGetBotNameByToken: MockFunction<typeof coreModule.getBotNameByToken>
  let mockGenerateUniqueShortInvId: MockFunction<typeof helper.generateUniqueShortInvId>
  
  // Контекст для тестов
  let mockContext: TestContext
  
  beforeEach(() => {
    // Инициализация моков
    mockIsRussian = makeMockFunction(jest.fn(() => true))
    mockGetInvoiceId = makeMockFunction(jest.fn(async () => 'https://test-invoice-url.com'))
    mockUpdateUserSubscription = makeMockFunction(jest.fn(async () => ({ success: true })))
    mockCreatePayment = makeMockFunction(jest.fn(async () => ({ success: true })))
    mockGetBotNameByToken = makeMockFunction(jest.fn(() => ({ bot_name: 'TestBot' })))
    mockGenerateUniqueShortInvId = makeMockFunction(jest.fn(async () => 12345))
    
    // Создание мок-контекста
    mockContext = createMockContext({
      from: { 
        id: 123456789, 
        is_bot: false, 
        first_name: 'Test',
        username: 'testuser'
      },
      session: {
        selectedPayment: {
          amount: 1000,
          subscription: 'neurophoto'
        },
        email: 'test@example.com'
      }
    })
    
    // Мокирование вызовов внешних функций
    jest.spyOn(helper, 'getInvoiceId').mockImplementation(mockGetInvoiceId)
    jest.spyOn(helper, 'generateUniqueShortInvId').mockImplementation(mockGenerateUniqueShortInvId)
    jest.spyOn(supabaseModule, 'updateUserSubscription').mockImplementation(mockUpdateUserSubscription)
    jest.spyOn(supabaseModule, 'createPayment').mockImplementation(mockCreatePayment)
    jest.spyOn(coreModule, 'getBotNameByToken').mockImplementation(mockGetBotNameByToken)
    jest.spyOn(require('@/helpers'), 'isRussian').mockImplementation(mockIsRussian)
  })
  
  afterEach(() => {
    jest.clearAllMocks()
  })
  
  // Вспомогательные функции для тестов
  const getRuBillWizardTests: TestSuite = {
    testGenerateInvoiceStep_Success: async function(): Promise<TestResults> {
      logInfo('📝 Тест: успешное создание счета')
      
      try {
        // Получаем enterHandler из сцены
        const wizardHandler = getRuBillWizard.middleware()[0]
        
        // Вызываем обработчик с контекстом
        await wizardHandler(mockContext as any, async () => {})
        
        // Проверяем, что вызваны нужные функции
        assertHasCalled(mockIsRussian)
        assertHasCalled(mockGenerateUniqueShortInvId)
        assertHasCalled(mockGetInvoiceId)
        assertHasCalled(mockCreatePayment)
        
        // Проверяем, что отправлено сообщение со ссылкой на счет
        assertMessageSentWith(mockContext, 'https://test-invoice-url.com')
        
        return {
          name: 'testGenerateInvoiceStep_Success',
          category: 'getRuBillWizard',
          success: true,
          message: '✅ Тест прошел успешно: счет создан и ссылка отправлена'
        }
      } catch (error) {
        logError(`❌ Ошибка в тесте: ${error.message}`)
        return {
          name: 'testGenerateInvoiceStep_Success',
          category: 'getRuBillWizard',
          success: false,
          message: `❌ Тест провален: ${error.message}`
        }
      }
    },
    
    testGenerateInvoiceStep_MissingPayment: async function(): Promise<TestResults> {
      logInfo('📝 Тест: отсутствует выбранный способ оплаты')
      
      try {
        // Создаем контекст без выбранного способа оплаты
        const contextWithoutPayment = createMockContext({
          from: { 
            id: 123456789, 
            is_bot: false, 
            first_name: 'Test',
            username: 'testuser'
          },
          session: {
            selectedPayment: undefined,
            email: 'test@example.com'
          }
        })
        
        // Получаем enterHandler из сцены
        const wizardHandler = getRuBillWizard.middleware()[0]
        
        // Вызываем обработчик с контекстом
        await wizardHandler(contextWithoutPayment as any, async () => {})
        
        // Проверяем, что логирование ошибки было вызвано
        assertCalledWith(logger.error, '❌ Не выбран способ оплаты')
        
        return {
          name: 'testGenerateInvoiceStep_MissingPayment',
          category: 'getRuBillWizard',
          success: true,
          message: '✅ Тест прошел успешно: правильно обработано отсутствие способа оплаты'
        }
      } catch (error) {
        logError(`❌ Ошибка в тесте: ${error.message}`)
        return {
          name: 'testGenerateInvoiceStep_MissingPayment',
          category: 'getRuBillWizard',
          success: false,
          message: `❌ Тест провален: ${error.message}`
        }
      }
    },
    
    testGenerateInvoiceStep_InvoiceError: async function(): Promise<TestResults> {
      logInfo('📝 Тест: ошибка при создании счета')
      
      try {
        // Заменяем мок на версию, которая выбрасывает ошибку
        mockGetInvoiceId.mockImplementation(async () => {
          throw new Error('Invoice generation failed')
        })
        
        // Получаем enterHandler из сцены
        const wizardHandler = getRuBillWizard.middleware()[0]
        
        // Вызываем обработчик с контекстом
        await wizardHandler(mockContext as any, async () => {})
        
        // Проверяем, что логирование ошибки было вызвано
        assertCalledWith(logger.error, expect.stringContaining('Invoice generation failed'))
        
        // Проверяем, что отправлено сообщение об ошибке
        assertMessageSentWith(mockContext, expect.stringContaining('ошибка'))
        
        return {
          name: 'testGenerateInvoiceStep_InvoiceError',
          category: 'getRuBillWizard',
          success: true,
          message: '✅ Тест прошел успешно: правильно обработана ошибка создания счета'
        }
      } catch (error) {
        logError(`❌ Ошибка в тесте: ${error.message}`)
        return {
          name: 'testGenerateInvoiceStep_InvoiceError',
          category: 'getRuBillWizard',
          success: false,
          message: `❌ Тест провален: ${error.message}`
        }
      }
    },
    
    testGenerateInvoiceStep_MissingUserId: async function(): Promise<TestResults> {
      logInfo('📝 Тест: отсутствует ID пользователя')
      
      try {
        // Создаем контекст без ID пользователя
        const contextWithoutUserId = createMockContext({
          from: undefined,
          session: {
            selectedPayment: {
              amount: 1000,
              subscription: 'neurophoto'
            },
            email: 'test@example.com'
          }
        })
        
        // Получаем enterHandler из сцены
        const wizardHandler = getRuBillWizard.middleware()[0]
        
        // Вызываем обработчик с контекстом
        await wizardHandler(contextWithoutUserId as any, async () => {})
        
        // Проверяем, что логирование ошибки было вызвано
        assertCalledWith(logger.error, expect.stringContaining('User ID not found'))
        
        return {
          name: 'testGenerateInvoiceStep_MissingUserId',
          category: 'getRuBillWizard',
          success: true,
          message: '✅ Тест прошел успешно: правильно обработано отсутствие ID пользователя'
        }
      } catch (error) {
        logError(`❌ Ошибка в тесте: ${error.message}`)
        return {
          name: 'testGenerateInvoiceStep_MissingUserId',
          category: 'getRuBillWizard',
          success: false,
          message: `❌ Тест провален: ${error.message}`
        }
      }
    }
  }

  // Запуск тестов
  it('все тесты работают корректно', async () => {
    const results = await runTests(getRuBillWizardTests)
    expect(results.every(result => result.success)).toBe(true)
  })
}) 