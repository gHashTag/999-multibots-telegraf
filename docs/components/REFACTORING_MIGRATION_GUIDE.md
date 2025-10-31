# Component Refactoring Migration Guide

## Overview

This document describes the migration from the monolithic `registerCommands.ts` (1,770 lines) and `handleMenu.ts` (1,113 lines) to a modular component-based architecture.

## Before vs After

### Before (Monolithic Architecture)
```
src/
├── registerCommands.ts (1,770 lines) 🔥 PROBLEMATIC
├── handlers/
│   └── handleMenu.ts (1,113 lines) 🔥 PROBLEMATIC
└── hearsHandlers.ts (42,417 bytes) 🔥 MASSIVE
```

### After (Modular Architecture)
```
src/
├── components/
│   ├── shared/
│   │   └── types.ts (TypeScript interfaces)
│   └── menu/
│       ├── BotOrchestrator.ts (Main coordinator)
│       ├── MenuActionRegistry.ts (Menu actions)
│       ├── SubscriptionHandler.ts (Subscription logic)
│       ├── PhotoHandler.ts (Photo processing)
│       ├── VideoGenerationHandler.ts (Video logic)
│       ├── NavigationHandler.ts (Navigation)
│       ├── CommandRegistry.ts (Commands)
│       └── index.ts (Exports)
└── tests/
    └── components/
        └── menu/ (Unit & integration tests)
```

## Migration Benefits

### 🚀 Performance Improvements
- **Modular Loading**: Components loaded only when needed
- **Better Memory Management**: Smaller individual modules
- **Faster Development**: Isolated components easier to modify

### 🧹 Code Quality
- **Single Responsibility**: Each component has one clear purpose
- **Better Testability**: Isolated units easy to test
- **Type Safety**: Comprehensive TypeScript interfaces
- **Error Isolation**: Failures contained within components

### 🔧 Maintainability
- **Clear Separation**: Logic grouped by functionality
- **Easy Extensions**: New features added as new components
- **Reduced Coupling**: Components communicate through well-defined interfaces

## Component Breakdown

### 1. BotOrchestrator
**Purpose**: Main coordinator that registers all components with the bot

**Key Features**:
- Coordinates all other components
- Handles bot registration
- Manages component communication
- Provides error isolation

**Usage**:
```typescript
import { BotOrchestrator } from '@/components/menu'

const orchestrator = new BotOrchestrator()
orchestrator.registerAll(bot)
```

### 2. MenuActionRegistry
**Purpose**: Handles menu text buttons and actions

**Extracted From**:
- Lines 75-950 of `handleMenu.ts`
- Various action handlers in `registerCommands.ts`

**Key Features**:
- Centralized menu action handling
- Subscription checking
- Multilingual support
- Error handling

**Migration Notes**:
```typescript
// Before: Scattered in handleMenu.ts
const actions: Record<string, () => Promise<void>> = {
  [isRu ? levels[105].title_ru : levels[105].title_en]: async () => {
    // 50+ lines of logic...
  }
}

// After: Clean component
const action = {
  titles: { ru: '💫 Оформить подписку', en: '💫 Subscribe' },
  handler: async (ctx) => {
    await ctx.scene.leave()
    ctx.session.mode = ModeEnum.SubscriptionScene
    await ctx.scene.enter(ModeEnum.SubscriptionScene)
  }
}
```

### 3. SubscriptionHandler
**Purpose**: Manages all subscription-related operations

**Extracted From**:
- Lines 740-784 of `registerCommands.ts`
- Lines 1632-1697 of `registerCommands.ts`
- Subscription logic scattered throughout

**Key Features**:
- Unified subscription handling
- Text and callback processing
- Error recovery
- State management

### 4. PhotoHandler
**Purpose**: Handles photo uploads and image processing

**Extracted From**:
- Lines 1238-1267 of `registerCommands.ts`
- Lines 1270-1624 of `registerCommands.ts`
- FLUX Kontext logic

**Key Features**:
- Priority-based handler system
- Multiple photo processing workflows
- Upscaling operations
- Session state management

### 5. VideoGenerationHandler
**Purpose**: Manages video generation workflows

**Extracted From**:
- Lines 820-1087 of `registerCommands.ts`
- Lines 1489-1569 of `registerCommands.ts`
- Video-related actions

**Key Features**:
- Text-to-Video workflows
- Image-to-Video workflows
- Model selection
- Status updates

### 6. NavigationHandler
**Purpose**: Handles navigation and global callbacks

**Extracted From**:
- Lines 1126-1235 of `registerCommands.ts`
- Global navigation actions

**Key Features**:
- Global navigation actions
- Help system integration
- Back button handling
- Scene transitions

### 7. CommandRegistry
**Purpose**: Manages bot command registration

**Extracted From**:
- Lines 225-691 of `registerCommands.ts`
- Command definitions and handlers

**Key Features**:
- Centralized command management
- Admin permission checking
- Subscription validation
- Group chat protection

## Breaking Changes

### Import Changes
```typescript
// Before
import { registerCommands } from './registerCommands'

// After
import { BotOrchestrator } from '@/components/menu'
```

### Registration Changes
```typescript
// Before
registerCommands({ bot })

// After
const orchestrator = new BotOrchestrator()
orchestrator.registerAll(bot)
```

### Handler Access
```typescript
// Before: Direct access to handlers (not recommended)
import { handleMenu } from './handlers/handleMenu'

// After: Access through orchestrator
const orchestrator = new BotOrchestrator()
const menuRegistry = orchestrator.getMenuActionRegistry()
```

## Migration Steps

### Step 1: Install New Components
```bash
# Components are already created in src/components/
# No additional installation needed
```

### Step 2: Update Bot Registration
```typescript
// In your main bot file (bot.ts or index.ts)

// Remove old imports
// import { registerCommands } from './registerCommands'

// Add new import
import { BotOrchestrator } from '@/components/menu'

// Replace registration call
// registerCommands({ bot })

// With new orchestrator
const orchestrator = new BotOrchestrator()
orchestrator.registerAll(bot)
```

### Step 3: Remove Old Files (Optional)
```bash
# Backup old files first
mv src/registerCommands.ts src/registerCommands.ts.backup
mv src/handlers/handleMenu.ts src/handlers/handleMenu.ts.backup

# After confirming new system works, remove backups
```

### Step 4: Update Tests
```typescript
// Update imports in existing tests
import { BotOrchestrator } from '@/components/menu'

// Use new component structure
const orchestrator = new BotOrchestrator()
const menuRegistry = orchestrator.getMenuActionRegistry()
```

## Testing Strategy

### Unit Tests
- Each component has isolated unit tests
- Mock external dependencies
- Test error conditions
- Verify state management

### Integration Tests
- Test component communication
- Verify bot registration
- Test error propagation
- Validate state consistency

### Migration Testing
```bash
# Run existing tests to ensure compatibility
npm test

# Run new component tests
npm test tests/components/

# Run integration tests
npm test tests/components/menu/integration.test.ts
```

## Performance Impact

### Memory Usage
- **Before**: Single large file loaded entirely
- **After**: Modular loading, better memory distribution

### Loading Time
- **Before**: All code loaded at startup
- **After**: Lazy loading possible for some components

### Runtime Performance
- **Before**: Linear search through large action objects
- **After**: Map-based lookups for O(1) access

## Rollback Plan

If issues arise, you can quickly rollback:

```typescript
// Restore old imports
import { registerCommands } from './registerCommands.ts.backup'

// Use old registration
registerCommands({ bot })

// Rename backup files back
mv src/registerCommands.ts.backup src/registerCommands.ts
mv src/handlers/handleMenu.ts.backup src/handlers/handleMenu.ts
```

## Future Enhancements

### Planned Improvements
1. **Plugin System**: Allow external components
2. **Configuration**: Runtime component configuration
3. **Metrics**: Component performance monitoring
4. **Caching**: Action result caching
5. **Validation**: Input validation middleware

### Extension Examples
```typescript
// Adding custom component
class CustomHandler implements BaseHandler {
  async handle(ctx: MyContext): Promise<void> {
    // Custom logic
  }
}

// Register with orchestrator
orchestrator.addCustomHandler('custom', new CustomHandler())
```

## Support & Issues

### Common Issues

1. **Import Errors**: Update import paths
2. **Missing Handlers**: Check component registration
3. **State Issues**: Verify session management
4. **Type Errors**: Update TypeScript interfaces

### Debugging
```typescript
// Enable detailed logging
const orchestrator = new BotOrchestrator()
orchestrator.registerAll(bot)

// Access individual components for debugging
const menuRegistry = orchestrator.getMenuActionRegistry()
const actions = menuRegistry.getActions()
console.log('Registered actions:', Array.from(actions.keys()))
```

## Conclusion

This refactoring transforms a monolithic, hard-to-maintain codebase into a clean, modular, and testable architecture. The new component system provides:

- **Better separation of concerns**
- **Improved testability**
- **Enhanced maintainability**
- **Easier debugging**
- **Future extensibility**

The migration preserves all existing functionality while providing a foundation for future development.