# ElizaOS Plugin System - Complete Guide

**Last Updated**: 2025-01-12
**Source**: https://docs.elizaos.ai/plugin-registry/overview
**Status**: ✅ Active Knowledge Base

---

## 🎯 Plugin Architecture

### Core Plugin Interface

```typescript
interface Plugin {
  name: string;
  description: string;

  // Optional Components
  actions?: Action[];
  providers?: Provider[];
  evaluators?: Evaluator[];
  services?: Service[];

  // Optional Infrastructure
  routes?: RouteHandler[];
  events?: EventHandler[];
  adapters?: DatabaseAdapter[];

  // Lifecycle
  init?: (config: any, runtime: IAgentRuntime) => Promise<void>;
}
```

---

## 📦 Component Types

### 1. Actions

**Purpose**: Executable tasks the agent can perform

**Interface**:
```typescript
interface Action {
  name: string;                    // Unique identifier
  similes?: string[];              // Alternative names
  description: string;             // What it does

  validate: (
    runtime: IAgentRuntime,
    message: Memory
  ) => Promise<boolean>;           // Should this action run?

  handler: (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options?: HandlerOptions,      // Note: Optional, not Record
    callback?: HandlerCallback
  ) => Promise<void | ActionResult>;

  examples?: ActionExample[][];    // Training examples
}
```

**Key Points**:
- `options` is `HandlerOptions | undefined`, NOT `Record<string, unknown>`
- `callback` can send messages to user
- `validate` runs before `handler`
- Return `ActionResult` for chaining

**Example**:
```typescript
const myAction: Action = {
  name: 'MY_ACTION',
  similes: ['DO_SOMETHING', 'PERFORM_TASK'],
  description: 'Does something useful',

  validate: async (runtime, message) => {
    return message.content.text.includes('trigger');
  },

  handler: async (runtime, message, state, options, callback) => {
    // Do work
    await callback?.({
      text: 'Done!',
    });

    return {
      success: true,
      data: { result: 'completed' },
    };
  },

  examples: [
    [
      { user: '{{user1}}', content: { text: 'trigger this' } },
      { user: '{{agentName}}', content: { text: 'Done!', action: 'MY_ACTION' } },
    ],
  ],
};
```

---

### 2. Providers

**Purpose**: Supply contextual data to the LLM

**Interface**:
```typescript
interface Provider {
  get: (
    runtime: IAgentRuntime,
    message: Memory,
    state: State
  ) => Promise<ProviderResult>;    // NOT string!
}

type ProviderResult = {
  text?: string;
  values?: Record<string, any>;
  data?: any;
};
```

**Key Points**:
- MUST return `ProviderResult` object, NOT plain string
- Provides context to LLM for better responses
- Can be dynamic (changes with each request)

**Example**:
```typescript
const myProvider: Provider = {
  get: async (runtime, message, state) => {
    return {
      text: 'Available capabilities: X, Y, Z',
      values: {
        feature1: true,
        feature2: false,
      },
    };
  },
};
```

---

### 3. Services

**Purpose**: Background tasks and integrations

**Interface**:
```typescript
abstract class Service {
  static serviceType: string;

  // Required methods
  abstract initialize(runtime: IAgentRuntime): Promise<void>;
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;

  // Optional
  capabilityDescription?: string;
}
```

**Key Points**:
- Extend `Service` base class
- Implement ALL abstract methods
- `serviceType` is static property
- Initialize after runtime is ready

**Example**:
```typescript
class MyService extends Service {
  static serviceType = 'my-service';

  async initialize(runtime: IAgentRuntime): Promise<void> {
    // Setup
  }

  async start(): Promise<void> {
    // Start background tasks
  }

  async stop(): Promise<void> {
    // Cleanup
  }
}
```

---

### 4. Evaluators

**Purpose**: Filter and assess responses

**Interface**:
```typescript
interface Evaluator {
  name: string;
  description: string;

  handler: (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State
  ) => Promise<EvaluatorResult>;

  validate?: (runtime: IAgentRuntime, message: Memory) => Promise<boolean>;
  examples?: EvaluatorExample[][];
}
```

**Example**:
```typescript
const myEvaluator: Evaluator = {
  name: 'QUALITY_CHECK',
  description: 'Checks response quality',

  handler: async (runtime, message, state) => {
    const quality = analyzeQuality(message.content.text);
    return {
      success: quality > 0.8,
      score: quality,
    };
  },
};
```

---

## 🔧 Plugin Initialization Sequence

1. **Database Adapter** setup
2. **Actions** registration
3. **Evaluators** registration
4. **Providers** registration
5. **Models** configuration
6. **Routes** setup (HTTP)
7. **Events** subscription
8. **Services** initialization

---

## ✅ Best Practices

### 1. Validation

```typescript
// ✅ GOOD: Always validate
validate: async (runtime, message) => {
  return message.content.text.includes('trigger') &&
         runtime.getSetting('API_KEY') !== undefined;
}

// ❌ BAD: No validation
validate: async () => true
```

### 2. Error Handling

```typescript
// ✅ GOOD: Handle errors gracefully
handler: async (runtime, message, state, options, callback) => {
  try {
    const result = await doWork();
    await callback?.({ text: 'Success!' });
    return { success: true, data: result };
  } catch (error) {
    await callback?.({ text: 'Error occurred' });
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
```

### 3. Type Safety

```typescript
// ✅ GOOD: Proper types
import { Action, IAgentRuntime, Memory, State } from '@elizaos/core';

const action: Action = {
  // ... properly typed
};

// ❌ BAD: Using 'any'
const action: any = { ... };
```

### 4. Dependencies

```typescript
// ✅ GOOD: Declare dependencies
export const myPlugin: Plugin = {
  name: 'my-plugin',
  dependencies: ['@elizaos/plugin-bootstrap'],
  // ...
};
```

---

## 📊 Common Patterns

### Pattern 1: Simple Action

```typescript
import { Action } from '@elizaos/core';

export const simpleAction: Action = {
  name: 'SIMPLE_ACTION',
  description: 'Does simple task',

  validate: async (runtime, message) => {
    return message.content.text.includes('/command');
  },

  handler: async (runtime, message, state, options, callback) => {
    await callback?.({ text: 'Executed!' });
  },

  examples: [
    [
      { user: '{{user1}}', content: { text: '/command' } },
      { user: '{{agentName}}', content: { text: 'Executed!', action: 'SIMPLE_ACTION' } },
    ],
  ],
};
```

### Pattern 2: Service with State

```typescript
import { Service, IAgentRuntime } from '@elizaos/core';

class StatefulService extends Service {
  static serviceType = 'stateful';
  private client: any;

  async initialize(runtime: IAgentRuntime): Promise<void> {
    const apiKey = runtime.getSetting('API_KEY');
    this.client = createClient(apiKey);
  }

  async start(): Promise<void> {
    await this.client.connect();
  }

  async stop(): Promise<void> {
    await this.client.disconnect();
  }

  // Custom methods
  async doSomething() {
    return this.client.request();
  }
}
```

### Pattern 3: Provider with Context

```typescript
import { Provider } from '@elizaos/core';

export const contextProvider: Provider = {
  get: async (runtime, message, state) => {
    const userContext = await runtime.getMemories({
      roomId: message.roomId,
      count: 5,
    });

    return {
      text: `Recent context: ${userContext.map((m) => m.content.text).join(', ')}`,
      values: {
        messageCount: userContext.length,
      },
    };
  },
};
```

---

## 🚨 Common Mistakes

### Mistake 1: Wrong Provider Return Type

```typescript
// ❌ BAD
const provider: Provider = {
  get: async () => 'some string', // Wrong!
};

// ✅ GOOD
const provider: Provider = {
  get: async () => ({
    text: 'some string',
  }),
};
```

### Mistake 2: Missing Service Methods

```typescript
// ❌ BAD
class MyService extends Service {
  static serviceType = 'my-service';
  // Missing start() and stop()!
}

// ✅ GOOD
class MyService extends Service {
  static serviceType = 'my-service';

  async initialize(runtime) {}
  async start() {}
  async stop() {}
}
```

### Mistake 3: Wrong Action Options Type

```typescript
// ❌ BAD
handler: async (runtime, message, state, options: Record<string, unknown>) => {
  // Wrong type!
}

// ✅ GOOD
handler: async (runtime, message, state, options) => {
  // Let TypeScript infer HandlerOptions | undefined
}
```

---

## 📚 TypeScript Types Reference

```typescript
// Core types you'll use
import {
  Plugin,
  Action,
  Provider,
  Service,
  Evaluator,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  ActionResult,
  ProviderResult,
} from '@elizaos/core';
```

---

**This knowledge base is used by Claude Code for plugin development**
**Update this file when ElizaOS releases new versions**

**Created**: 2025-01-12
**Format**: Markdown with code examples
**Purpose**: Permanent reference for ElizaOS plugin development
