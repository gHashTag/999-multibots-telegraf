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
