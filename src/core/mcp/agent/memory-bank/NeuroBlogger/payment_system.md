# Платежная система NeuroBlogger

## Общая архитектура

Платежная система NeuroBlogger построена на следующих принципах:
1. Централизованная обработка всех платежей через Inngest функцию
2. Динамический расчет баланса из записей платежей
3. Отсутствие постоянного поля баланса в таблице пользователей
4. Строгое разделение типов транзакций

## Ключевые компоненты

### 1. SQL-функция get_user_balance

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

-- Get the sum of all transactions for the user
-- IMPORTANT: here the calculation is made ONLY based on the payment_method records != 'system'
-- This prevents duplication and incorrect balance calculation
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

### 2. Обработчик платежей (paymentProcessor.ts)

Центральный процессор обработки всех платежных операций:
- Получает события payment/process
- Проверяет существующие платежи
- Обрабатывает транзакции
- Обновляет записи в базе данных

### 3. Таблица payments_v2

Структура таблицы для хранения всех платежных операций:
- telegram_id: ID пользователя в Telegram
- amount: сумма операции (всегда положительное число)
- stars: количество "звезд" (внутренняя валюта)
- type: тип транзакции (money_income, money_expense и т.д.)
- status: статус транзакции (COMPLETED, PENDING и т.д.)
- payment_method: метод оплаты
- operation_id: уникальный ID операции
- inv_id: ID инвойса
- description: описание операции
- created_at: дата и время создания записи

## Правила обработки платежей

1. **НИКОГДА** не менять SQL-функцию `get_user_balance` без тщательного тестирования
2. **НИКОГДА** не создавать дополнительные записи при обработке платежей с `payment_method='system'`
3. **ВСЕГДА** использовать только одну запись в `payments_v2` на транзакцию
4. **ВСЕГДА** проверять наличие существующего платежа по полям `operation_id` или `inv_id`

## Типы транзакций

1. **money_income** - пополнение баланса (положительное значение)
2. **money_expense** - списание средств (отрицательное значение)
3. **subscription_purchase** - покупка подписки
4. **subscription_renewal** - продление подписки
5. **refund** - возврат средств
6. **bonus** - начисление бонуса
7. **referral** - реферальное начисление
8. **system** - системная операция

## Правильное использование платежного процессора

### Списание средств
```typescript
await inngest.send({
  name: 'payment/process',
  data: {
    telegram_id: user.telegram_id,
    amount: cost, // Положительное число
    type: 'money_expense',
    description: 'Оплата за услугу',
    bot_name: 'mybot',
    service_type: ModeEnum.TextToVideo
  }
})
```

### Пополнение баланса
```typescript
await inngest.send({
  name: 'payment/process',
  data: {
    telegram_id: user.telegram_id,
    amount: amount, // Положительное число
    type: 'money_income',
    description: 'Пополнение баланса',
    bot_name: 'mybot',
    service_type: ModeEnum.TopUpBalance
  }
})
```

## Запрещенные действия

1. Отрицательные значения в полях amount или stars
2. Прямые SQL-запросы для изменения баланса
3. Обход централизованного процессора платежей
4. Отсутствие service_type в параметрах
5. Неправильное использование типов операций

## Обнаружение и решение проблем

- **Дублирование транзакций**: Проверить существующие платежи по `operation_id` или `inv_id`
- **Неправильный расчет баланса**: Проверить SQL-функцию `get_user_balance`
- **Двойное списание**: Проверить наличие вызовов `updateUserBalance` после создания платежа