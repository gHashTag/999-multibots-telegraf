# Документация: Таблица `payments_v2`

Этот документ описывает структуру и назначение таблицы `payments_v2`, используемой для хранения информации обо всех финансовых транзакциях в системе.

**Важно:** Эта таблица заменила устаревшую таблицу `payments`. Весь новый код должен использовать `payments_v2`.

## Структура таблицы (Основные поля)

| Поле             | Тип                         | Описание                                                             | Пример                  | Примечания                                  |
| :--------------- | :-------------------------- | :------------------------------------------------------------------- | :---------------------- | :------------------------------------------ |
| `id`             | `uuid`                      | Уникальный идентификатор записи (Primary Key)                        |                         | Генерируется автоматически                  |
| `inv_id`         | `bigint`                    | Идентификатор инвойса (например, от Robokassa). Уникальный.          | `777002`                | Используется для связи с внешними системами |
| `telegram_id`    | `text`                      | ID пользователя в Telegram.                                          | `'144022504'`           | Связь с таблицей `users` (по `telegram_id`) |
| `bot_name`       | `text`                      | Имя бота, через которого прошла операция.                            | `'ai_koshey_bot'`       |                                             |
| `amount`         | `numeric`                   | Сумма операции в основной валюте (например, RUB).                    | `10.00`                 |                                             |
| `stars`          | `integer`                   | Эквивалент суммы в звездах (если применимо).                         | `6`                     | Может быть `NULL`                           |
| `currency`       | `text`                      | Код валюты (ISO 4217).                                               | `'RUB'`                 |                                             |
| `status`         | `payment_status` (enum)     | Текущий статус платежа.                                              | `'PENDING'`             | См. Enum `PaymentStatus` ниже.              |
| `type`           | `payment_type` (enum)       | Тип операции.                                                        | `'money_income'`        | См. Enum `PaymentType` ниже.                |
| `payment_method` | `text`                      | Метод оплаты.                                                        | `'Robokassa'`           | `'Telegram'`, `'Manual'`, `'System'` и др.  |
| `description`    | `text`                      | Описание операции.                                                   | `'Пополнение баланса'`  |                                             |
| `metadata`       | `jsonb`                     | Дополнительные данные в формате JSON.                                | `{"shp_item": "stars"}` |                                             |
| `created_at`     | `timestamp with time zone`  | Время создания записи.                                               |                         | Устанавливается автоматически               |
| `updated_at`     | `timestamp with time zone`  | Время последнего обновления записи.                                  |                         | Обновляется автоматически                   |
| `subscription`   | `subscription_type` (enum?) | Тип подписки, если платеж связан с ней.                              | `'neurobase'`           | Может быть `NULL`                           |
| `user_id`        | `uuid`                      | Внешний ключ на таблицу `users` (поле `id`).                         |                         | Обеспечивает целостность данных             |
| `level`          | `integer` ?                 | Уровень пользователя на момент операции (нужно уточнить наличие/тип) |                         |                                             |
| `service_type`   | `mode_enum` (enum?)         | Тип сервиса/режима, за который оплата (если применимо).              | `'neuro_photo_v2'`      |                                             |
| `operation_id`   | `text` ?                    | Уникальный ID операции внутри системы (нужно уточнить)               |                         |                                             |
| `payment_id`     | `bigint` ?                  | Возможно, дублирует `id` или `inv_id` (нужно уточнить)               |                         |                                             |

_Примечание: Поля, отмеченные `?`, требуют уточнения их наличия, точного типа и назначения в текущей схеме._

## Enum: `PaymentStatus`

Определяет возможные статусы платежа. Используется в поле `status`.

```typescript
// Определен в: src/interfaces/payments.interface.ts
export enum PaymentStatus {
  PENDING = 'PENDING', // Ожидает подтверждения/оплаты
  COMPLETED = 'COMPLETED', // Успешно завершен
  FAILED = 'FAILED', // Не удался
  CANCELLED = 'CANCELLED', // Отменен пользователем или системой
}
```

## Enum: `PaymentType`

Определяет тип финансовой операции. Используется в поле `type`.

```typescript
// Определен в: src/interfaces/payments.interface.ts
export enum PaymentType {
  MONEY_INCOME = 'money_income', // Поступление средств (например, пополнение баланса)
  MONEY_EXPENSE = 'money_expense', // Списание средств (например, оплата услуги)
  SUBSCRIPTION_PURCHASE = 'subscription_purchase', // Покупка новой подписки
  SUBSCRIPTION_RENEWAL = 'subscription_renewal', // Продление существующей подписки
  REFUND = 'refund', // Возврат средств
  BONUS = 'bonus', // Начисление бонусов
  REFERRAL = 'referral', // Реферальное начисление
  SYSTEM = 'system', // Системная операция (корректировка и т.п.)
}
```

**Важно для Robokassa:** При обработке вебхука пополнения баланса используйте тип `PaymentType.MONEY_INCOME` (`'money_income'`).

## Ключи Supabase

- **`SUPABASE_URL`**: URL вашего проекта Supabase.
- **`SUPABASE_KEY`**: **Анонимный (публичный)** ключ Supabase. Используется для инициализации клиента Supabase в тестах или на клиенте (если необходимо). **Не** `SUPABASE_ANON_KEY`!
- **`SUPABASE_SERVICE_KEY` / `SUPABASE_SERVICE_ROLE_KEY`**: Ключи с повышенными правами для серверных операций. Используются в основном коде (`src/core/supabase/client.ts`) для создания `supabase` и `supabaseAdmin` клиентов.

Убедитесь, что все необходимые ключи присутствуют в вашем `.env` файле.
