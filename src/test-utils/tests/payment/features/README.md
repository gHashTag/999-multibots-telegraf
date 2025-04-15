# Payment Features Tests 🎯

## Overview
Feature tests cover specific payment system capabilities:
- Subscription handling
- Refund processing
- Bonus calculations
- Special offers

## Test Files
- `subscription.test.ts` - Subscription management tests
- `refund.test.ts` - Refund processing tests
- `bonus.test.ts` - Bonus system tests

## Running Tests
```bash
npm run test:payment:features
```

## Test Data Format
```typescript
interface TestFeature {
  telegram_id: string;
  feature_type: FeatureType;
  params: Record<string, any>;
  expected_result: any;
}
```

## Important Notes
- Tests are isolated from core functionality
- Use mock data for external services
- Follow standard logging format
- Clean up feature-specific data 