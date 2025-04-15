# Payment System Tests 🧪

## Structure 📁

```
payment/
├── core/           # Core payment functionality tests
├── features/       # Feature-specific tests
├── integrations/   # Integration tests with payment providers
└── utils/         # Test utilities and helpers
```

## Running Tests 🚀

```bash
# Run all payment tests
npm run test:payment

# Run specific test categories
npm run test:payment:core
npm run test:payment:features
npm run test:payment:integrations
```

## Test Categories 📊

### Core Tests
- Basic payment processing
- Balance calculations
- Transaction validation

### Feature Tests
- Subscription handling
- Refund processing
- Bonus system

### Integration Tests
- RU Payment integration
- Robokassa integration

### Utility Tests
- Test structure validation
- Helper functions

## Logging 📝

All tests use standardized logging with emojis:
- ℹ️ Information
- ✅ Success
- ❌ Error
- 🚀 Start
- 🏁 Complete
- 🔍 Validation
- ⚡ Events
- 🎯 Test Cases
- 🔄 Retries
- 💾 Data Operations

## Contributing 🤝

1. Place tests in appropriate directories
2. Follow naming convention: `*.test.ts`
3. Include proper error handling
4. Use standardized logging
5. Clean up test data after tests

## Important Notes ⚠️

- Tests are isolated using InngestTestEngine
- Each test must clean up its data
- No direct API calls allowed
- All operations must be logged 