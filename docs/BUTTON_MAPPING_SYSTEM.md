# Button Mapping System Documentation

## Overview

The Button Mapping System is a comprehensive solution designed to prevent and handle BUTTON_DATA_INVALID errors in Telegram bot interactions. It provides robust utilities for creating, validating, and processing inline keyboard buttons with automatic error recovery and fallback mechanisms.

## Core Problem

The BUTTON_DATA_INVALID error typically occurs when:
- Callback data exceeds Telegram's 64-byte limit
- Button mappings become inconsistent between generation and processing
- Special characters or encoding issues in callback data
- Stale callback data from previous bot sessions
- Race conditions in button state management

## Solution Architecture

### 1. Core Utilities (`/src/utils/buttonMapping.ts`)

**Text Normalization:**
```typescript
normalizeButtonText(text: string, options?: ButtonMappingOptions): string
```
- Removes extra whitespace
- Handles emoji-safe encoding
- Sanitizes problematic characters

**Safe Callback Data Generation:**
```typescript
generateSafeCallbackData(prefix: string, id: string | number, options?: ButtonMappingOptions): string
```
- Respects Telegram's 64-byte limit
- Uses deterministic short IDs for long identifiers
- Maintains consistency between generation and lookup

**Button Mapping Creation:**
```typescript
createButtonMapping(text: string, callbackPrefix: string, id: string | number, options?: ButtonMappingOptions): ButtonMapping
```
- Creates consistent text-to-callback mappings
- Handles both full and shortened IDs
- Provides comprehensive logging

### 2. Model Selection Utilities (`/src/utils/modelButtonMapping.ts`)

**Specialized for Model Selection Scenarios:**
```typescript
createSafeModelSelectionKeyboard(models: ModelTraining[], callbackPrefix?: string, options?: ModelButtonOptions)
```

**Robust Model Finding:**
```typescript
findModelByCallback(models: ModelTraining[], callbackData: string, callbackPrefix?: string)
```
- Handles both full and short ID matching
- Provides detailed error reporting
- Automatic fallback mechanisms

### 3. Wizard Integration (`/src/utils/wizardButtonHandlers.ts`)

**Generic Wizard Callback Handling:**
```typescript
createWizardCallbackHandler<T>(handlerName: string, handlers: Record<string, WizardButtonHandler<T>>)
```

**Standard Wizard Patterns:**
```typescript
createStandardWizardHandlers(wizardName: string, options: WizardOptions)
```

### 4. System Error Handlers (`/src/utils/systemErrorHandlers.ts`)

**Comprehensive Error Recovery:**
```typescript
handleSystemError(ctx: MyContext, error: Error, context: SystemErrorContext, options: ErrorRecoveryOptions)
```

**Specialized Handlers:**
- `handleCallbackQueryError()` - For callback-specific errors
- `handleButtonMappingError()` - For button mapping failures
- `handleModelSelectionError()` - For model selection issues

### 5. Middleware (`/src/middlewares/buttonErrorMiddleware.ts`)

**Global Error Interception:**
```typescript
createComprehensiveButtonMiddleware(options?: MiddlewareOptions)
```
- Validates callback data before processing
- Handles timeout scenarios
- Provides automatic error recovery

## Usage Examples

### Basic Model Selection Setup

```typescript
import { setupModelSelectionStep, createModelSelectionCallbackHandler } from '@/utils/buttonMappingIntegration'

// In your wizard step
const result = await setupModelSelectionStep(ctx, userModels, {
  title: 'Choose your model:',
  includeSteps: true,
  onModelSelected: async (ctx, model) => {
    ctx.session.userModel = model
    ctx.wizard.next()
  }
})

// In your wizard callback handler
const callbackHandler = createModelSelectionCallbackHandler('neuroPhoto', {
  moveToNextStep: true,
  onError: ErrorRecoveryStrategies.returnToMainMenu
})

wizard.on('callback_query', callbackHandler)
```

### Upgrading Existing Wizards

```typescript
import { upgradeWizardWithButtonMapping } from '@/utils/buttonMappingIntegration'

const upgradedWizard = upgradeWizardWithButtonMapping(existingWizard, 'myWizard', {
  enableModelSelection: true,
  enableErrorRecovery: true,
  errorStrategy: 'returnToMainMenu'
})
```

### Manual Button Creation

```typescript
import { createKeyboardButtons, findByCallbackData } from '@/utils/buttonMapping'

// Create buttons
const buttons = createKeyboardButtons(
  items,
  item => item.name,
  'select_item',
  { maxColumns: 2, debug: true }
)

// Process callback
const selectedItem = findByCallbackData(items, callbackData, 'select_item', { debug: true })
```

## Error Recovery Strategies

### 1. Return to Main Menu
```typescript
ErrorRecoveryStrategies.returnToMainMenu
```
- Shows error message
- Returns user to main menu
- Exits current scene

### 2. Restart Current Step
```typescript
ErrorRecoveryStrategies.restartCurrentStep
```
- Shows error message
- Restarts the current wizard step
- Maintains user context

### 3. Go to Previous Step
```typescript
ErrorRecoveryStrategies.goToPreviousStep
```
- Shows error message
- Goes back one step in wizard
- Allows user to retry

### 4. Ask to Retry
```typescript
ErrorRecoveryStrategies.askToRetry
```
- Shows specific error message
- Asks user to try again
- Maintains current state

## Configuration Options

### ButtonMappingOptions
```typescript
interface ButtonMappingOptions {
  maxCallbackLength?: number    // Default: 60
  debug?: boolean              // Default: false
  prefix?: string              // Default: undefined
  emojiSafe?: boolean         // Default: false
}
```

### ModelButtonOptions
```typescript
interface ModelButtonOptions extends ButtonMappingOptions {
  includeSteps?: boolean       // Default: true
  includeDate?: boolean        // Default: true
  maxTextLength?: number       // Default: 50
  isRussian?: boolean         // Auto-detected
}
```

### ErrorRecoveryOptions
```typescript
interface ErrorRecoveryOptions {
  returnToMainMenu?: boolean   // Default: true
  customMessage?: string       // Default: auto-generated
  logFullStack?: boolean       // Default: false
  customRecovery?: Function    // Default: undefined
  silent?: boolean            // Default: false
  maxRetries?: number         // Default: undefined
}
```

## Migration Guide

### From Old neuroPhoto Wizard

**Before:**
```typescript
// Old problematic code
const modelButtons = userModels.map((model, index) => {
  let callbackData = `select_model_${model.id}`
  if (callbackData.length > 60) {
    const shortId = model.id.toString().slice(-8)
    callbackData = `select_model_${shortId}`
  }
  return [{ text: buttonText, callback_data: callbackData }]
})
```

**After:**
```typescript
// New robust system
const keyboardResult = createSafeModelSelectionKeyboard(
  userModels,
  'select_model',
  { isRussian: isRu, includeSteps: true, debug: true }
)

if (!keyboardResult.isValid) {
  await handleSystemError(ctx, new Error(keyboardResult.error))
  return
}
```

### From Manual Callback Handling

**Before:**
```typescript
wizard.on('callback_query', async (ctx) => {
  const callbackData = ctx.callbackQuery.data
  if (callbackData.startsWith('select_model_')) {
    let modelId = callbackData.replace('select_model_', '')
    let selectedModel = userModels.find(m => m.id.toString() === modelId)
    if (!selectedModel && modelId.length === 8) {
      selectedModel = userModels.find(m => m.id.toString().endsWith(modelId))
    }
    // ... more manual handling
  }
})
```

**After:**
```typescript
const callbackHandler = createModelSelectionCallbackHandler('myWizard', {
  onModelSelected: async (ctx, model) => {
    ctx.session.userModel = model
    ctx.wizard.next()
  },
  onError: ErrorRecoveryStrategies.returnToMainMenu
})

wizard.on('callback_query', callbackHandler)
```

## Best Practices

### 1. Always Use Safe Button Creation
```typescript
// ✅ Good
const keyboard = createSafeModelSelectionKeyboard(models, 'select', options)

// ❌ Avoid
const buttons = models.map(m => ({ text: m.name, callback_data: `select_${m.id}` }))
```

### 2. Enable Debug Mode During Development
```typescript
const options = {
  debug: process.env.NODE_ENV === 'development',
  logFullStack: true
}
```

### 3. Implement Proper Error Recovery
```typescript
// ✅ Good
const result = await setupModelSelectionStep(ctx, models, {
  onError: ErrorRecoveryStrategies.returnToMainMenu
})

// ❌ Avoid
try {
  // ... button setup
} catch (error) {
  console.error(error) // Silent failure
}
```

### 4. Use Consistent Callback Prefixes
```typescript
// ✅ Good - consistent naming
const MODEL_SELECTION_PREFIX = 'select_model'
const ACTION_PREFIX = 'action'

// ❌ Avoid - inconsistent prefixes
'select_model_', 'model_', 'choose_'
```

### 5. Validate Before Processing
```typescript
// ✅ Good
const validation = validateCallbackData(callbackData, 'select_model')
if (!validation.isValid) {
  await handleCallbackQueryError(ctx, new Error(validation.error), callbackData)
  return
}
```

## Debugging and Monitoring

### Enable Debug Logging
```typescript
const diagnostics = diagnoseLiveButtonMapping(ctx)
console.log('Button mapping diagnostics:', diagnostics)
```

### Common Debug Information
- Session state validation
- Model availability
- Callback data format
- Scene consistency
- Language detection

### Error Monitoring
- All errors are logged with context
- Automatic error categorization
- User impact tracking
- Recovery success rates

## Testing

Comprehensive tests are provided in `/src/__tests__/utils/buttonMapping.test.ts` covering:
- Text normalization
- Callback data generation
- Button mapping creation
- Model finding algorithms
- Error handling scenarios
- Edge cases and unicode support

## Performance Considerations

- **Memory**: Minimal overhead, lazy loading of utilities
- **CPU**: Efficient algorithms for ID matching and text processing
- **Network**: Reduced callback data size saves bandwidth
- **User Experience**: Automatic error recovery prevents user confusion

## Security Features

- **Input Sanitization**: Automatic removal of dangerous characters
- **Data Validation**: Comprehensive validation of all inputs
- **Error Isolation**: Errors don't leak sensitive information
- **Rate Limiting**: Built-in protection against callback flooding

## Conclusion

The Button Mapping System provides a robust, production-ready solution for handling Telegram bot button interactions. It eliminates BUTTON_DATA_INVALID errors while providing comprehensive error recovery and debugging capabilities.

For questions or issues, check the logs with debug mode enabled and use the diagnostic utilities to understand the system state.