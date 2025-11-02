#!/bin/bash

# 🤖 CREATE FUNCTIONAL ARCHITECTURE AGENTS
# Creates specialized agents for functional media generation

set -e

echo "🤖 Creating Specialized Functional Architecture Agents..."
echo "======================================================"
echo ""

# Agent 1: Functional Architecture Specialist
echo "🎨 Creating Agent 1: Functional Architecture Specialist"
echo "======================================================"

mkdir -p agents/functional-architecture

cat > agents/functional-architecture/agent-config.json << 'EOF'
{
  "name": "Functional Architecture Specialist",
  "role": "Архитектор функциональной медиа генерации",
  "specialization": "TypeScript, fp-ts, io-ts, функциональное программирование",
  "experience": "Эксперт по функциональной архитектуре",
  "tasks": [
    "Создать типы с io-ts (VideoRequest, ImageRequest, AudioRequest)",
    "Создать схемы валидации",
    "Создать Result/Either типы для error handling",
    "Создать базовые TypeScript utility типы",
    "Настроить Jest + Vitest + ts-auto-mock для тестирования"
  ],
  "learning_materials": [
    "Functional patterns in TypeScript",
    "fp-ts library patterns",
    "io-ts for type validation",
    "Function composition (pipe, flow)",
    "Monads (Task, Either, Maybe)",
    "Immutability patterns"
  ],
  "output_directory": "src/core/functional"
}
EOF

cat > agents/functional-architecture/agent-instructions.md << 'EOF'
# Functional Architecture Specialist Instructions

## Primary Goal
Create a fully functional, type-safe foundation for media generation using functional programming patterns.

## Key Responsibilities

### 1. Type System with io-ts
Create strict, runtime-validated types:

```typescript
// Example: Video types
export const VideoRequest = t.strict({
  prompt: t.string,
  model: ModelId,
  duration: t.number.pipe(t.positive()),
  aspectRatio: t.union([t.literal('16:9'), t.literal('9:16'), t.literal('1:1')]),
  userId: t.string,
  metadata: t.partial({
    style: t.string,
    quality: t.union([t.literal('low'), t.literal('medium'), t.literal('high')])
  })
})
```

### 2. Result/Either Types
Implement functional error handling:

```typescript
export type Left<L> = { _tag: 'Left'; value: L }
export type Right<R> = { _tag: 'Right'; value: R }
export type Either<L, R> = Left<L> | Right<R>

export type Task<A> = () => Promise<A>
export type TaskEither<E, A> = () => Promise<Either<E, A>>

export const tryCatch = <A>(task: Promise<A>): TaskEither<Error, A> =>
  async () => {
    try {
      const value = await task
      return { _tag: 'Right', value }
    } catch (error) {
      return { _tag: 'Left', error instanceof Error ? error : new Error(String(error)) }
    }
  }
```

### 3. Function Composition
Create pipe and flow utilities:

```typescript
export const pipe = <T, R>(...fns: Array<(arg: T) => R>) =>
  (value: T): R => fns.reduce((acc, fn) => fn(acc), value)

export const flow = <T, R>(...fns: Array<(arg: T) => R>) =>
  (value: T): R => fns.reduceRight((acc, fn) => fn(acc), value)
```

### 4. Validation Pipeline
Create composable validation:

```typescript
export const validateVideoRequest = (input: unknown): TaskEither<ValidationError, VideoRequest> =>
  tryCatch(
    Promise.resolve(VideoRequest.decode(input)).then(
      result => {
        if (result._tag === 'Left') {
          throw new ValidationError('Invalid video request', result.right)
        }
        return result.right
      }
    )
  )
```

## Output Structure
```
src/core/functional/
├── types/
│   ├── media.types.ts
│   ├── provider.types.ts
│   └── pipeline.types.ts
├── utils/
│   ├── result.ts (Either/Result types)
│   ├── validation.ts (io-ts schemas)
│   ├── composition.ts (pipe/flow)
│   └── promises.ts (Task/TaskEither)
└── testing/
    ├── mocks/
    ├── fixtures/
    └── generators/
```

## Success Criteria
- [ ] All types defined with io-ts
- [ ] All functions are pure
- [ ] 100% type safety
- [ ] Immutability enforced
- [ ] Error handling is functional
- [ ] Pipeline composition works
- [ ] Documentation complete
- [ ] Tests written (100% coverage)

## Testing Requirements
Write unit tests for:
- All type validations
- All utility functions
- All composition helpers
- Error handling cases
- Pipeline composition

Use Vitest and fast-check for property-based testing.
EOF

echo "  ✅ Agent 1 configuration created"

# Agent 2: Provider Adapter Specialist
echo ""
echo "🔌 Creating Agent 2: Provider Adapter Specialist"
echo "================================================"

mkdir -p agents/provider-adapter

cat > agents/provider-adapter/agent-config.json << 'EOF'
{
  "name": "Provider Adapter Specialist",
  "role": "Создатель функциональных провайдеров",
  "specialization": "Adapter Pattern, API Integration, Circuit Breaker",
  "experience": "Эксперт по интеграции API",
  "tasks": [
    "KieAiAdapter (функциональный стиль)",
    "ReplicateAdapter",
    "ElevenLabsAdapter",
    "FalAdapter",
    "OpenRouterAdapter",
    "ProviderRegistry (функциональный диспетчер)",
    "CircuitBreaker для каждого провайдера",
    "Health checks для каждого провайдера"
  ],
  "learning_materials": [
    "Adapter pattern in functional style",
    "API integration patterns",
    "Error handling strategies",
    "Circuit breaker pattern",
    "Health monitoring",
    "Request/Response transformation"
  ],
  "output_directory": "src/core/providers/adapters"
}
EOF

cat > agents/provider-adapter/agent-instructions.md << 'EOF'
# Provider Adapter Specialist Instructions

## Primary Goal
Create functional, swappable provider adapters with circuit breakers and health monitoring.

## Key Responsibilities

### 1. Functional Adapter Pattern
Each provider must implement a consistent interface:

```typescript
export type GenerateVideo = (request: VideoRequest) => TaskEither<Error, VideoResult>
export type HealthCheck = () => TaskEither<Error, HealthStatus>

export interface Provider {
  name: ProviderName
  capabilities: MediaType[]
  generateVideo: GenerateVideo
  generateImage: GenerateImage
  generateAudio: GenerateAudio
  healthCheck: HealthCheck
  rateLimit: RateLimit
}
```

### 2. Circuit Breaker Implementation
Implement circuit breaker for fault tolerance:

```typescript
export const createCircuitBreaker = <T>(
  fn: TaskEither<Error, T>,
  options: CircuitBreakerOptions
): TaskEither<Error, T> => {
  const { failureThreshold, timeout, resetTimeout } = options

  return async () => {
    const state = await getCircuitState()

    if (state === 'OPEN') {
      if (Date.now() > state.nextAttempt) {
        setCircuitState('HALF_OPEN')
        return fn()
      }
      return { _tag: 'Left', error: new CircuitOpenError() }
    }

    try {
      const result = await fn()
      if (result._tag === 'Right') {
        setCircuitState('CLOSED')
      }
      return result
    } catch (error) {
      incrementFailure()
      setCircuitState('OPEN')
      return { _tag: 'Left', error: error instanceof Error ? error : new Error(String(error)) }
    }
  }
}
```

### 3. Provider Implementation Example
Create KieAiAdapter:

```typescript
export const KieAiAdapter = (config: KieAiConfig): Provider => {
  const { apiKey, baseUrl, timeout = 30000 } = config

  const generateVideo: GenerateVideo = (request) =>
    pipe(
      validateVideoRequest(request),
      chain(buildKieAiPayload),
      chain(createKieAiTask),
      chain(pollTaskStatus),
      map(downloadVideo),
      map(createVideoResult)
    )

  const healthCheck: HealthCheck = () =>
    pipe(
      callHealthEndpoint,
      map(parseHealthResponse),
      map(transformToHealthStatus)
    )

  return {
    name: 'kie-ai',
    capabilities: ['video', 'image', 'audio'],
    generateVideo,
    // ... other methods
  }
}
```

### 4. Provider Registry
Create a functional provider registry:

```typescript
export const createProviderRegistry = (
  providers: ProviderConfig[]
): ProviderRegistry => {
  const registry = new Map<ProviderName, Provider>()

  providers.forEach(config => {
    switch (config.name) {
      case 'kie-ai':
        registry.set('kie-ai', KieAiAdapter(config))
        break
      case 'replicate':
        registry.set('replicate', ReplicateAdapter(config))
        break
      case 'elevenlabs':
        registry.set('elevenlabs', ElevenLabsAdapter(config))
        break
      case 'fal':
        registry.set('fal', FalAdapter(config))
        break
      case 'openrouter':
        registry.set('openrouter', OpenRouterAdapter(config))
        break
    }
  })

  return {
    getProvider: (name: ProviderName) => registry.get(name),
    getProvidersByCapability: (mediaType: MediaType) =>
      Array.from(registry.entries())
        .filter(([, provider]) =>
          provider.capabilities.includes(mediaType)
        )
        .map(([name, provider]) => ({ name, provider })),
    healthCheck: () =>
      Promise.all(
        Array.from(registry.values()).map(p => p.healthCheck())
      )
  }
}
```

## Output Structure
```
src/core/providers/
├── adapters/
│   ├── kie-ai.adapter.ts
│   ├── replicate.adapter.ts
│   ├── elevenlabs.adapter.ts
│   ├── fal.adapter.ts
│   └── openrouter.adapter.ts
├── registry/
│   ├── provider-registry.ts
│   ├── health-monitor.ts
│   ├── circuit-breaker.ts
│   └── load-balancer.ts
├── config/
│   ├── providers.config.ts
│   └── provider-selector.ts
└── types/
    └── provider.types.ts
```

## Success Criteria
- [ ] All providers implement functional interface
- [ ] Circuit breaker works for all providers
- [ ] Health checks function correctly
- [ ] Rate limiting is enforced
- [ ] Provider registry is working
- [ ] Load balancing is implemented
- [ ] Tests written (100% coverage)
- [ ] Documentation complete

## Testing Requirements
Write unit tests for:
- Each provider adapter
- Circuit breaker behavior
- Health check functionality
- Rate limiting
- Provider registry
- Load balancer

Write integration tests for:
- Provider API integration
- Error handling
- Fallback scenarios
- Performance under load
EOF

echo "  ✅ Agent 2 configuration created"

# Agent 3: Test Engineering Specialist
echo ""
echo "🧪 Creating Agent 3: Test Engineering Specialist"
echo "==============================================="

mkdir -p agents/test-engineering

cat > agents/test-engineering/agent-config.json << 'EOF'
{
  "name": "Test Engineering Specialist",
  "role": "QA архитектор функционального кода",
  "specialization": "Jest, Vitest, fast-check, Property-based Testing",
  "experience": "Эксперт по тестированию функционального кода",
  "tasks": [
    "Unit tests для всех функций (100% coverage)",
    "Integration tests для провайдеров",
    "Property-based tests с fast-check",
    "Mock провайдеры для тестов",
    "Test fixtures",
    "Snapshot testing",
    "Performance benchmarks",
    "E2E тесты с реальными провайдерами"
  ],
  "learning_materials": [
    "Jest best practices",
    "Vitest advanced features",
    "Property-based testing with fast-check",
    "Mock strategies",
    "Test fixtures",
    "Snapshot testing",
    "Performance testing"
  ],
  "output_directory": "tests"
}
EOF

cat > agents/test-engineering/agent-instructions.md << 'EOF'
# Test Engineering Specialist Instructions

## Primary Goal
Achieve 100% test coverage for all functional code with property-based testing.

## Key Responsibilities

### 1. Unit Testing with Vitest
Create comprehensive unit tests:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { KieAiAdapter } from '@/providers/adapters/kie-ai.adapter'

describe('KieAiAdapter', () => {
  const mockConfig = { apiKey: 'test-key', baseUrl: 'https://api.kie.ai' }

  it('should return Success with video result for valid request', async () => {
    const adapter = KieAiAdapter(mockConfig)
    const request = validVideoRequest

    const result = await adapter.generateVideo(request)()

    expect(result._tag).toBe('Right')
    if (result._tag === 'Right') {
      expect(result.value.videoUrl).toBeDefined()
    }
  })

  it('should return Left with ValidationError for invalid request', async () => {
    const adapter = KieAiAdapter(mockConfig)
    const request = invalidVideoRequest

    const result = await adapter.generateVideo(request)()

    expect(result._tag).toBe('Left')
    if (result._tag === 'Left') {
      expect(result.error).toBeInstanceOf(ValidationError)
    }
  })
})
```

### 2. Property-Based Testing with fast-check
Implement property-based tests:

```typescript
import { fc } from 'fast-check'
import { describe, it } from 'vitest'
import { KieAiAdapter } from '@/providers/adapters/kie-ai.adapter'

const fcModelId = fc.stringMatching(/^(veo|runway|kling)-[\w-]+$/)
const fcVideoRequest = fc.record({
  prompt: fc.string({ minLength: 1, maxLength: 1000 }),
  model: fcModelId,
  duration: fc.integer({ min: 1, max: 60 }),
  userId: fc.string({ minLength: 1 })
})

describe('KieAiAdapter - Property Tests', () => {
  it('should always return Success or Failure for any valid request', async () => {
    await fc.assert(
      fc.asyncProperty(fcVideoRequest, async (request) => {
        const adapter = KieAiAdapter(testConfig)
        const result = await adapter.generateVideo(request)()

        expect(result._tag === 'Right' || result._tag === 'Left').toBe(true)
      })
    )
  })
})
```

### 3. Mock Providers
Create mock providers for testing:

```typescript
export const createMockProvider = (config: MockProviderConfig): Provider => {
  const { name, latency = 0, failureRate = 0 } = config

  const generateVideo: GenerateVideo = (request) =>
    pipe(
      validateVideoRequest(request),
      chain(async (validated) => {
        // Simulate latency
        if (latency > 0) {
          await new Promise(resolve => setTimeout(resolve, latency))
        }

        // Simulate failure
        if (Math.random() < failureRate) {
          return { _tag: 'Left', error: new MockError('Simulated failure') }
        }

        return {
          _tag: 'Right',
          value: {
            videoUrl: `https://mock.video/${name}/${Date.now()}.mp4`,
            taskId: `mock-task-${Date.now()}`,
            provider: name,
            duration: validated.duration,
            metadata: {}
          }
        }
      })
    )

  return {
    name,
    capabilities: ['video'],
    generateVideo,
    // ... other methods
  }
}
```

### 4. Integration Testing
Test complete pipelines:

```typescript
describe('Video Generation Pipeline - Integration', () => {
  const registry = createProviderRegistry([MockProvider.config])
  const pipeline = videoGenerationPipeline(registry, testConfig)

  it('should complete full pipeline with mock provider', async () => {
    const request = validVideoRequest

    const result = await pipeline(request)()

    expect(result._tag).toBe('Right')
    if (result._tag === 'Right') {
      expect(result.value.videoUrl).toBeDefined()
      expect(result.value.provider).toBe('mock')
    }
  })
})
```

### 5. Performance Benchmarks
Create performance tests:

```typescript
describe('Performance Benchmarks', () => {
  it('should generate video within 5 seconds', async () => {
    const start = Date.now()
    const result = await adapter.generateVideo(request)()
    const duration = Date.now() - start

    expect(result._tag).toBe('Right')
    expect(duration).toBeLessThan(5000)
  })

  it('should handle 100 concurrent requests', async () => {
    const requests = Array(100).fill(validVideoRequest)
    const start = Date.now()

    const results = await Promise.all(
      requests.map(req => adapter.generateVideo(req)())
    )

    const duration = Date.now() - start
    const successCount = results.filter(r => r._tag === 'Right').length

    expect(successCount).toBeGreaterThanOrEqual(95) // 95% success rate
    expect(duration).toBeLessThan(10000) // All within 10 seconds
  })
})
```

## Output Structure
```
tests/
├── unit/
│   ├── providers/
│   │   ├── kie-ai.adapter.test.ts
│   │   ├── replicate.adapter.test.ts
│   │   └── ...
│   ├── pipeline/
│   │   ├── video.pipeline.test.ts
│   │   └── ...
│   ├── services/
│   └── utils/
├── integration/
│   ├── provider-integration/
│   ├── pipeline-integration/
│   └── e2e/
├── property/
│   ├── providers.properties.ts
│   └── pipeline.properties.ts
├── fixtures/
│   ├── media-fixtures.ts
│   └── provider-fixtures.ts
├── mocks/
│   ├── providers.mocks.ts
│   └── services.mocks.ts
└── performance/
    ├── benchmarks.test.ts
    └── load-test.test.ts
```

## Coverage Requirements
- **Unit Tests**: 100% lines, branches, functions
- **Integration Tests**: 90%+ of code paths
- **Property Tests**: All critical functions
- **E2E Tests**: All user flows

## Test Configuration
Configure Vitest and Jest:
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        global: {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100
        }
      }
    },
    setupFiles: ['./tests/setup.ts']
  }
})
```
EOF

echo "  ✅ Agent 3 configuration created"

# Agent 4: Migration Orchestrator
echo ""
echo "🔄 Creating Agent 4: Migration Orchestrator"
echo "========================================="

mkdir -p agents/migration

cat > agents/migration/agent-config.json << 'EOF'
{
  "name": "Migration Orchestrator",
  "role": "Миграция и интеграция функциональной архитектуры",
  "specialization": "Migration, Integration, Performance, Monitoring",
  "experience": "Эксперт по миграции сложных систем",
  "tasks": [
    "Интеграция с существующими scene'ами",
    "Миграция UniversalProviderManager",
    "Обновление всех endpoints",
    "Backward compatibility",
    "Performance profiling",
    "Production monitoring"
  ],
  "learning_materials": [
    "Migration patterns",
    "Backward compatibility",
    "Performance profiling",
    "Monitoring and alerting",
    "Rollback strategies"
  ],
  "output_directory": "src/migration"
}
EOF

cat > agents/migration/agent-instructions.md << 'EOF'
# Migration Orchestrator Instructions

## Primary Goal
Migrate existing code to functional architecture with zero downtime and backward compatibility.

## Key Responsibilities

### 1. Backward Compatibility Layer
Create adapters for existing code:

```typescript
export class LegacyAdapter {
  private provider: Provider

  constructor() {
    this.provider = createProviderRegistry([kieAiConfig]).getProvider('kie-ai')
  }

  async generateVideo(params: LegacyParams): Promise<LegacyResult> {
    const request: VideoRequest = {
      prompt: params.prompt,
      model: params.model as ModelId,
      duration: params.duration,
      userId: params.userId
    }

    const result = await this.provider.generateVideo(request)()

    if (result._tag === 'Left') {
      throw new Error(result.error.message)
    }

    return {
      videoUrl: result.value.videoUrl,
      taskId: result.value.taskId,
      // Convert back to legacy format
    }
  }
}
```

### 2. Gradual Migration
Migrate scenes one by one:

```typescript
export const migrateToFunctional = async (scenes: Scene[]) => {
  for (const scene of scenes) {
    // Replace UniversalProviderManager calls
    scene.replaceHandler('generateVideo', async (ctx) => {
      const request = extractRequest(ctx)
      const result = await functionalPipeline(request)()
      return transformResult(result)
    })
  }
}
```

### 3. Performance Monitoring
Track performance during migration:

```typescript
export const createMetricsCollector = () => {
  const metrics = new Map<string, number[]>()

  return {
    recordLatency: (operation: string, latency: number) => {
      if (!metrics.has(operation)) {
        metrics.set(operation, [])
      }
      metrics.get(operation)!.push(latency)
    },

    getAverageLatency: (operation: string): number => {
      const values = metrics.get(operation) || []
      return values.reduce((a, b) => a + b, 0) / values.length
    },

    reportMetrics: () => {
      for (const [operation, values] of metrics) {
        logger.info(`Metrics for ${operation}`, {
          count: values.length,
          avg: this.getAverageLatency(operation),
          p50: this.getPercentileLatency(operation, 0.5),
          p90: this.getPercentileLatency(operation, 0.9),
          p99: this.getPercentileLatency(operation, 0.99)
        })
      }
    }
  }
}
```

### 4. Circuit Breaker Monitoring
Monitor provider health:

```typescript
export const setupMonitoring = (
  providers: Map<ProviderName, Provider>
) => {
  const metrics = createMetricsCollector()

  // Wrap all providers with monitoring
  for (const [name, provider] of providers) {
    const wrappedProvider = {
      ...provider,
      generateVideo: (request: VideoRequest) => {
        const start = Date.now()
        return pipe(
          provider.generateVideo(request),
          tap(result => {
            const latency = Date.now() - start
            metrics.recordLatency(`${name}.generateVideo`, latency)

            if (result._tag === 'Left') {
              logger.error(`Provider ${name} failed`, {
                error: result.error,
                latency
              })
              recordFailure(name)
            } else {
              recordSuccess(name)
            }
          })
        )
      }
    }
    providers.set(name, wrappedProvider)
  }
}
```

### 5. Rollback Strategy
Prepare for quick rollback:

```typescript
export const createRollbackPlan = () => ({
  backupExisting: async () => {
    // Backup UniversalProviderManager
    await fs.copy(
      'src/services/UniversalProviderManager.ts',
      'backup/UniversalProviderManager.ts.backup'
    )
  },

  restoreExisting: async () => {
    // Restore from backup
    await fs.copy(
      'backup/UniversalProviderManager.ts.backup',
      'src/services/UniversalProviderManager.ts'
    )
  },

  revertScenes: async (scenes: Scene[]) => {
    // Revert scene changes
    for (const scene of scenes) {
      scene.restoreBackup()
    }
  },

  rollback: async (scenes: Scene[]) => {
    logger.warn('Starting rollback...')
    await this.restoreExisting()
    await this.revertScenes(scenes)
    logger.info('Rollback completed')
  }
})
```

## Output Structure
```
src/migration/
├── compatibility/
│   ├── legacy-adapter.ts
│   └── backward-compatibility.ts
├── integration/
│   ├── scene-integration.ts
│   └── endpoint-integration.ts
├── monitoring/
│   ├── metrics-collector.ts
│   ├── performance-tracker.ts
│   └── health-monitor.ts
├── rollback/
│   ├── rollback-plan.ts
│   └── restore-strategy.ts
└── utils/
    ├── migration-helpers.ts
    └── validation.ts
```

## Migration Steps

### Phase 1: Setup
1. Create backup of existing code
2. Set up monitoring
3. Configure backward compatibility layer
4. Test in staging environment

### Phase 2: Gradual Migration
1. Migrate one scene at a time
2. Monitor performance
3. Validate functionality
4. Rollback if issues detected

### Phase 3: Full Migration
1. Migrate all scenes
2. Remove legacy code
3. Clean up backups
4. Update documentation

### Phase 4: Optimization
1. Performance tuning
2. Monitoring refinement
3. Documentation update
4. Team training

## Success Criteria
- [ ] Zero downtime migration
- [ ] Backward compatibility maintained
- [ ] Performance not degraded
- [ ] All tests passing
- [ ] Monitoring in place
- [ ] Rollback plan tested
- [ ] Documentation updated
- [ ] Team trained
EOF

echo "  ✅ Agent 4 configuration created"

echo ""
echo "====================================================="
echo "🤖 All 4 agents created successfully!"
echo "====================================================="
echo ""
echo "📁 Agent configurations:"
echo "  - agents/functional-architecture/"
echo "  - agents/provider-adapter/"
echo "  - agents/test-engineering/"
echo "  - agents/migration/"
echo ""
echo "🎯 Next steps:"
echo "  1. Review agent configurations"
echo "  2. Install required dependencies"
echo "  3. Start with Foundation phase"
echo "  4. Follow the roadmap"
echo ""
echo "📚 Documentation:"
echo "  - docs/FUNCTIONAL_MEDIA_GENERATION_ROADMAP.md"
echo "  - docs/AGENTS_FUNCTIONAL_ARCHITECTURE.md"
echo "  - agents/*/agent-instructions.md"
echo ""
echo "✅ Agents are ready for deployment!"