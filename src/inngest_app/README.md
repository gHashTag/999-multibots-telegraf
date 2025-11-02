# Inngest Functions - Architecture Documentation

## 📁 Directory Structure

```
src/inngest_app/
├── common/                    # Shared utilities and modules
│   ├── index.ts             # Main exports
│   ├── validators.ts        # Zod schemas and validation helpers
│   ├── helpers.ts          # Logging, error handling, utilities
│   ├── services.ts         # Database, HTTP, notification services
│   └── types.ts            # Common type definitions
├── functions/               # All Inngest functions
│   ├── index.ts           # Master index and exports
│   ├── content/           # Content generation functions (6)
│   ├── instagram/         # Instagram integration (2)
│   ├── monitoring/        # System monitoring (2)
│   ├── training/          # Model training (2)
│   ├── generation/        # Content generation (1)
│   ├── payments/          # Payment processing (1)
│   ├── broadcast/         # Message broadcasting (1)
│   ├── render/            # Video rendering (3)
│   ├── existing/          # Template functions (3)
│   ├── test/              # Test functions (1)
│   └── helpers/           # Helper modules
├── inngestClient.ts       # Inngest client configuration
└── registerFunctions.ts   # Function registration
```

## 🚀 Common Modules

### `common/validators.ts`
Centralized Zod schemas for all event types:
- `baseEventSchema` - Common event structure
- `userEventSchema` - User-related events
- `contentGenerationSchema` - Content generation
- `instagramEventSchema` - Instagram events
- And more...

### `common/helpers.ts`
Utility functions and classes:
- `InngestLogger` - Enhanced logging with context
- `InngestFunctionError` - Standardized error handling
- `safeAsync` - Safe async wrapper with error handling
- Validation helpers
- Metadata extraction helpers

### `common/services.ts`
Common service classes:
- `DatabaseService` - Supabase operations
- `HttpService` - External API calls
- `NotificationService` - Webhooks and Telegram
- `CacheService` - Simple in-memory cache
- `EventService` - Inngest event sending

### `common/types.ts`
Shared TypeScript types:
- Event data interfaces
- Result types
- Configuration types
- Error types

## 📊 Function Categories

| Category | Count | Description | Examples |
|----------|-------|-------------|----------|
| **content** | 6 | Content generation and analysis | generateContentScripts, analyzeCompetitorReels |
| **instagram** | 2 | Instagram integration | instagramScraper-v2 |
| **monitoring** | 2 | System monitoring | criticalErrorMonitor |
| **training** | 2 | Model training | modelTrainingV2 |
| **generation** | 1 | Content generation | neuroImageGeneration |
| **payments** | 1 | Payment processing | paymentProcessing |
| **broadcast** | 1 | Message broadcasting | broadcastMessage |
| **render** | 3 | Video rendering | render, renderAvatarVideo |
| **existing** | 3 | Template functions | generateAIReelsFunction |
| **test** | 1 | Testing utilities | testSimpleFunction |

**Total: 22 functions**

## 🔧 Function Structure

Each function follows this pattern:

```typescript
import { inngest } from '@/core/inngest/clients'
import { createInngestLogger, safeAsync } from '@/inngest_app/common'
import { eventSchema } from '@/inngest_app/common'

export const myFunction = inngest.createFunction(
  {
    id: 'my-function',
    name: 'My Function',
    retries: 3,
  },
  { event: 'my.event' },
  async ({ event }) => {
    const { telegramId } = eventSchema.parse(event.data)
    const logger = createInngestLogger('myFunction', telegramId)

    logger.functionStart(event.name, event.data)

    const result = await safeAsync(
      async () => {
        logger.stepStart('my-step')
        const stepResult = await performOperation()
        logger.stepComplete('my-step', { result: stepResult })
        return { success: true, data: stepResult }
      },
      {
        functionName: 'myFunction',
        stepName: 'my-step',
        telegramId,
        context: event.data,
      }
    )

    logger.functionComplete(result)
    return result
  }
)
```

## 📝 Best Practices

### 1. Use Common Modules
Always import from `@/inngest_app/common`:
```typescript
import { createInngestLogger, db, http, notifications } from '@/inngest_app/common'
```

### 2. Structured Logging
Use `InngestLogger` for all logging:
```typescript
const logger = createInngestLogger('FunctionName', telegramId)
logger.info('Message', { context: 'value' })
```

### 3. Error Handling
Use `safeAsync` and `InngestFunctionError`:
```typescript
try {
  return await operation()
} catch (error) {
  throw new InngestFunctionError('Custom error', {
    functionName: 'FunctionName',
    telegramId,
    context,
    cause: error,
  })
}
```

### 4. Database Operations
Use `DatabaseService`:
```typescript
const user = await db.fetchOne('users', { telegramId })
await db.update('users', { telegramId }, { lastActive: new Date() })
```

### 5. External APIs
Use `HttpService`:
```typescript
const response = await http.get('https://api.example.com/data')
await http.post('https://api.example.com/submit', data)
```

### 6. Notifications
Use `NotificationService`:
```typescript
await notifications.sendWebhook(callbackUrl, { success: true })
await notifications.sendTelegramNotification(botToken, chatId, message)
```

## 🧪 Testing

Test functions are in `functions/test/`:
- `testSimpleFunction` - Basic Inngest function test

Run tests:
```bash
npm test -- --testPathPattern=inngest
```

## 📈 Registration

Functions are registered in `registerFunctions.ts`:
```typescript
// Import function
import { myFunction } from './functions/my-category/my-function'

// Add to array
export const allInngestFunctions = [
  // ... other functions
  myFunction,
]
```

## 🔍 Monitoring

Use `criticalErrorMonitor` and `logMonitor` for system monitoring:
- Automatic error detection
- Performance tracking
- Custom alerts

## 📚 Event Names

Event names are defined in `inngestClient.ts`:
```typescript
export const INNGEST_EVENTS = {
  CONTENT_GENERATE: 'content/generate',
  INSTAGRAM_SCRAPER: 'instagram/scraper-v2',
  // ... more events
}
```

## 🚦 Status Tracking

Check registered functions:
```typescript
import { getFunctionStatus } from './registerFunctions'

const status = getFunctionStatus()
console.log(`Total functions: ${status.total}`)
console.log(`Categories: ${JSON.stringify(status.categories, null, 2)}`)
```

## 🔄 Development Workflow

1. Create new function in appropriate category
2. Follow standard structure
3. Use common modules
4. Register in `registerFunctions.ts`
5. Export in `functions/index.ts`
6. Add to master index
7. Test with `testSimpleFunction`

## 📖 Documentation

Each function should have:
- JSDoc comments
- Type definitions
- Example usage
- Error handling documentation

## 🛠️ Utilities

Helper modules in `functions/helpers/`:
- `video-upload-helper.ts` - Supabase video upload
- `wan25-helpers.ts` - WAN 2.5 API integration

## 🎯 Next Steps

1. Migrate all functions to use common modules
2. Add comprehensive tests
3. Implement monitoring dashboards
4. Add performance metrics
5. Create deployment automation

## 📞 Support

For questions or issues:
- Check existing functions for examples
- Review `INNGEST_DEVELOPMENT_RULES.md`
- Use `testSimpleFunction` for testing
