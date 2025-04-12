# Платежная система NeuroBlogger (Детальная документация)

## Обзор

Платежная система обеспечивает обработку различных типов транзакций, включая пополнение счета, списание средств, покупку подписок и платный доступ к функциям. Все транзакции проходят через централизованный платежный процессор, который обеспечивает консистентность и надежность операций.

## Основные компоненты

1. **Платежный процессор** - централизованная служба обработки платежей через Inngest
2. **Функции работы с балансом** - API для проверки и обновления баланса пользователя
3. **Система уведомлений** - отправка уведомлений пользователям о транзакциях
4. **Логирование транзакций** - подробное журналирование всех операций с балансом

## Типы транзакций

| Тип | Описание | Направление |
|-----|----------|------------|
| `money_income` | Пополнение баланса | Положительное |
| `money_expense` | Списание средств | Отрицательное |
| `subscription_purchase` | Покупка подписки | Отрицательное |
| `subscription_renewal` | Продление подписки | Отрицательное |
| `refund` | Возврат средств | Положительное |
| `bonus` | Бонусное начисление | Положительное |
| `referral` | Реферальная программа | Положительное |
| `system` | Системная операция | Зависит от операции |

## Параметры обработки платежа

```typescript
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
2. Отправляет уведомление пользователю о транзакции
3. Включает в уведомление информацию о текущем и новом балансе, а также описание транзакции

## Интеграция с SelectModelWizard

### Обзор

SelectModelWizard интегрирован с платежной системой для обеспечения платного доступа к премиальным моделям. Интеграция позволяет:

1. Маркировать определенные модели как платные (⭐)
2. Проверять баланс пользователя перед выбором платной модели
3. Списывать средства при выборе платной модели
4. Уведомлять пользователя о состоянии транзакции

### Настройка платных моделей

Платные модели конфигурируются в массиве `PAID_MODELS` в файле `src/scenes/selectModelWizard/index.ts`:

```typescript
const PAID_MODELS: PaidModelConfig[] = [
  { name: 'GPT-4', price: 10, isPremium: true },
  { name: 'Claude-3', price: 15, isPremium: true },
  { name: 'Gemini Pro', price: 8, isPremium: true },
  // Другие платные модели можно добавить сюда
]
```

## SQL функция для расчета баланса

### get_user_balance - ОСНОВНАЯ ФУНКЦИЯ РАСЧЕТА БАЛАНСА! ⚠️

```sql
CREATE OR REPLACE FUNCTION public.get_user_balance(user_telegram_id text)
 RETURNS numeric
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_balance numeric := 0;
    v_user_id bigint;
BEGIN
    -- Преобразуем telegram_id в числовой формат
    BEGIN
        v_user_id := user_telegram_id::bigint;
    EXCEPTION WHEN OTHERS THEN
        RETURN 0;
    END;

    -- Получаем сумму всех транзакций для пользователя
    -- ВАЖНО: расчет производится ТОЛЬКО на основе записей payment_method != 'system'
    -- Это предотвращает дублирование и некорректный расчет баланса
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

## Правила работы с платежной системой

1. **НИКОГДА** не изменяйте SQL-функцию `get_user_balance` без тщательного тестирования
2. **НИКОГДА** не создавайте дополнительные записи при обработке платежей с `payment_method='system'`
3. **ВСЕГДА** используйте только одну запись о платеже в `payments_v2` на одну транзакцию
4. **ВСЕГДА** проверяйте наличие существующего платежа через `operation_id` или `inv_id`
5. **ВСЕГДА** используйте `payment/process` событие для обработки платежей
6. **НИКОГДА** не изменяйте баланс пользователя напрямую в базе данных

## Примеры использования

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

## Архитектура системы оплаты

1. **Создание платежа**:
   - Основной файл: `/src/inngest-functions/paymentProcessor.ts` 
   - Метод создания записи о платеже: `createSuccessfulPayment`
   - Не использует `updateUserBalance`, который создает дублирующие записи

2. **Обработка платежа**:
   - Баланс рассчитывается динамически из `payments_v2`
   - Используется SQL-функция `get_user_balance` для получения баланса
   - Не хранится постоянное поле баланса в таблице `users`

3. **Проверка баланса**:
   - Через функцию `/src/core/supabase/getUserBalance.ts`
   - Внутри использует SQL-функцию `get_user_balance`

## Решение проблем

- **Дублирование транзакций**: Проверять существующие платежи по `operation_id` или `inv_id`
- **Неправильный расчет баланса**: Проверить SQL-функцию `get_user_balance`
- **Двойное списание**: Проверить отсутствие вызовов `updateUserBalance` после создания платежа