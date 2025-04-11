# Платежная система

Документация платежной системы проекта NeuroBlogger. В данном документе описаны все ключевые аспекты работы с платежами, балансом пользователей и тестированием платежной функциональности.

## Содержание

1. [Архитектура платежной системы](#архитектура-платежной-системы)
2. [Типизация и интерфейсы](#типизация-и-интерфейсы)
3. [Процесс обработки платежей](#процесс-обработки-платежей)
4. [Уведомления о платежах](#уведомления-о-платежах)
5. [Хранение и расчет баланса](#хранение-и-расчет-баланса)
6. [Тестирование платежной системы](#тестирование-платежной-системы)
7. [Примеры использования](#примеры-использования)
8. [Возможные ошибки и их решение](#возможные-ошибки-и-их-решение)

## Архитектура платежной системы

Платежная система построена на основе централизованного процессора платежей, который обрабатывает все транзакции через Inngest-функции.

### Ключевые компоненты:

1. **Платежный процессор** (`src/inngest-functions/paymentProcessor.ts`) - централизованная функция обработки всех платежей.
2. **Расчет баланса** (`src/core/supabase/getUserBalance.ts`) - функции получения и инвалидации кэша баланса.
3. **Создание платежей** (`src/core/supabase/createSuccessfulPayment.ts`) - функция создания записей о платежах.
4. **Уведомления** (`src/helpers/sendTransactionNotification.ts`) - функции отправки уведомлений о платежах.

### Диаграмма процесса платежа:

```
[Сервис/Бот] --> [Inngest Event] --> [Платежный процессор] --> [Запись в БД + Уведомление]
```

## Типизация и интерфейсы

### Основные типы платежной системы

```typescript
// Параметры для события обработки платежа (PaymentProcessParams)
interface PaymentProcessParams {
  telegram_id: string;        // ID пользователя в Telegram
  amount: number;             // Сумма операции (ВСЕГДА положительное число)
  stars?: number;             // Количество звезд (ВСЕГДА положительное число)
  type: TransactionType;      // Тип транзакции (MONEY_INCOME, MONEY_EXPENSE, etc.)
  description: string;        // Описание транзакции
  bot_name: string;           // Название бота, инициировавшего транзакцию
  inv_id?: string;            // ID инвойса для предотвращения дублирования
  metadata?: Record<string, any>; // Дополнительные метаданные
  service_type: ModeEnum;     // Тип сервиса
}

// Результат обработки платежа (PaymentProcessResult)
interface PaymentProcessResult {
  success: boolean;           // Успешность операции
  payment: {                  // Данные созданного платежа
    payment_id: number;
    telegram_id: string;
    amount: number;
    stars: number;
    type: string;
    status: string;
    [key: string]: any;
  };
  balanceChange: {            // Информация об изменении баланса
    before: number;           // Баланс до операции
    after: number;            // Баланс после операции
    difference: number;       // Разница в балансе
  };
  error?: string;             // Сообщение об ошибке (если есть)
}

// Типы транзакций
enum TransactionType {
  MONEY_INCOME = 'money_income',           // Пополнение баланса
  MONEY_EXPENSE = 'money_expense',         // Списание средств
  SUBSCRIPTION_PAYMENT = 'subscription_payment', // Оплата подписки
  SUBSCRIPTION_PURCHASE = 'subscription_purchase', // Покупка подписки
  SUBSCRIPTION_RENEWAL = 'subscription_renewal',  // Продление подписки
  REFUND = 'refund',                       // Возврат средств
  BONUS = 'bonus',                         // Бонусное начисление
  REFERRAL = 'referral',                   // Реферальное начисление
  TRANSFER = 'transfer',                   // Перевод средств
  SYSTEM = 'system',                       // Системная операция
}
```

## Процесс обработки платежей

### Шаги обработки платежа:

1. **Получение параметров** - платежный процессор получает параметры транзакции.
2. **Валидация данных** - проверка корректности суммы и других параметров.
3. **Проверка баланса** - для списания проверяется достаточность средств.
4. **Создание записи о платеже** - запись транзакции в базу данных.
5. **Инвалидация кэша баланса** - сброс кэша для получения актуального баланса.
6. **Отправка уведомления** - уведомление пользователя о транзакции.

### Важные правила:

- Суммы `amount` и `stars` **ВСЕГДА** должны быть положительными числами
- Направление транзакции определяется **ТОЛЬКО** типом (`MONEY_INCOME`/`MONEY_EXPENSE`), а не знаком суммы
- Каждая транзакция логируется с эмодзи для наглядности (`💰`, `⭐️`, `📨`, etc.)
- Перед списанием обязательно проверяется достаточность баланса
- Уведомления отправляются только для продуктовой среды, не в локальной разработке

## Уведомления о платежах

Уведомления отправляются через функцию `sendTransactionNotification`, которая:

1. Подключается к нужному боту через `createBotByName`
2. Форматирует сообщение с информацией о:
   - ID транзакции
   - Сумме операции
   - Старом балансе
   - Новом балансе
3. Отправляет форматированное сообщение пользователю
4. Логирует результат отправки

Пример сообщения уведомления:
```
ID: f7c5e8d9-1234-5678-9abc-def012345678
Сумма: 50 ⭐️
Старый баланс: 100 ⭐️
Новый баланс: 150 ⭐️
```

## Хранение и расчет баланса

Баланс пользователя рассчитывается динамически на основе записей в таблице `payments_v2` с помощью SQL-функции `get_user_balance`:

```sql
CREATE OR REPLACE FUNCTION public.get_user_balance(user_telegram_id text)
RETURNS numeric
LANGUAGE plpgsql
AS $function$
DECLARE
v_balance numeric := 0;
v_user_id bigint;
BEGIN
  -- Convert telegram_id to numeric format
  BEGIN
    v_user_id := user_telegram_id::bigint;
  EXCEPTION WHEN OTHERS THEN
    RETURN 0;
  END;

  -- Get sum of all transactions for the user
  SELECT COALESCE(SUM(
    CASE WHEN p.status = 'COMPLETED' THEN
      CASE
        WHEN p.type = 'money_income' THEN COALESCE(p.stars, 0)
        WHEN p.type = 'money_expense' THEN -COALESCE(ABS(p.stars), 0)
        ELSE 0
      END
    ELSE 0 END
  ), 0) INTO v_balance
  FROM payments_v2 p
  WHERE p.telegram_id = v_user_id
  AND p.payment_method != 'system';

  RETURN v_balance;
END;
$function$
```

Для оптимизации производительности используется кэширование баланса с инвалидацией после каждой транзакции.

## Тестирование платежной системы

Платежная система включает набор тестов для проверки различных сценариев:

### Тесты платежного процессора

1. **`testPaymentNotification`** - проверка отправки уведомлений о платежах
2. **`testBalanceTopUp`** - проверка пополнения баланса
3. **`testBalanceDebit`** - проверка списания средств
4. **`testInsufficientBalance`** - проверка поведения при недостаточном балансе
5. **`testRealPaymentNotification`** - комплексная проверка уведомлений с реальными мок-объектами

### Запуск тестов

```bash
# Запуск всех тестов платежной системы
npm run test:payment

# Запуск тестов платежного процессора
npm run test:payment-processor

# Запуск тестов уведомлений о платежах
npm run test:payment-notification
```

### Структура тестов

Тесты находятся в директории `src/test-utils/tests/payment/` и следуют общему паттерну:

1. Создание тестового пользователя
2. Подготовка моков для функций (если требуется)
3. Имитация операции с балансом
4. Проверка результатов
5. Очистка тестовых данных

## Примеры использования

### Корректный способ обработки платежа

```typescript
import { inngest } from '@/inngest-functions/clients'
import { TransactionType } from '@/interfaces/payments.interface'
import { ModeEnum } from '@/price/helpers/modelsCost'

// Пополнение баланса
await inngest.send({
  name: 'payment/process',
  data: {
    telegram_id: userId,
    amount: 100, // ВСЕГДА положительное число
    type: TransactionType.MONEY_INCOME,
    description: 'Пополнение баланса',
    bot_name: botName,
    service_type: ModeEnum.TopUpBalance
  }
})

// Списание средств
await inngest.send({
  name: 'payment/process',
  data: {
    telegram_id: userId,
    amount: 50, // ВСЕГДА положительное число
    type: TransactionType.MONEY_EXPENSE,
    description: 'Оплата услуги',
    bot_name: botName,
    service_type: ModeEnum.NeuroPhoto
  }
})
```

### Получение баланса пользователя

```typescript
import { getUserBalance } from '@/core/supabase/getUserBalance'

// Получение баланса пользователя
const balance = await getUserBalance(userId)
console.log(`Текущий баланс: ${balance} звезд`)

// Инвалидация кэша баланса (при необходимости)
import { invalidateBalanceCache } from '@/core/supabase/getUserBalance'
invalidateBalanceCache(userId)
```

## Возможные ошибки и их решение

### Проблема: Баланс не обновляется после транзакции

**Причина:** Не была выполнена инвалидация кэша баланса.

**Решение:** Всегда инвалидировать кэш баланса после создания платежа:
```typescript
invalidateBalanceCache(telegram_id)
```

### Проблема: Дублирование платежей

**Причина:** Не проверяется уникальность инвойса.

**Решение:** Всегда передавать уникальный `inv_id` для каждой транзакции:
```typescript
const inv_id = uuidv4() // Генерация уникального ID
```

### Проблема: Не приходят уведомления о платежах

**Причина:** Ошибка в конфигурации бота или локальное окружение.

**Решение:** 
1. Проверить создание бота через `createBotByName`
2. Убедиться, что `isDev` корректно определяет окружение
3. Запустить тесты уведомлений о платежах для изоляции проблемы 