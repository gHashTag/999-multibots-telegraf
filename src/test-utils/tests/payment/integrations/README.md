# Payment Integration Tests 🔌

## Overview
Integration tests verify external payment system connections:
- Robokassa integration
- RU Payment system
- Payment notifications
- Error handling

## Test Files
- `robokassa.test.ts` - Robokassa payment gateway tests
- `ru-payment.test.ts` - RU payment system tests
- `notification.test.ts` - Payment notification tests

## Running Tests
```bash
npm run test:payment:integrations
```

## Test Data Format
```typescript
interface IntegrationTest {
  provider: PaymentProvider;
  test_type: TestType;
  mock_data: Record<string, any>;
  expected_response: any;
}
```

## Important Notes
- Use mock external services
- Test error scenarios
- Verify notifications
- Clean up test data
- Follow logging standards
- Handle timeouts properly 