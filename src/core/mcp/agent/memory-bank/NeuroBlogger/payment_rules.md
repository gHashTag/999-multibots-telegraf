# Правила обработки платежей 💰

## Основные принципы

1. Все платежи **ДОЛЖНЫ** проходить через централизованный процессор `payment/process`
2. Прямое обновление баланса в базе данных **СТРОГО ЗАПРЕЩЕНО**

## Обязательные поля при отправке payment/process

```typescript
{
telegram_id: string,
amount: number, // ВСЕГДА положительное число
stars?: number, // ВСЕГДА положительное число (если указано)
type: TransactionType, // Тип транзакции
description: string, // Описание транзакции
bot_name: string, // Имя бота
service_type: ModeEnum // Тип сервиса из ModeEnum
}
```

## Типы транзакций

- `money_expense` - Списание средств
- `money_income` - Пополнение баланса
- `subscription_purchase` - Покупка подписки
- `subscription_renewal` - Продление подписки
- `refund` - Возврат средств
- `bonus` - Начисление бонуса
- `referral` - Реферальное начисление
- `system` - Системная операция

## ⚠️ Важные правила

1. Значения полей `amount` и `stars` **ВСЕГДА** должны быть положительными
2. Тип операции определяется полем `type`, **НЕ** знаком числа
3. Поле `service_type` **ОБЯЗАТЕЛЬНО** должно быть указано из перечисления `ModeEnum`
4. Все списания должны проходить проверку баланса
5. Все операции должны логироваться

## Примеры правильного использования

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

## ❌ Запрещенные действия

1. Отрицательные значения в полях `amount` или `stars`
2. Прямые SQL-запросы для изменения баланса
3. Обход централизованного процессора платежей
4. Отсутствие типа сервиса (`service_type`)
5. Неправильное использование типов операций

## 📝 Логирование

Все операции с платежами должны логироваться с использованием эмодзи:
- 🚀 Начало обработки платежа
- ✅ Успешное завершение
- ❌ Ошибка
- 💰 Информация о балансе
- 🔄 Обновление данных

## Проверка баланса

Для проверки баланса пользователя используйте функцию:

```typescript
import { getUserBalance } from '@/core/supabase/getUserBalance';

const balance = await getUserBalance(telegram_id);
```

Эта функция использует SQL-функцию `get_user_balance` для получения актуального баланса пользователя на основе записей в таблице `payments_v2`.

## Обработка ошибок

Все платежные операции должны обрабатывать потенциальные ошибки:

```typescript
try {
  await inngest.send({
    name: 'payment/process',
    data: {
      // ... платежные данные ...
    }
  });
} catch (error) {
  console.error('❌ Ошибка при обработке платежа:', error);
  // Обработка ошибки
}
```

## Проверка существующих платежей

Перед созданием нового платежа всегда проверяйте наличие существующего платежа с таким же `operation_id` или `inv_id`:

```typescript
const { data: existingPayment } = await supabase
  .from('payments_v2')
  .select('*')
  .eq('operation_id', operation_id)
  .single();

if (existingPayment) {
  // Платеж уже существует, дальнейшая обработка не требуется
  return existingPayment;
}
```

## Уведомления о платежах

После успешной обработки платежа отправляйте уведомление пользователю:

```typescript
await sendTransactionNotification({
  telegram_id: user.telegram_id,
  payment: createdPayment,
  balance: {
    before: previousBalance,
    after: newBalance,
    difference: balanceDifference
  },
  bot_name: bot_name
});
```