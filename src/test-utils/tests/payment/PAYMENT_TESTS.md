# 💰 Система тестирования платежного функционала

## Введение

Система тестирования платежного функционала обеспечивает проверку всех аспектов работы с платежами в проекте, включая:
- обработку платежей
- управление балансом пользователей
- интеграции с платежными шлюзами
- уведомления о платежах
- проверки на дублирование платежей

## Структура тестов

Тесты платежной системы организованы в следующую структуру:

```
src/test-utils/tests/payment/
├── core/                       # Основные тесты платежного ядра
│   ├── paymentProcessor.ts     # Тесты платежного процессора
│   ├── createPayment.ts        # Тесты создания платежей
│   ├── balance.ts              # Тесты работы с балансом
│   └── transactions.ts         # Тесты транзакций
│
├── integrations/               # Тесты интеграций с платежными системами
│   ├── ruPayment.ts            # Тесты российских платежей
│   ├── robokassa.ts            # Тесты интеграции с Робокассой
│   └── internationalPayment.ts # Тесты международных платежей
│
├── notifications/              # Тесты уведомлений
│   ├── paymentNotification.ts  # Тесты уведомлений о платежах
│   └── receiptNotification.ts  # Тесты уведомлений о чеках
│
├── features/                   # Тесты функциональных возможностей
│   ├── selectModelPayment.ts   # Тесты платных моделей
│   ├── ambassadorPayment.ts    # Тесты амбассадорских платежей
│   └── ruBillPayment.ts        # Тесты интеграции RuBill
│
├── utils/                      # Утилиты для тестирования
│   ├── paymentTester.ts        # Класс для тестирования платежей
│   └── testConfig.ts           # Конфигурация тестов
│
├── mocks/                      # Моки для тестирования
│   ├── mockPaymentProcessor.ts # Моки платежного процессора
│   └── mockDatabase.ts         # Моки базы данных
│
└── index.ts                    # Точка входа для запуска всех тестов
```

## Запуск тестов

### Запуск всех тестов платежной системы

```bash
npm run test:payment
```

### Запуск конкретных групп тестов

```bash
# Тесты платежного процессора
npm run test:payment-processor

# Тесты создания платежей
npm run test:payment-create

# Тесты уведомлений о платежах
npm run test:payment-notification

# Тесты интеграции RuBill
npm run test:rubill

# Тесты платных моделей
npm run test:select-model

# Тесты чеков
npm run test:receipt
```

## Класс PaymentTester

Класс `PaymentTester` предоставляет стандартный набор методов для тестирования платежной системы:

```typescript
import { PaymentTester } from './tests/payment/utils/paymentTester'

// Создание экземпляра
const tester = new PaymentTester()

// Создание тестового пользователя
await tester.createTestUser(telegramId, initialBalance)

// Проверка баланса
const hasEnoughBalance = await tester.checkBalance(userId, amount)

// Проверка создания платежа
const isPaymentCreated = await tester.checkPaymentCreated(telegramId, amount)

// Проверка обновления баланса
const isBalanceUpdated = await tester.checkBalanceUpdated(telegramId, expectedBalance)

// Проверка статуса платежа
const hasCorrectStatus = await tester.checkPaymentStatus(invId, 'COMPLETED')

// Очистка тестовых данных
await tester.cleanupTestData(telegramId)
```

## Конфигурация тестов

Единый файл конфигурации `testConfig.ts` содержит общие настройки для всех тестов платежной системы:

```typescript
import { TEST_PAYMENT_CONFIG } from './tests/payment/utils/testConfig'

// Доступ к тестовым суммам
const amount = TEST_PAYMENT_CONFIG.amounts.small

// Доступ к тестовым сервисам
const service = TEST_PAYMENT_CONFIG.services[0]

// Доступ к тестовому пользователю
const { initialBalance } = TEST_PAYMENT_CONFIG.testUser
```

## Важные принципы тестирования платежной системы

1. **НИКОГДА** не изменяйте функцию `get_user_balance` SQL без тщательного тестирования
2. **НИКОГДА** не создавайте дополнительные записи при обработке платежей с `payment_method='system'`
3. **ВСЕГДА** используйте только одну запись платежа в `payments_v2` для каждой транзакции
4. **ВСЕГДА** проверяйте наличие существующего платежа через `operation_id` или `inv_id`

## Соглашения о коде

1. **Именование файлов**: camelCase, расширение `.ts` (не `.test.ts`)
2. **Структура тестов**: следуйте шаблону:
   ```typescript
   export async function run[Функциональность]Tests(): Promise<TestResult[]> {
     // Запуск тестов и возврат результатов
   }
   
   async function test[КонкретнаяФункция](): Promise<TestResult> {
     // Реализация конкретного теста
   }
   ```
3. **Логирование**: используйте стандартные эмодзи для разделения типов логов
   - 🚀 Запуск теста
   - ✅ Успешное выполнение
   - ❌ Ошибка
   - 🔍 Проверка
   - 💾 Операции с данными
   - 📣 Уведомления

4. **Обработка ошибок**: единый формат для всех тестов
   ```typescript
   try {
     // Код теста
   } catch (error) {
     logger.error('❌ Ошибка в тесте: [название теста]', {
       description: 'Error in test',
       error: error instanceof Error ? error.message : String(error),
     })
     
     return {
       success: false,
       name: '[Название теста]',
       message: `Ошибка: ${error instanceof Error ? error.message : String(error)}`
     }
   }
   ```

## Создание новых тестов

Для создания новых тестов платежной системы следуйте шаблону:

```typescript
import { TestResult } from '@/test-utils/types'
import { logger } from '@/utils/logger'
import { PaymentTester } from '../utils/paymentTester'
import { TEST_PAYMENT_CONFIG } from '../utils/testConfig'

/**
 * Запускает тесты для [функциональность]
 */
export async function run[Функциональность]Tests(): Promise<TestResult[]> {
  logger.info('🚀 Запуск тестов [функциональность]', {
    description: 'Running [functionality] tests',
  })

  try {
    const results: TestResult[] = []
    
    // Запуск тестов
    results.push(await test[КонкретнаяФункция1]())
    results.push(await test[КонкретнаяФункция2]())
    
    // Отчет о результатах
    const passedTests = results.filter(r => r.success).length
    const totalTests = results.length
    
    logger.info(`✅ Завершено ${passedTests}/${totalTests} тестов`, {
      description: 'Tests completed',
      passedTests,
      totalTests,
    })
    
    return results
  } catch (error) {
    logger.error('❌ Ошибка при запуске тестов', {
      description: 'Error running tests',
      error: error instanceof Error ? error.message : String(error),
    })
    
    return [{
      success: false,
      name: '[Функциональность] Tests',
      message: `Ошибка: ${error instanceof Error ? error.message : String(error)}`
    }]
  }
}

/**
 * Тест для [конкретная функция]
 */
async function test[КонкретнаяФункция](): Promise<TestResult> {
  const testName = 'Тест [конкретной функции]'
  
  logger.info(`🚀 Запуск теста: ${testName}`, {
    description: 'Starting test',
  })
  
  const tester = new PaymentTester()
  const telegramId = '123456789'
  
  try {
    // Реализация теста с использованием PaymentTester
    
    logger.info(`✅ Тест успешно пройден: ${testName}`, {
      description: 'Test passed successfully',
    })
    
    return {
      success: true,
      name: testName,
      message: 'Тест успешно пройден'
    }
  } catch (error) {
    logger.error(`❌ Ошибка в тесте: ${testName}`, {
      description: 'Error in test',
      error: error instanceof Error ? error.message : String(error),
    })
    
    return {
      success: false,
      name: testName,
      message: `Ошибка: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}
```

## Типы транзакций

1. **money_income** - пополнение баланса (положительное значение)
2. **money_expense** - списание средств (отрицательное значение)
3. **subscription_purchase** - покупка подписки
4. **subscription_renewal** - продление подписки
5. **refund** - возврат средств
6. **bonus** - начисление бонуса
7. **referral** - реферальное начисление
8. **system** - системная операция

## Документация и ресурсы

Дополнительная документация доступна в следующих файлах:

- [src/test-utils/tests/payment/README.md](./tests/payment/README.md) - Детальная документация по тестам платежной системы
- [src/test-utils/tests/payment/REFACTORING.md](./tests/payment/REFACTORING.md) - План рефакторинга тестов
- [src/test-utils/tests/payment/SUMMARY.md](./tests/payment/SUMMARY.md) - Итоги анализа и рекомендации 