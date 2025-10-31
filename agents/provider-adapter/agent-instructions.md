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
