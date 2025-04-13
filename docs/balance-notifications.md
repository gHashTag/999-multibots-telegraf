# Balance Notification System

This document describes the balance notification system that automatically checks user balances and sends notifications when they fall below a specified threshold.

## Overview

The balance notification system consists of several components:

1. **BalanceNotifierService**: Core service that handles the logic for checking balances and sending notifications
2. **BalanceNotifierScene**: Telegram scene for user interaction with notification settings
3. **Scheduled Task**: Daily job that automatically triggers balance checks for all users

## How It Works

### Scheduled Task

The balance notification system runs as a scheduled task once per day (at 12:00 UTC) using Inngest:

```typescript
// in src/inngest-functions/balanceNotifier.ts
export const balanceNotifierScheduledTask = inngest.createFunction(
  { id: "balance-notifier-scheduled-task" },
  { cron: "0 12 * * *" }, // Every day at 12:00 UTC
  async ({ step }) => {
    // Check balances for all bots
  }
);
```

This task iterates through all configured bots and checks the balances for all users of each bot.

### Balance Checking Logic

The core logic for checking balances is in the `BalanceNotifierService`:

1. Retrieves all users for a specific bot
2. For each user:
   - Gets their current balance
   - Gets their notification settings
   - Determines if a notification should be sent
   - Sends a notification if required

### Notification Criteria

A notification is sent if these conditions are met:

1. User has enabled balance notifications
2. Current balance is below the notification threshold
3. User hasn't been notified recently (to prevent spam)

## Configuration

### User Settings

Users can configure their notification preferences:

- **Enabled/Disabled**: Toggle notifications on/off
- **Threshold**: The balance level that triggers a notification
- **Language**: Notification language preference

These settings are stored in the `user_settings` table in Supabase.

### System Configuration

The notification system has several configurable parameters:

- **Notification Frequency**: Controlled by cache TTL in `BalanceNotifierService`
- **Schedule**: Defined in the cron expression in `balanceNotifier.ts`
- **Bot List**: Configured in the scheduler function

## Testing

### Manual Testing

You can manually trigger a balance check for testing:

```typescript
// Test for a specific bot
await BalanceNotifierService.checkAllUsersBalances('main');

// Test for a specific user
await BalanceNotifierService.checkAndNotifyUser(userId, 'main');
```

#### API для ручной проверки баланса

Добавлен REST API эндпоинт для проверки баланса отдельного пользователя администратором:

```
POST /api/admin/check-balance
Headers:
  - x-admin-token: <ADMIN_API_TOKEN>
Body:
  {
    "userId": "12345",
    "botName": "main",
    "force": false
  }
```

Параметры:
- `userId` (обязательный) - ID пользователя в базе данных
- `botName` (опциональный) - Имя бота для отправки уведомления (по умолчанию "main")
- `force` (опциональный) - Если true, отправить уведомление даже если баланс выше порога

Пример успешного ответа:
```json
{
  "success": true,
  "result": {
    "checked": true,
    "notified": true,
    "balance": 5,
    "threshold": 10,
    "force_requested": false
  }
}
```

Для доступа к API необходим токен, который устанавливается в переменной окружения `ADMIN_API_TOKEN`.

#### Проверка отдельного пользователя программно

Для программной проверки баланса конкретного пользователя можно использовать метод `checkUserBalanceById`:

```typescript
const result = await BalanceNotifierService.checkUserBalanceById('user-uuid', 'main');
console.log(result);
// { checked: true, notified: true, balance: 5, threshold: 10 }
```

### Automated Tests

The system includes automated tests in `src/test-utils/tests/inngest/balanceNotifier.test.ts` that verify:

1. The scheduled function runs successfully
2. Proper user balance checking occurs
3. Notifications are sent appropriately
4. Error handling works as expected

## Troubleshooting

### Common Issues

- **No notifications sent**: Check user settings, balance thresholds, and the notification history cache
- **Scheduler not running**: Verify Inngest configuration and logs
- **Error logs**: Check for database connection issues or Telegram API errors

### Debugging

To enable debug logging, set `DEBUG=true` in your environment variables. This will output detailed information about:

- Which users are being checked
- Current balance values
- Notification decisions
- API responses

## Architecture

```
┌─────────────────┐     ┌───────────────────────┐     ┌─────────────────┐
│  Inngest Cron   │────►│BalanceNotifierService │────►│  Supabase DB    │
│  (Daily Task)   │     │                       │     │ (User Balances)  │
└─────────────────┘     └───────────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │   Telegram API  │
                        │ (Notifications) │
                        └─────────────────┘
```

## Future Enhancements

Planned improvements:

- Dynamic scheduling configuration
- Additional notification channels (email, SMS)
- Smart notification frequency based on usage patterns
- Enhanced notification templates with payment options
- Balance prediction and proactive notifications 