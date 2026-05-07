# 🎯 FUNCTIONAL MEDIA GENERATION ARCHITECTURE ROADMAP

## 📋 Executive Summary
**Цель**: Переписать архитектуру генерации медиа (видео, фото, аудио) в функциональном стиле с полным покрытием тестами
**Статус**: 🚧 В работе
**Приоритет**: 🔴 КРИТИЧНЫЙ

---

## 🎨 АРХИТЕКТУРНЫЙ ВИДЕНИЕ

### Целевое состояние:
```
Functional Media Generation Pipeline
├── Core Types & Schemas (io-ts)
├── Provider Adapters (Functional)
│   ├── KieAiAdapter
│   ├── ReplicateAdapter
│   ├── ElevenLabsAdapter
│   ├── FalAdapter
│   └── OpenRouterAdapter
├── Generation Functions
│   ├── Video Generation
│   ├── Image Generation
│   ├── Audio Generation
│   └── FaceSwap Generation
├── Pipeline Composition
│   ├── Validation Pipeline
│   ├── Processing Pipeline
│   └── Response Pipeline
├── Testing Infrastructure
│   ├── Unit Tests (100% coverage)
│   ├── Integration Tests
│   ├── Property-Based Tests
│   └── E2E Tests
└── Provider Registry
    ├── Config-based Provider Selection
    ├── Health Monitoring
    ├── Load Balancing
    └── Circuit Breakers
```

---

## 🔍 АНАЛИЗ ТЕКУЩЕГО СОСТОЯНИЯ

### ✅ Что уже есть:
- `UniversalProviderManager` - базовая архитектура
- `KieAiProvider` - видео провайдер
- Функции генерации в разных модулях
- Единичные тесты (например, `generateImageToVideo.test.ts`)

### ❌ Проблемы:
1. **Классовая архитектура** вместо функциональной
2. **Разрозненные провайдеры** по разным папкам
3. **Смешанная ответственность** (логика + побочные эффекты)
4. **Слабое покрытие тестами** (~30%)
5. **Hardcoded провайдеры** без возможности замены
6. **Отсутствие pipeline** архитектуры
7. **Нет валидации входных данных**
8. **Отсутствие error handling** в функциональном стиле

---

## 🛠️ ROADMAP ВЫПОЛНЕНИЯ

### ЭТАП 1: Foundations (1 неделя)
**Ответственный**: Functional Architecture Agent
**Задачи**:
- [ ] Создать типы с io-ts (VideoRequest, ImageRequest, AudioRequest)
- [ ] Создать схемы валидации
- [ ] Создать Result/Either типы для error handling
- [ ] Создать базовые TypeScript utility типы
- [ ] Настроить Jest + Vitest + ts-auto-mock для тестирования

### ЭТАП 2: Provider Adapters (2 недели)
**Ответственный**: Provider Adapter Agent
**Задачи**:
- [ ] KieAiAdapter (функциональный стиль)
- [ ] ReplicateAdapter
- [ ] ElevenLabsAdapter
- [ ] FalAdapter
- [ ] OpenRouterAdapter
- [ ] ProviderRegistry (функциональный диспетчер)
- [ ] CircuitBreaker для каждого провайдера
- [ ] Health checks для каждого провайдера

### ЭТАП 3: Core Generation Functions (2 недели)
**Ответственный**: Core Generation Agent
**Задачи**:
- [ ] videoGenerationPipeline (functional composition)
- [ ] imageGenerationPipeline
- [ ] audioGenerationPipeline
- [ ] faceSwapPipeline
- [ ] ValidationPipeline
- [ ] CostCalculationPipeline
- [ ] RateLimitingPipeline

### ЭТАП 4: Pipeline Composition (1 неделя)
**Ответственный**: Pipeline Orchestrator Agent
**Задачи**:
- [ ] MediaPipeline (универсальный)
- [ ] ProviderSelector (стратегия выбора)
- [ ] FallbackStrategy
- [ ] RetryStrategy
- [ ] TimeoutStrategy
- [ ] LoadBalancer
- [ ] CachingLayer

### ЭТАП 5: Testing Infrastructure (2 недели)
**Ответственный**: Test Engineering Agent
**Задачи**:
- [ ] Unit tests для всех функций (100% coverage)
- [ ] Integration tests для провайдеров
- [ ] Property-based tests с fast-check
- [ ] Mock провайдеры для тестов
- [ ] Test fixtures
- [ ] Snapshot testing
- [ ] Performance benchmarks
- [ ] E2E тесты с реальными провайдерами

### ЭТАП 6: Migration & Integration (1 неделя)
**Ответственный**: Migration Agent
**Задачи**:
- [ ] Интеграция с существующими scene'ами
- [ ] Миграция UniversalProviderManager
- [ ] Обновление всех endpoints
- [ ] Backward compatibility
- [ ] Performance profiling
- [ ] Production monitoring

---

## 📐 ФУНКЦИОНАЛЬНЫЕ ПРИНЦИПЫ

### 1. **Pure Functions**
```typescript
// ❌ Impure
class VideoProvider {
  async generate(): Promise<VideoResult> {
    const response = await axios.post(...)
    logger.info('Generated video')
    return response.data
  }
}

// ✅ Pure
type GenerateVideo = (
  request: VideoRequest,
  config: ProviderConfig
) => TaskEither<Error, VideoResult>

const generateVideo: GenerateVideo = (request, config) =>
  pipe(
    validateRequest(request),
    chain(validateProviderConfig(config)),
    chain(performGeneration),
    map(processResult)
  )
```

### 2. **Function Composition**
```typescript
const videoGenerationPipeline = pipe(
  validateInput,
  chooseProvider,
  retryOnFailure,
  applyTimeout,
  mapToResult
)
```

### 3. **Immutability**
```typescript
// ❌ Mutable
let result = await generate()
result.status = 'processed'
return result

// ✅ Immutable
const generateAndProcess = (request) =>
  pipe(
    generate(request),
    map(result => ({ ...result, status: 'processed' }))
  )
```

### 4. **Type Safety**
```typescript
// ❌ Weak typing
function generateVideo(params: any): Promise<any> { }

// ✅ Strong typing
import { Type } from 'io-ts'

const VideoRequest = Type.strict({
  prompt: Type.string,
  model: ModelId,
  duration: Type.number
})

type VideoRequest = TypeOf<typeof VideoRequest>
```

### 5. **Error Handling**
```typescript
// ❌ Exceptions
try {
  const result = await generate()
  return result
} catch (error) {
  logger.error(error)
  throw error
}

// ✅ Result/Either
pipe(
  generate(),
  mapLeft(handleError),
  fold(sendError, returnSuccess)
)
```

---

## 🧪 ТЕСТИРОВАНИЕ СТРАТЕГИЯ

### 1. **Unit Tests (Jest)**
- Pure functions - 100% coverage
- Providers adapters - 100% coverage
- Pipeline composition - 100% coverage
- Validation - 100% coverage
- Helpers - 100% coverage

### 2. **Integration Tests (Vitest)**
- Provider API integration
- Database integration
- External service integration
- Real provider testing (mocked)

### 3. **Property-Based Tests (fast-check)**
- Generative testing for all functions
- Invariant testing
- Regression testing

### 4. **E2E Tests (Playwright)**
- Full pipeline testing
- Real provider flows
- Error scenarios
- Performance tests

---

## 📊 МЕТРИКИ КАЧЕСТВА

### Code Coverage
- **Unit Tests**: 100% lines, branches, functions
- **Integration Tests**: 90%+ of code paths
- **E2E Tests**: All critical user flows

### Performance
- Pipeline latency: <100ms overhead
- Provider response time: Real-time monitoring
- Memory usage: <50MB per request

### Reliability
- Circuit breaker activation: <1%
- Provider failover: <5s
- Error rate: <0.1%

---

## 🏗️ НОВАЯ АРХИТЕКТУРА

```
src/
├── core/
│   ├── functional/
│   │   ├── types/
│   │   │   ├── media.types.ts
│   │   │   ├── provider.types.ts
│   │   │   └── pipeline.types.ts
│   │   ├── utils/
│   │   │   ├── result.ts
│   │   │   ├── validation.ts
│   │   │   └── composition.ts
│   │   └── testing/
│   │       ├── mocks/
│   │       ├── fixtures/
│   │       └── generators/
│   ├── providers/
│   │   ├── adapters/
│   │   │   ├── kie-ai.adapter.ts
│   │   │   ├── replicate.adapter.ts
│   │   │   ├── elevenlabs.adapter.ts
│   │   │   ├── fal.adapter.ts
│   │   │   └── openrouter.adapter.ts
│   │   ├── registry/
│   │   │   ├── provider-registry.ts
│   │   │   ├── health-monitor.ts
│   │   │   ├── circuit-breaker.ts
│   │   │   └── load-balancer.ts
│   │   └── config/
│   │       ├── providers.config.ts
│   │       └── provider-selector.ts
│   ├── pipeline/
│   │   ├── video/
│   │   │   ├── video.pipeline.ts
│   │   │   ├── validators.ts
│   │   │   └── processors.ts
│   │   ├── image/
│   │   │   ├── image.pipeline.ts
│   │   │   ├── validators.ts
│   │   │   └── processors.ts
│   │   ├── audio/
│   │   │   ├── audio.pipeline.ts
│   │   │   ├── validators.ts
│   │   │   └── processors.ts
│   │   └── orchestration/
│   │       ├── media-orchestrator.ts
│   │       ├── fallback-strategy.ts
│   │       └── rate-limiter.ts
│   └── services/
│       ├── generation.service.ts
│       ├── validation.service.ts
│       ├── caching.service.ts
│       └── monitoring.service.ts
├── tests/
│   ├── unit/
│   │   ├── providers/
│   │   ├── pipeline/
│   │   ├── services/
│   │   └── utils/
│   ├── integration/
│   │   ├── provider-integration/
│   │   ├── pipeline-integration/
│   │   └── e2e/
│   ├── property/
│   │   ├── providers.properties.ts
│   │   ├── pipeline.properties.ts
│   │   └── utils.properties.ts
│   ├── fixtures/
│   │   ├── media-fixtures.ts
│   │   └── provider-fixtures.ts
│   └── mocks/
│       ├── providers.mocks.ts
│       └── services.mocks.ts
└── examples/
    ├── basic-usage.ts
    ├── advanced-pipeline.ts
    └── provider-selection.ts
```

---

## 🎯 ДЕТАЛЬНЫЕ ЗАДАЧИ

### 1. Создать Type System
```typescript
// Media Types
export type MediaType = 'video' | 'image' | 'audio' | 'face-swap'

export interface MediaRequest {
  prompt: string
  model: ModelId
  userId: string
  metadata?: Record<string, unknown>
}

// Provider Types
export interface Provider {
  name: ProviderName
  capabilities: MediaType[]
  health: HealthStatus
}

// Pipeline Types
export type PipelineStep<T, R> = (input: T) => TaskEither<Error, R>

export type MediaPipeline = PipelineStep<MediaRequest, MediaResult>

// Result Types (functional Either)
export type Success<T> = { _tag: 'Success'; value: T }
export type Failure<E> = { _tag: 'Failure'; error: E }
export type Result<T, E = Error> = Success<T> | Failure<E>

export type TaskEither<E, A> = () => Promise<Result<A, E>>
```

### 2. Create Provider Adapters
```typescript
// KieAiAdapter
export const KieAiAdapter = (config: KieAiConfig) => ({
  generateVideo: (request: VideoRequest): TaskEither<Error, VideoResult> =>
    pipe(
      validateVideoRequest(request),
      chain(buildKieAiPayload),
      chain(callKieAiApi),
      map(processKieAiResponse)
    ),

  healthCheck: (): TaskEither<Error, HealthStatus> =>
    callKieAiApi('/health')
})

// ReplicateAdapter
export const ReplicateAdapter = (config: ReplicateConfig) => ({
  generateVideo: (request: VideoRequest): TaskEither<Error, VideoResult> =>
    pipe(
      validateVideoRequest(request),
      chain(buildReplicatePayload),
      chain(callReplicateApi),
      map(processReplicateResponse)
    )
})

// ElevenLabsAdapter
export const ElevenLabsAdapter = (config: ElevenLabsConfig) => ({
  generateAudio: (request: AudioRequest): TaskEither<Error, AudioResult> =>
    pipe(
      validateAudioRequest(request),
      chain(buildElevenLabsPayload),
      chain(callElevenLabsApi),
      map(processElevenLabsResponse)
    )
})
```

### 3. Create Pipeline Composition
```typescript
// Video Pipeline
export const videoGenerationPipeline = (
  providers: ProviderRegistry,
  config: PipelineConfig
): MediaPipeline => (request) =>
  pipe(
    // Step 1: Validate
    validateInput(request),

    // Step 2: Select Provider
    chain(selectProvider(providers)),

    // Step 3: Check Circuit Breaker
    chain(checkCircuitBreaker),

    // Step 4: Rate Limit
    chain(rateLimit(config)),

    // Step 5: Generate
    chain(callProvider),

    // Step 6: Post-process
    map(postProcess),

    // Step 7: Cache result
    chain(cacheResult),

    // Step 8: Monitor
    tap(monitorSuccess),

    // Step 9: Return
    map(sendResponse)
  )

// Image Pipeline
export const imageGenerationPipeline = (
  providers: ProviderRegistry,
  config: PipelineConfig
): MediaPipeline => (request) =>
  pipe(
    validateInput(request),
    chain(selectProvider(providers)),
    chain(checkCircuitBreaker),
    chain(callProvider),
    map(postProcess),
    chain(cacheResult),
    map(sendResponse)
  )
```

### 4. Create Provider Registry
```typescript
export const createProviderRegistry = (
  providers: ProviderConfig[]
): ProviderRegistry => {
  const registry = new Map<ProviderName, Provider>()

  // Register providers
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

### 5. Create Tests
```typescript
// Unit Test Example
describe('KieAiAdapter', () => {
  it('should generate video with valid request', async () => {
    const adapter = KieAiAdapter(testConfig)
    const request = validVideoRequest

    const result = await adapter.generateVideo(request)()

    expect(result._tag).toBe('Success')
    if (result._tag === 'Success') {
      expect(result.value.videoUrl).toBeDefined()
    }
  })

  it('should return Failure for invalid request', async () => {
    const adapter = KieAiAdapter(testConfig)
    const request = invalidVideoRequest

    const result = await adapter.generateVideo(request)()

    expect(result._tag).toBe('Failure')
  })
})

// Integration Test Example
describe('Video Generation Pipeline', () => {
  it('should complete full pipeline with mock provider', async () => {
    const providers = createProviderRegistry([mockProviderConfig])
    const pipeline = videoGenerationPipeline(providers, testConfig)

    const result = await pipeline(validRequest)()

    expect(result._tag).toBe('Success')
  })

  it('should fallback to backup provider on failure', async () => {
    const providers = createProviderRegistry([
      failingProviderConfig,
      backupProviderConfig
    ])
    const pipeline = videoGenerationPipeline(providers, testConfig)

    const result = await pipeline(validRequest)()

    // Should succeed with backup provider
    expect(result._tag).toBe('Success')
  })
})

// Property-Based Test Example
describe('Video Generation - Property Tests', () => {
  it('should always return Success or Failure', () => {
    fc.assert(
      fc.property(fcArbitraryVideoRequest, async (request) => {
        const adapter = KieAiAdapter(testConfig)
        const result = await adapter.generateVideo(request)()

        return result._tag === 'Success' || result._tag === 'Failure'
      })
    )
  })

  it('should handle timeouts gracefully', () => {
    fc.assert(
      fc.property(fcArbitraryVideoRequest, fcArbitraryTimeout, async (request, timeout) => {
        const adapter = KieAiAdapter({ ...testConfig, timeout })
        const result = await adapter.generateVideo(request)()

        return result._tag === 'Success' || result._tag === 'Failure'
      })
    )
  })
})
```

---

## 🎓 ОБУЧЕНИЕ АГЕНТОВ

### Agent 1: Functional Architecture Agent
**Ответственный за**: Foundations + Pipeline Composition
**Обучение**:
- Functional programming patterns in TypeScript
- fp-ts library patterns
- io-ts for type validation
- Function composition (pipe, flow)
- Monads (Task, Either, Maybe)
- Immutability patterns

### Agent 2: Provider Adapter Agent
**Ответственный за**: Provider Adapters
**Обучение**:
- Adapter pattern in functional style
- API integration patterns
- Error handling strategies
- Circuit breaker pattern
- Health monitoring
- Request/Response transformation

### Agent 3: Test Engineering Agent
**Ответственный за**: Testing Infrastructure
**Обучение**:
- Jest best practices
- Vitest advanced features
- Property-based testing with fast-check
- Mock strategies
- Test fixtures
- Snapshot testing
- Performance testing

### Agent 4: Migration Agent
**Ответственный за**: Migration & Integration
**Обучение**:
- Migration patterns
- Backward compatibility
- Performance profiling
- Monitoring and alerting
- Rollback strategies

---

## 📅 TIMELINE

```
Week 1-2: Foundations + Type System
Week 3-4: Provider Adapters (KieAi, Replicate, ElevenLabs)
Week 5-6: Provider Adapters (Fal, OpenRouter) + Core Functions
Week 7-8: Pipeline Composition + Orchestration
Week 9-10: Testing Infrastructure + Coverage
Week 11-12: Migration + Integration + E2E Tests
Week 13: Performance Optimization + Documentation
```

---

## 🎯 SUCCESS CRITERIA

### Code Quality
- [ ] 100% unit test coverage
- [ ] 90%+ integration test coverage
- [ ] Zero runtime type errors
- [ ] All functions are pure
- [ ] Immutable data structures

### Architecture
- [ ] Providers are swappable
- [ ] Pipeline is composable
- [ ] Error handling is consistent
- [ ] Validation is strict
- [ ] Performance is optimized

### Testing
- [ ] Unit tests for all functions
- [ ] Integration tests for all providers
- [ ] Property-based tests for critical functions
- [ ] E2E tests for all flows
- [ ] Performance benchmarks

### Migration
- [ ] Backward compatibility maintained
- [ ] Zero downtime migration
- [ ] Performance monitoring in place
- [ ] Documentation complete
- [ ] Team training done

---

## 🚀 IMMEDIATE NEXT STEPS

1. **Создать агентов** с обучением на лучших практиках
2. **Начать с Foundations** - типы и схемы
3. **Создать KieAiAdapter** как proof of concept
4. **Написать тесты** для адаптера
5. **Создать pipeline** и композицию
6. **Итерировать** на остальных провайдерах

---

**КОНЕЧНАЯ ЦЕЛЬ**: Создать полностью функциональную, тестируемую, масштабируемую архитектуру генерации медиа с 100% покрытием тестами и легко заменяемыми провайдерами.