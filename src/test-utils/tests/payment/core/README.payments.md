# Core Payment Tests 💰

## Overview
Core tests cover fundamental payment system functionality:
- Payment processing
- Balance calculations 
- Transaction validation
- Error handling

## Test Files
- `paymentProcessor.test.ts` - Core payment processing tests
- `balance.test.ts` - Balance calculation tests
- `validation.test.ts` - Transaction validation tests

## Running Tests
```bash
npm run test:payment:core
```

## Test Data Format
```typescript
interface TestPayment {
  telegram_id: string;
  amount: number;
  type: PaymentType;
  description: string;
  bot_name: string;
}
```

## Important Notes
- All tests use InngestTestEngine
- Clean up test data after each test
- Follow standard logging format
- Handle all edge cases 