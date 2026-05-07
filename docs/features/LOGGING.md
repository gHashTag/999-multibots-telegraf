# Logging System

This project uses a professional logging system with structured logging, log rotation, and error tracking.

## Features

- **Structured Logging**: All logs are in JSON format with consistent fields
- **Log Rotation**: Daily rotation with automatic cleanup (14 days retention)
- **Correlation IDs**: Track requests across different services
- **Error Context**: Detailed error information with user context
- **Security Logging**: Separate log stream for security events

## Log Levels

- `debug`: Development debugging information
- `info`: General application events
- `warn`: Warning conditions and security events  
- `error`: Error conditions requiring attention

## Log Files

- `logs/app-YYYY-MM-DD.log`: All application logs (info level and above)
- `logs/error-YYYY-MM-DD.log`: Error logs only
- `logs/security-YYYY-MM-DD.log`: Security-related events

## Usage

### Basic Logging

```typescript
import { logger } from '@/utils/logger'

// Simple logging
logger.info('User logged in', { telegramId: '12345', username: 'john' })
logger.error('API call failed', { error: error.message, endpoint: '/api/users' })
```

### Enhanced Logging with Correlation

```typescript
import { EnhancedLogger } from '@/utils/enhancedLogger'

// Create logger with context
const userLogger = new EnhancedLogger({ 
  telegramId: '12345', 
  service: 'user-service' 
})

// All logs will include the context
userLogger.info('Processing user request')
userLogger.error('Failed to update user', { error: error.message })

// Child logger with additional context
const operationLogger = userLogger.child({ operation: 'update-profile' })
operationLogger.info('Starting profile update')
```

### Performance Logging

```typescript
// Automatically log operation duration
await operationLogger.timed('database-query', async () => {
  return await getUserFromDatabase(userId)
})
```

### Error Handling

```typescript
import { GlobalErrorHandler } from '@/helpers/error'

try {
  await riskyOperation()
} catch (error) {
  GlobalErrorHandler.handleError(error, {
    telegramId: user.telegramId,
    service: 'payment-service',
    operation: 'process-payment'
  })
  throw error
}
```

## Log Format

Each log entry includes:

```json
{
  "timestamp": "2025-01-20T10:30:45.123Z",
  "level": "info",
  "message": "User action completed",
  "correlationId": "abc123de-f456-7890-gh12-ijklmnop3456",
  "telegramId": "12345",
  "service": "user-service",
  "operation": "update-profile", 
  "duration": 245,
  "metadata": {
    "field": "value"
  }
}
```

## Environment Variables

- `LOG_LEVEL`: Minimum log level (default: 'info')
- `NODE_ENV`: Environment mode (affects log output format)

## Production Considerations

- Logs are automatically rotated daily
- Old logs are kept for 14 days
- Log files are compressed to save space
- No sensitive information (passwords, tokens) is logged
- In production, console output is disabled