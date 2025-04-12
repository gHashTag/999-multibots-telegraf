# 📘 Руководство по тестированию платежной системы NeuroBlogger

## 🔍 Основные принципы тестирования платежной системы

### Критические аспекты для тестирования
- ✅ Корректный расчет баланса пользователя
- ✅ Обработка транзакций разных типов (money_income, money_expense)
- ✅ Обработка ошибочных ситуаций и edge-cases
- ✅ Предотвращение дублирования транзакций
- ✅ Обработка конкурентных операций

### Структура тестов
Тесты платежной системы располагаются в трех основных директориях:
- `src/test-utils/tests/payment/paymentProcessorTest.ts` - основные тесты
- `src/test-utils/tests/payment/paymentProcessorMockTest.ts` - тесты с использованием моков
- `src/test-utils/tests/payment/paymentDockerTest.ts` - тесты в окружении Docker

## 🚀 Создание эффективных тестов платежной системы

### Шаблон теста для money_income
```typescript
export async function testMoneyIncome(): Promise<TestResult> {
  try {
    // 1. Подготовка тестовых данных
    const testUser = { telegram_id: '123456789' };
    const initialBalance = await getUserBalance(testUser.telegram_id);
    
    const amount = 100;
    const testOperationId = generateUniqueId();
    
    // 2. Отправка события платежа
    await inngest.send({
      name: 'payment/process',
      data: {
        telegram_id: testUser.telegram_id,
        amount: amount,
        type: 'money_income',
        description: 'Test money income',
        bot_name: 'TestBot',
        service_type: ModeEnum.TopUpBalance,
        operation_id: testOperationId
      }
    });
    
    // 3. Ожидание обработки (важно для асинхронных операций)
    await wait(1000);
    
    // 4. Проверка результата
    const newBalance = await getUserBalance(testUser.telegram_id);
    const expectedBalance = initialBalance + amount;
    
    if (newBalance !== expectedBalance) {
      return {
        success: false,
        message: `Баланс после пополнения неверен. Ожидалось: ${expectedBalance}, получено: ${newBalance}`,
        name: 'Money Income Test'
      };
    }
    
    return {
      success: true,
      message: 'Тест пополнения баланса успешно пройден',
      name: 'Money Income Test'
    };
  } catch (error) {
    return {
      success: false,
      message: `Ошибка в тесте пополнения: ${error.message}`,
      name: 'Money Income Test'
    };
  }
}
```

### Шаблон теста для money_expense
```typescript
export async function testMoneyExpense(): Promise<TestResult> {
  try {
    // 1. Подготовка тестовых данных и начального баланса
    const testUser = { telegram_id: '123456789' };
    const initialBalance = await getUserBalance(testUser.telegram_id);
    
    // Убедимся, что у пользователя достаточно средств
    if (initialBalance < 50) {
      // Сначала пополним баланс
      await inngest.send({
        name: 'payment/process',
        data: {
          telegram_id: testUser.telegram_id,
          amount: 100,
          type: 'money_income',
          description: 'Test money income for expense test',
          bot_name: 'TestBot',
          service_type: ModeEnum.TopUpBalance
        }
      });
      
      await wait(1000); // Ожидание обработки
    }
    
    const updatedInitialBalance = await getUserBalance(testUser.telegram_id);
    const expenseAmount = 50;
    const testOperationId = generateUniqueId();
    
    // 2. Отправка события списания
    await inngest.send({
      name: 'payment/process',
      data: {
        telegram_id: testUser.telegram_id,
        amount: expenseAmount,
        type: 'money_expense',
        description: 'Test money expense',
        bot_name: 'TestBot',
        service_type: ModeEnum.TextGeneration,
        operation_id: testOperationId
      }
    });
    
    // 3. Ожидание обработки
    await wait(1000);
    
    // 4. Проверка результата
    const newBalance = await getUserBalance(testUser.telegram_id);
    const expectedBalance = updatedInitialBalance - expenseAmount;
    
    if (newBalance !== expectedBalance) {
      return {
        success: false,
        message: `Баланс после списания неверен. Ожидалось: ${expectedBalance}, получено: ${newBalance}`,
        name: 'Money Expense Test'
      };
    }
    
    return {
      success: true,
      message: 'Тест списания средств успешно пройден',
      name: 'Money Expense Test'
    };
  } catch (error) {
    return {
      success: false,
      message: `Ошибка в тесте списания: ${error.message}`,
      name: 'Money Expense Test'
    };
  }
}
```

## ⚠️ Типичные ошибки при тестировании платежей

1. **Отсутствие проверки начального баланса**
   - Всегда фиксируйте начальный баланс перед операцией
   - Проверяйте относительное изменение, а не абсолютное значение

2. **Недостаточная проверка дублирующихся транзакций**
   - Всегда используйте уникальный operation_id
   - Тестируйте повторную отправку того же события

3. **Пропуск очистки тестовых данных**
   - Всегда очищайте тестовые данные после тестов
   - Используйте отдельную тестовую среду

4. **Отсутствие тестов edge-cases**
   - Тестируйте граничные значения (0, отрицательные числа)
   - Проверяйте поведение при недостаточном балансе

## 🛠️ Инструменты для тестирования платежей

### InngestTestEngine
Основной инструмент для тестирования Inngest-функций:

```typescript
import { InngestTestEngine } from 'src/test-utils/inngestTestEngine';

// Создание тестового движка
const testEngine = new InngestTestEngine();

// Инициализация с параметрами
await testEngine.init({
  mockEvents: true,
  logLevel: 'info'
});

// Ожидание событий
await testEngine.waitForEvent('payment/processed', {
  timeout: 5000,
  filter: (event) => event.data.telegram_id === testUser.telegram_id
});
```

### Мокирование функций платежной системы
```typescript
// Мок для getUserBalance
const originalGetUserBalance = getUserBalance;
getUserBalance = jest.fn().mockImplementation(async (telegram_id) => {
  if (telegram_id === testUser.telegram_id) {
    return 1000; // Фиксированный баланс для тестов
  }
  return originalGetUserBalance(telegram_id);
});

// Не забудьте восстановить оригинальную функцию после теста
afterAll(() => {
  getUserBalance = originalGetUserBalance;
});
```

## 🔄 Запуск тестов в разных окружениях

### Локальное тестирование
```bash
# Запуск всех тестов платежной системы
npm run test:payment

# Запуск только тестов процессора платежей
npm run test:payment-processor

# Запуск тестов с моками
npm run test:payment-mock
```

### Docker-тестирование
```bash
# Сборка и запуск Docker-контейнера для тестов
docker-compose -f docker-compose.test.yml up --build

# Мониторинг логов тестов
docker logs -f neuro-blogger-telegram-bot-test
```

## 📊 Анализ результатов тестов

### Ключевые метрики для оценки
- **Успешность обработки** - % успешно обработанных транзакций
- **Точность расчета баланса** - соответствие ожидаемого и фактического баланса
- **Время обработки** - скорость выполнения операций
- **Устойчивость к конкурентным запросам** - корректная работа при параллельных операциях

### Интерпретация ошибок
| Ошибка | Возможная причина | Решение |
|--------|-------------------|---------|
| Неверный баланс | Ошибка в функции get_user_balance | Проверить SQL-функцию |
| Дублирование транзакций | Отсутствие проверки на существующие платежи | Добавить проверку по operation_id |
| Timeout при обработке | Высокая нагрузка или блокировка БД | Увеличить таймаут или оптимизировать запросы |
| Ошибка конвертации типов | Несоответствие типов данных | Проверить типы в TypeScript и PostgreSQL |

## 🔒 Безопасность при тестировании платежей

1. **Никогда не используйте реальные данные пользователей в тестах**
2. **Используйте отдельную тестовую базу данных**
3. **Ограничьте доступ к тестовым средам**
4. **Никогда не коммитьте секретные ключи и данные доступа**

## 📈 Мониторинг и логирование тестов

### Формат логов платежных операций
```
🚀 [PAYMENT_START]: Processing payment for user 123456789 | Type: money_income | Amount: 100
✅ [PAYMENT_SUCCESS]: Payment processed successfully | New balance: 1100
```

### Ключевые события для логирования
- 🚀 Начало обработки платежа
- ✅ Успешное завершение
- ❌ Ошибки обработки
- 💰 Информация о балансе
- 🔄 Обновление данных
- 🔍 Валидационные шаги

## 📝 Чеклист для тестирования платежной системы

1. ☐ Тесты для всех типов транзакций
2. ☐ Тесты обработки ошибочных данных
3. ☐ Тесты конкурентных операций
4. ☐ Тесты с моками и без моков
5. ☐ Тесты в разных окружениях (локальное, Docker)
6. ☐ Тесты с различными параметрами
7. ☐ Тесты на дублирование транзакций
8. ☐ Тесты с недостаточным балансом
9. ☐ Тесты ретраев и повторной обработки
10. ☐ Тесты логирования и мониторинга