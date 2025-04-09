# Payment Processing Rules 💰

## Basic Principles

1. All payments MUST go through the centralized processor `payment/process`
2. Direct balance updates to the database are NOT ALLOWED

## Required fields when sending payment/process

```typescript
{
telegram_id: string,
amount: number, // ALWAYS a positive number
stars?: number, // ALWAYS a positive number (if specified)
type: TransactionType, // Transaction Type
description: string, // Transaction Description
bot_name: string, // Bot Name
service_type: ModeEnum // Service Type from ModeEnum
}
```

## Transaction Types

- `money_expense` - Withdrawal of funds
- `money_income` - Balance replenishment
- `subscription_purchase` - Subscription purchase
- `subscription_renewal` - Subscription renewal
- `refund` - Refund of funds
- `bonus` - Bonus accrual
- `referral` - Referral accrual
- `system` - System operation

## ⚠️ Important rules

1. `amount` and `stars` values ​​must ALWAYS be positive
2. The operation type is determined by the `type` field, NOT by the number sign
3. `service_type` MUST be specified from `ModeEnum`
4. All write-offs must pass balance check
5. All operations must be logged

## Examples of correct use

### Write-off of funds

```typescript
await inngest.send({
  name: 'payment/process',
  data: {
    telegram_id: user.telegram_id,
    amount: cost, // Positive number
    type: 'money_expense',
    description: 'Payment for service',
    bot_name: 'mybot',
    service_type: ModeEnum.TextToVideo,
  },
})
```

### Balance replenishment

```typescript
await inngest.send({
  name: 'payment/process',
  data: {
    telegram_id: user.telegram_id,
    amount: amount, // Positive number
    type: 'money_income',
    description: 'Balance replenishment',
    bot_name: 'mybot',
    service_type: ModeEnum.TopUpBalance,
  },
})
```

## ❌ Forbidden

1. Negative values ​​in `amount` or `stars`
2. Direct SQL queries to change balance
3. Bypassing centralized payment processor
4. Missing service type (`service_type`)
5. Incorrect use of operation types

## 📝 Logging

All operations with payments must be logged using emoji:

- 🚀 Payment processing started
- ✅ Successful completion
- ❌ Error
- 💰 Balance information
- 🔄 Updating data
