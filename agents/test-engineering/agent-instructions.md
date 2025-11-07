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
