# Тестирование проекта

## Общая информация

Проект использует собственную систему тестирования, основанную на модуле `src/test-utils`. 
Все тесты должны следовать принципам и паттернам, определенным в этом модуле.

## Структура тестов

Все тесты находятся в директории `src/test-utils/tests/` и разделены по категориям:

- `payment` - тесты платежной системы
- `telegram` - тесты функциональности Telegram-бота
- `inngest` - тесты для событийной системы Inngest
- и другие категории

Исполняемые скрипты запуска тестов находятся в соответствующих поддиректориях:

- `src/test-utils/payment/` - скрипты запуска тестов платежной системы
- `src/test-utils/telegram/` - скрипты запуска тестов Telegram-бота
- и т.д.

## Запуск тестов

### Запуск всех тестов платежной системы

```bash
./scripts/run-payment-tests.sh
```

### Запуск только тестов платежных чеков

```bash
./scripts/run-receipt-tests.sh
```

### Запуск только теста простой генерации чека

```bash
./scripts/run-simple-receipt-test.sh
```

## Тесты платежной системы

### Тесты платежных чеков

Тесты платежных чеков проверяют функциональность генерации и отправки платежных чеков пользователям:

1. `testPaymentReceiptGeneration` - проверяет генерацию URL платежного чека и его отправку пользователю
2. `testSimpleReceiptGeneration` - простая проверка базовой функциональности генерации чека
3. `testReceiptCommand` - проверяет обработку команды `/receipt` для получения чека

### Запуск отдельных тестов

Вы можете запустить отдельный тест, указав его в параметрах при запуске. Например:

```typescript
import { runTests } from './test-utils/runTests'
import { testPaymentReceiptGeneration } from './test-utils/tests/payment/paymentReceiptTest'

// Запуск только одного теста
runTests([testPaymentReceiptGeneration])
```

## Создание новых тестов

При создании новых тестов следуйте этим правилам:

1. Используйте функцию `createMockContext` для создания контекста Telegram
2. Используйте `createMockFn` вместо `jest.fn()` для создания мок-функций
3. Используйте `inngestTestEngine` для тестирования Inngest-событий
4. Все тесты должны быть написаны на TypeScript
5. Все тесты должны возвращать объект `TestResult`
6. Используйте логгер с эмоджи для улучшения читаемости логов

## Моки и тестовые утилиты

- `createMockContext` - создает контекст Telegram для тестирования
- `createMockFn` - создает мок-функцию с возможностью отслеживания вызовов
- `inngestTestEngine` - утилита для тестирования Inngest-событий
- `mockPaymentCreate` - утилита для создания тестовых платежей

## Пример теста

```typescript
import { TestResult } from '@/test-utils/types'
import { logger } from '@/utils/logger'
import { createMockContext } from '@/test-utils/helpers/createMockContext'
import { createMockFn } from '@/test-utils/mocks/telegrafMock'

export async function testExample(): Promise<TestResult> {
  logger.info('🚀 Запуск тестового примера', {
    description: 'Starting example test',
  })
  
  try {
    // Создаем мок-контекст
    const ctx = await createMockContext({ userId: 123456789 })
    
    // Мок для функции, которую будем тестировать
    const mockFunction = createMockFn().mockResolvedValue(true)
    
    // Вызываем функцию
    const result = await mockFunction('test')
    
    // Проверяем результат
    if (!result) {
      throw new Error('Функция вернула неверный результат')
    }
    
    // Проверяем вызов
    if (mockFunction.mock.calls.length === 0) {
      throw new Error('Функция не была вызвана')
    }
    
    return {
      success: true,
      name: 'testExample',
      message: 'Тест примера успешно выполнен',
    }
  } catch (error: any) {
    return {
      success: false,
      name: 'testExample',
      message: `Ошибка: ${error.message}`,
    }
  }
} 