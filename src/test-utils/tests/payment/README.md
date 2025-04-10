# 💰 Тесты платежной системы

В этой директории содержатся тесты для платежной системы проекта. Тесты проверяют различные аспекты работы с платежами, включая обработку платежей, управление балансом и взаимодействие с платежными шлюзами.

## 📋 Структура тестов

### 1. `paymentProcessorTest.ts`

Тесты для функции обработки платежей (`paymentProcessor`), которая является центральным компонентом системы платежей.

#### Возможности тестов:
- ✅ Тестирование пополнения баланса (`money_income`)
- ✅ Тестирование списания средств (`money_expense`)
- ✅ Проверка обработки ошибок
- ✅ Проверка корректного обновления баланса

#### Запуск:
```bash
npm run test:payment-processor
```
или
```bash
npx ts-node -r tsconfig-paths/register src/test-utils/index.ts --category=payment-processor
```

### 2. `paymentProcessorMockTest.ts`

Тесты с использованием моков для функции обработки платежей. Эти тесты позволяют изолированно проверить логику без взаимодействия с реальной базой данных.

#### Возможности тестов:
- ✅ Тестирование с моками функций базы данных
- ✅ Проверка последовательности вызовов
- ✅ Тестирование обработки ошибок

#### Запуск:
```bash
npm run test:payment-processor-mock
```
или
```bash
npx ts-node -r tsconfig-paths/register src/test-utils/index.ts --category=payment-processor-mock
```

### 3. `ruPaymentTest.ts`

Тесты для интеграции с российской платежной системой.

#### Возможности тестов:
- ✅ Проверка создания платежа
- ✅ Тестирование проверки статуса платежа
- ✅ Тестирование обработки уведомлений

#### Запуск:
```bash
npm run test:ru-payment
```
или
```bash
npx ts-node -r tsconfig-paths/register src/test-utils/index.ts --category=ru-payment
```

## 🚀 Запуск всех тестов платежной системы

Для запуска всех тестов платежной системы используйте:

```bash
npm run test:payment
```
или
```bash
npx ts-node -r tsconfig-paths/register src/test-utils/index.ts --category=payment
```

## ⚠️ Важные принципы тестирования платежной системы

1. **НИКОГДА** не изменяйте функцию `get_user_balance` SQL без тщательного тестирования
2. **НИКОГДА** не создавайте дополнительные записи при обработке платежей с `payment_method='system'`
3. **ВСЕГДА** используйте только одну запись платежа в `payments_v2` для каждой транзакции
4. **ВСЕГДА** проверяйте наличие существующего платежа через `operation_id` или `inv_id`

## 💡 Особенности реализации тестов

- Тесты используют `InngestFunctionTester` для проверки функций Inngest
- Моки создаются с помощью `createMockFn` из `test-config.ts`
- Баланс проверяется через функцию `getUserBalance`, которая использует SQL-функцию `get_user_balance`
- Все тесты возвращают стандартный интерфейс результата `TestResult` или `InngestTestResult`

## 📝 Пример создания нового теста платежной системы

```typescript
import { TestResult } from '../../types'
import { TEST_CONFIG } from '../../test-config'
import { logger } from '@/utils/logger'

export async function testNewPaymentFeature(): Promise<TestResult> {
  try {
    logger.info('🚀 [TEST]: Запуск теста новой платежной функции', {
      description: 'Starting new payment feature test',
    })
    
    // Реализация теста
    
    return {
      success: true,
      name: 'Тест новой платежной функции',
      message: 'Тест успешно пройден'
    }
  } catch (error) {
    logger.error('❌ [TEST]: Ошибка при выполнении теста', {
      description: 'Error during new payment feature test',
      error: error instanceof Error ? error.message : String(error),
    })
    
    return {
      success: false,
      name: 'Тест новой платежной функции',
      message: `Ошибка при выполнении теста: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}
``` 