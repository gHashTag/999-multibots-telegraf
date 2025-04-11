# 💰 Тесты платежной системы

В этой директории содержатся тесты для платежной системы проекта. Тесты проверяют различные аспекты работы с платежами, включая обработку платежей, управление балансом и взаимодействие с платежными шлюзами.

## 📂 Структура тестов

### 1. Ядро платежной системы (`core/`)

Тесты для основных компонентов платежной системы:

- **paymentProcessor.ts** - тесты платежного процессора
- **createPayment.ts** - тесты создания платежей
- **balance.ts** - тесты работы с балансом
- **transactions.ts** - тесты транзакций

### 2. Интеграции с платежными системами (`integrations/`)

Тесты интеграций с различными платежными шлюзами:

- **ruPayment.ts** - тесты российских платежей
- **robokassa.ts** - тесты интеграции с Робокассой

### 3. Уведомления (`notifications/`)

Тесты системы уведомлений о платежах:

- **paymentNotification.ts** - тесты уведомлений о платежах
- **receiptNotification.ts** - тесты уведомлений о чеках

### 4. Функциональные возможности (`features/`)

Тесты конкретных функциональностей платежной системы:

- **selectModelPayment.ts** - тесты платных моделей
- **ambassadorPayment.ts** - тесты амбассадорских платежей
- **ruBillPayment.ts** - тесты интеграции RuBill

### 5. Утилиты для тестирования (`utils/`)

Вспомогательные утилиты для тестирования:

- **paymentTester.ts** - класс для тестирования платежей
- **testConfig.ts** - конфигурация тестов

### 6. Моки для тестирования (`mocks/`)

Моки для изолированного тестирования:

- **mockPaymentProcessor.ts** - моки платежного процессора
- **mockDatabase.ts** - моки базы данных

## 🚀 Запуск тестов

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

### Запуск тестов в Docker

```bash
npm run docker:test:payment
```

## ⚙️ Класс PaymentTester

Класс `PaymentTester` предоставляет общие методы для тестирования платежной системы:

```typescript
import { PaymentTester } from './utils/paymentTester'

// Создание экземпляра
const tester = new PaymentTester()

// Проверка баланса
const hasEnoughBalance = await tester.checkBalance(userId, amount)

// Проверка создания платежа
const isPaymentCreated = await tester.checkPaymentCreated(telegramId, amount)

// Проверка обновления баланса
const isBalanceUpdated = await tester.checkBalanceUpdated(telegramId, expectedBalance)

// Проверка статуса платежа
const hasCorrectStatus = await tester.checkPaymentStatus(invId, 'COMPLETED')
```

## 📊 Конфигурация тестов

Файл `utils/testConfig.ts` содержит общие константы и конфигурацию для тестов:

```typescript
import { TEST_PAYMENT_CONFIG } from './utils/testConfig'

// Доступ к тестовым суммам
const amount = TEST_PAYMENT_CONFIG.amounts.small

// Доступ к тестовым сервисам
const service = TEST_PAYMENT_CONFIG.services[0]

// Доступ к тестовому пользователю
const { initialBalance } = TEST_PAYMENT_CONFIG.testUser
```

## ⚠️ Важные принципы тестирования платежной системы

1. **НИКОГДА** не изменяйте функцию `get_user_balance` SQL без тщательного тестирования
2. **НИКОГДА** не создавайте дополнительные записи при обработке платежей с `payment_method='system'`
3. **ВСЕГДА** используйте только одну запись платежа в `payments_v2` для каждой транзакции
4. **ВСЕГДА** проверяйте наличие существующего платежа через `operation_id` или `inv_id`

## 💡 Соглашения о коде

1. **Именование файлов**: camelCase, расширение `.ts` (не `.test.ts`)
2. **Структура тестов**: следуйте шаблону из `REFACTORING.md`
3. **Логирование**: используйте стандартные эмодзи для разделения типов логов
4. **Обработка ошибок**: единый формат для всех тестов

## 📝 Создание новых тестов

Следуйте шаблону для создания новых тестов:

```typescript
import { TestResult } from '@/test-utils/types'
import { logger } from '@/utils/logger'
import { PaymentTester } from '../utils/paymentTester'

/**
 * Тест для [функциональность]
 */
export async function test[Функциональность](): Promise<TestResult> {
  logger.info('🚀 Запуск теста [функциональность]', {
    description: 'Starting [functionality] test',
  })
  
  const tester = new PaymentTester()
  
  try {
    // Реализация теста с использованием PaymentTester
    
    logger.info('✅ Тест [функциональность] успешно пройден', {
      description: 'Test completed successfully',
    })
    
    return {
      success: true,
      name: 'Тест [функциональность]',
      message: 'Тест успешно пройден'
    }
  } catch (error) {
    logger.error('❌ Ошибка в тесте [функциональность]', {
      description: 'Error in test',
      error: error instanceof Error ? error.message : String(error),
    })
    
    return {
      success: false,
      name: 'Тест [функциональность]',
      message: `Ошибка: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}
```

## 🔄 Рефакторинг

Подробный план рефакторинга тестов платежной системы доступен в файле `REFACTORING.md`.

## 📊 Информация о транзакциях

### Типы транзакций

1. **money_income** - пополнение баланса (положительное значение)
2. **money_expense** - списание средств (отрицательное значение)
3. **subscription_purchase** - покупка подписки
4. **subscription_renewal** - продление подписки
5. **refund** - возврат средств
6. **bonus** - начисление бонуса
7. **referral** - реферальное начисление
8. **system** - системная операция 