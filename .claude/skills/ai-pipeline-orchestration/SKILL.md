---
name: ai-pipeline-orchestration
description: AI generation pipelines, provider orchestration patterns, functional architecture, lipsync systems, and multi-provider media generation with failover and caching
---

# AI Pipeline Orchestration Skill

Expert knowledge of the AI generation pipeline architecture in this project.

## Architecture Overview

This project uses a **multi-provider, functional pipeline architecture** for AI media generation:

- **Provider abstraction** - Unified interface for multiple AI providers
- **Functional programming** - Pure functions, Either/TaskEither patterns
- **Pipeline composition** - Chainable operations
- **Orchestration layer** - Routes requests to appropriate pipelines
- **Failover support** - Automatic retry with backup providers
- **Caching** - Results cached for efficiency

## Core Concepts

### 1. Provider Pattern

```typescript
// Interface all providers implement
interface IProvider {
  name: string
  supportedModels: string[]
  generate(input: Input): Promise<Output | Error>
  estimateCost(input: Input): number
}

// Multiple implementations
class ReplicateProvider implements IProvider {}
class FalProvider implements IProvider {}
class KieAiProvider implements IProvider {}
```

### 2. Orchestrator Pattern

_Target shape only — no `MediaOrchestrator` exists in this repository; see
"Pipeline Types" below._

```typescript
// Routes requests to correct pipeline
class MediaOrchestrator {
  generate(request: MediaRequest): TaskEither<Error, MediaResult> {
    if (isVideoRequest(request)) return videoPipeline(request)
    if (isImageRequest(request)) return imagePipeline(request)
    if (isAudioRequest(request)) return audioPipeline(request)
    // ...
  }
}
```

### 3. Functional Pipeline

_Target shape only — `videoPipeline` and its siblings were deleted with
`src/core/pipeline/`; see "Pipeline Types" below._

```typescript
// Functional composition with Either pattern
const videoPipeline = pipe(
  validateInput,
  selectProvider,
  checkCache,
  generateVideo,
  saveToDatabase,
  notifyUser
)
```

## Pipeline Types

> **The `src/core/pipeline/` layer does not exist.** `media-orchestrator.ts`
> and the four `*.pipeline.ts` modules (video, image, audio, face-swap) were
> added in a checkpoint commit on 2025-10-31, never imported by anything under
> `src/`, and deleted as dead code on 2025-11-12 in commit `9ce763c2a`.
> Nothing replaced them — there is no composed generation pipeline and no
> `MediaOrchestrator` in this repository. Generation runs through one service
> per model, called directly from scenes, handlers, API routes and Inngest
> functions. The composition examples in this skill describe the target shape,
> not code you can open.

The sections below list the entry points that actually run in the tree today,
with the provider coverage each of them has.

### 1. Video Generation

**Entry points**: `src/services/generateTextToVideo.ts` and
`src/services/generateImageToVideo.ts`, called from
`src/handlers/handleTextToVideoDirect.ts` and
`src/handlers/handleImageToVideoDirect.ts`.

**Supported Providers:**

- Fal.ai (Veo 3.1, Minimax, Wan2.5)
- Replicate (Kling, various models)
- KieAI (Kling provider)

### 2. Image Generation

**Entry points**: `src/services/generateTextToImageDirect.ts` (used by
`src/scenes/textToImageWizard/index.ts`) and
`src/services/generateNeuroPhotoDirect.ts` /
`src/services/generateNeuroPhotoHybrid.ts` (used by
`src/scenes/neuroPhotoWizard/index.ts`). Other models each get their own
`src/services/generate*.ts` file.

**Providers:**

- Replicate (Flux, SDXL, various models)
- Fal.ai (Flux models)
- OpenAI (DALL-E)

### 3. Audio Generation

**Entry points**: `src/core/elevenlabs/createAudioFileFromText.ts` (used by
`src/scenes/textToSpeechWizard/index.ts` and the reels wizards) and
`src/services/generateVoiceAvatar.ts` (used by
`src/api_server/routes/voice-avatar.routes.ts`).

**Providers:**

- ElevenLabs (voice cloning, TTS)
- OpenAI (TTS)

### 4. Face Swap

**Entry point**: `src/services/generateFaceSwap.ts`, called from
`src/scenes/faceSwapWizard/index.ts`.

**Providers:**

- Replicate (face swap models)
- Fal.ai (face swap)

## LipSync System (Advanced)

### Architecture

```
src/core/lipsync/
├── lipsync-orchestrator.ts      # Main orchestrator
├── async-lipsync-manager.ts     # Async operations
├── providers/
│   ├── provider-factory.ts      # Provider factory
│   ├── fal-veo31-provider.ts    # Fal Veo provider
│   ├── fal-wan25-provider.ts    # Fal Wan provider
│   ├── replicate-kling-provider.ts
│   ├── kie-veed-fabric-provider.ts
│   └── sync-lipsync-provider.ts
├── functional/                   # Functional core
│   ├── manager.ts
│   ├── providers.ts
│   ├── factory.ts
│   ├── types.ts
│   └── validators.ts
├── interfaces/
│   └── lipsync-provider.interface.ts
└── schemas/
    └── lipsync-schemas.ts        # Zod schemas
```

### LipSync Provider Interface

```typescript
interface ILipSyncProvider {
  name: string
  supportedModels: string[]
  generate(input: UniversalLipSyncInput): Promise<LipSyncOutput | LipSyncError>
}
```

### LipSync Orchestrator Usage

```typescript
import { LipSyncOrchestrator } from '@/core/lipsync/lipsync-orchestrator'

const orchestrator = LipSyncOrchestrator.getInstance()

const result = await orchestrator.generate({
  provider: 'fal',
  modelId: 'veo-31',
  videoUrl: 'https://example.com/video.mp4',
  audioUrl: 'https://example.com/audio.mp3',
  telegramId: '123456',
})

if ('message' in result && 'error' in result) {
  // Error handling
  console.error('LipSync failed:', result.message)
} else {
  // Success
  console.log('Result video:', result.output)
}
```

### Provider Factory Pattern

```typescript
// Factory creates providers on demand
class LipSyncProviderFactory {
  createProvider(providerName: string): ILipSyncProvider {
    switch (providerName) {
      case 'fal-veo31':
        return new FalVeo31Provider()
      case 'fal-wan25':
        return new FalWan25Provider()
      case 'replicate-kling':
        return new ReplicateKlingProvider()
      case 'kie-veed-fabric':
        return new KieVeedFabricProvider()
      default:
        throw new Error(`Unknown provider: ${providerName}`)
    }
  }
}

const factory = LipSyncProviderFactory.getInstance()
const provider = factory.createProvider('fal-veo31')
```

### Supported LipSync Models

```typescript
const LIPSYNC_MODELS = {
  // Fal.ai providers
  'fal-veo31': ['veo-31', 'veo-31-pro'],
  'fal-wan25': ['wan-2.5', 'wan-2.5-turbo'],
  'fal-veed-fabric': ['veed-fabric'],

  // Replicate
  'replicate-kling': ['kling-v1.6', 'kling-v1.6-pro'],

  // KieAI
  'kie-veed-fabric': ['veed-fabric-kie'],
}
```

## Provider Registry

### Registry Pattern

```typescript
class ProviderRegistry {
  private providers: Map<string, IProvider> = new Map()

  register(name: string, provider: IProvider): void {
    this.providers.set(name, provider)
  }

  get(name: string): IProvider | undefined {
    return this.providers.get(name)
  }

  getByModel(modelId: string): IProvider | undefined {
    return Array.from(this.providers.values()).find(p =>
      p.supportedModels.includes(modelId)
    )
  }
}
```

### Usage

```typescript
const registry = new ProviderRegistry()

// Register providers
registry.register('replicate', new ReplicateProvider())
registry.register('fal', new FalProvider())
registry.register('kie', new KieAiProvider())

// Get provider by name
const provider = registry.get('replicate')

// Get provider by model
const provider = registry.getByModel('flux-schnell')
```

## Functional Programming Patterns

### TaskEither Pattern

```typescript
import { TaskEither, left, right } from './functional/utils/result'

// TaskEither<Error, Result> = async function that returns Either<Error, Result>
type TaskEither<E, A> = () => Promise<Either<E, A>>

// Either is Left (error) or Right (success)
type Either<E, A> = Left<E> | Right<A>

// Example usage
const generateVideo =
  (input: VideoInput): TaskEither<Error, VideoOutput> =>
  async () => {
    try {
      const result = await api.generate(input)
      return right(result) // Success
    } catch (error) {
      return left(new Error('Generation failed')) // Error
    }
  }

// Chain operations
const pipeline = pipe(
  validateInput,
  chain(selectProvider),
  chain(generateVideo),
  chain(saveResult)
)
```

### Pipe Composition

```typescript
import { pipe } from './functional/utils/composition'

// Compose functions left-to-right
const process = pipe(input, step1, step2, step3)

// Equivalent to: step3(step2(step1(input)))
```

### Tap for Side Effects

```typescript
import { tap } from './functional/utils/composition'

const pipeline = pipe(
  input,
  tap(logInput), // Log without changing value
  processData,
  tap(logOutput), // Log result
  saveToDatabase
)
```

## Caching Strategy

### Cache Interface

```typescript
interface Cache<T> {
  get(key: string): Promise<T | null>
  set(key: string, value: T, ttl?: number): Promise<void>
  delete(key: string): Promise<void>
  clear(): Promise<void>
}
```

### Cache Implementation

```typescript
class MediaCache<T> implements Cache<T> {
  private cache: Map<string, { value: T; expiry: number }> = new Map()

  async get(key: string): Promise<T | null> {
    const entry = this.cache.get(key)
    if (!entry) return null

    if (Date.now() > entry.expiry) {
      this.cache.delete(key)
      return null
    }

    return entry.value
  }

  async set(key: string, value: T, ttl: number = 3600): Promise<void> {
    const expiry = Date.now() + ttl * 1000
    this.cache.set(key, { value, expiry })
  }
}
```

### Usage in Pipeline

```typescript
const checkCache =
  (cache: Cache<VideoResult>) =>
  (input: VideoInput): TaskEither<Error, VideoResult> =>
  async () => {
    const cacheKey = generateCacheKey(input)
    const cached = await cache.get(cacheKey)

    if (cached) {
      logger.info('✅ Cache hit', { cacheKey })
      return right(cached)
    }

    // Generate and cache
    const result = await generateVideo(input)
    await cache.set(cacheKey, result, 3600) // 1 hour TTL

    return result
  }
```

## Error Handling

### Provider Error Types

```typescript
type ProviderError =
  | { code: 'RATE_LIMIT'; message: string; retryAfter?: number }
  | { code: 'INVALID_INPUT'; message: string; field: string }
  | { code: 'PROVIDER_ERROR'; message: string; provider: string }
  | { code: 'TIMEOUT'; message: string; duration: number }
  | { code: 'UNSUPPORTED_MODEL'; message: string; modelId: string }
```

### Error Recovery

```typescript
const generateWithFailover = async (
  input: VideoInput,
  providers: IProvider[]
): Promise<VideoResult | Error> => {
  let lastError: Error

  for (const provider of providers) {
    try {
      logger.info('Trying provider', { provider: provider.name })
      const result = await provider.generate(input)
      return result
    } catch (error) {
      logger.warn('Provider failed, trying next', {
        provider: provider.name,
        error: error.message,
      })
      lastError = error
    }
  }

  throw new Error(`All providers failed. Last error: ${lastError.message}`)
}
```

## Cost Estimation

### Cost Calculator

```typescript
interface CostEstimator {
  estimateVideoCost(duration: number, model: string): number
  estimateImageCost(size: string, model: string): number
  estimateAudioCost(duration: number, voice: string): number
}

class MediaCostEstimator implements CostEstimator {
  private costs = {
    video: {
      'veo-3-fast': 40,
      'veo-3': 120,
      'kling-v1.6-pro': 60,
      minimax: 50,
    },
    image: {
      'flux-schnell': 10,
      'flux-dev': 30,
      sdxl: 15,
    },
    audio: {
      elevenlabs: duration => Math.ceil(duration / 60) * 5,
      'openai-tts': duration => Math.ceil(duration / 60) * 2,
    },
  }

  estimateVideoCost(duration: number, model: string): number {
    const baseCost = this.costs.video[model] || 50
    // Longer videos cost more
    return duration > 10 ? baseCost * 2 : baseCost
  }
}
```

## Provider-Specific Patterns

### Replicate Provider

```typescript
import Replicate from 'replicate'

class ReplicateProvider implements IProvider {
  private client: Replicate

  constructor() {
    this.client = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    })
  }

  async generate(input: VideoInput): Promise<VideoOutput> {
    // Start prediction
    const prediction = await this.client.predictions.create({
      version: input.model,
      input: {
        prompt: input.prompt,
        // ...
      },
    })

    // Poll for completion
    let result = prediction
    while (result.status !== 'succeeded' && result.status !== 'failed') {
      await new Promise(resolve => setTimeout(resolve, 5000))
      result = await this.client.predictions.get(result.id)
    }

    if (result.status === 'failed') {
      throw new Error(result.error)
    }

    return {
      videoUrl: result.output,
      predictionId: result.id,
      cost: this.estimateCost(input),
    }
  }
}
```

### Fal.ai Provider

```typescript
import * as fal from '@fal-ai/client'

class FalProvider implements IProvider {
  constructor() {
    fal.config({
      credentials: process.env.FAL_KEY,
    })
  }

  async generate(input: VideoInput): Promise<VideoOutput> {
    // Queue submission (async)
    const { request_id } = await fal.queue.submit('fal-ai/veo-31', {
      prompt: input.prompt,
      duration: input.duration,
    })

    // Get result
    const result = await fal.queue.result('fal-ai/veo-31', {
      requestId: request_id,
    })

    return {
      videoUrl: result.video.url,
      requestId: request_id,
      cost: this.estimateCost(input),
    }
  }
}
```

### KieAI Provider

```typescript
import axios from 'axios'

class KieAiProvider implements IProvider {
  private apiUrl = 'https://api.kie.ai/v1'

  async generate(input: VideoInput): Promise<VideoOutput> {
    // Submit job
    const response = await axios.post(
      `${this.apiUrl}/generate`,
      {
        model: input.model,
        prompt: input.prompt,
        // ...
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.KIE_API_KEY}`,
        },
      }
    )

    const jobId = response.data.job_id

    // Poll for result
    while (true) {
      const status = await axios.get(`${this.apiUrl}/status/${jobId}`)

      if (status.data.status === 'completed') {
        return {
          videoUrl: status.data.output_url,
          jobId,
          cost: this.estimateCost(input),
        }
      }

      if (status.data.status === 'failed') {
        throw new Error(status.data.error)
      }

      await new Promise(resolve => setTimeout(resolve, 5000))
    }
  }
}
```

## Best Practices

### 1. Provider Selection Logic

```typescript
const selectBestProvider = (
  input: VideoInput,
  providers: IProvider[]
): IProvider => {
  // Filter by model support
  const compatible = providers.filter(p =>
    p.supportedModels.includes(input.model)
  )

  if (compatible.length === 0) {
    throw new Error(`No provider supports model: ${input.model}`)
  }

  // Sort by cost
  compatible.sort((a, b) => a.estimateCost(input) - b.estimateCost(input))

  // Return cheapest
  return compatible[0]
}
```

### 2. Retry Strategy

```typescript
const withRetry = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> => {
  let attempt = 0

  while (attempt < maxRetries) {
    try {
      return await fn()
    } catch (error) {
      attempt++

      if (attempt >= maxRetries) {
        throw error
      }

      logger.warn('Retry attempt', { attempt, maxRetries })
      await new Promise(resolve => setTimeout(resolve, delay * attempt))
    }
  }

  throw new Error('Max retries exceeded')
}
```

### 3. Request Validation

```typescript
import { z } from 'zod'

const VideoRequestSchema = z.object({
  prompt: z.string().min(1).max(1000),
  model: z.enum(['veo-3-fast', 'veo-3', 'kling-v1.6-pro', 'minimax']),
  duration: z.number().min(1).max(60),
  aspectRatio: z.enum(['16:9', '9:16', '1:1']).optional(),
  telegramId: z.string(),
})

const validateVideoRequest = (input: any): VideoInput => {
  const result = VideoRequestSchema.safeParse(input)

  if (!result.success) {
    throw new Error(`Invalid input: ${result.error.message}`)
  }

  return result.data
}
```

### 4. Logging Strategy

```typescript
// Log at pipeline start
logger.info('🎬 Video generation started', {
  telegramId: input.telegramId,
  model: input.model,
  provider: provider.name,
})

// Log each step
logger.info('⏳ Submitting to provider', { provider: provider.name })

// Log completion
logger.info('✅ Video generated successfully', {
  duration: Date.now() - startTime,
  videoUrl: result.videoUrl,
  cost: result.cost,
})

// Log errors
logger.error('❌ Generation failed', {
  error: error.message,
  provider: provider.name,
  input: input,
})
```

## Integration with Telegram Bot

### From Scene to Pipeline

_Illustrative: `MediaOrchestrator` does not exist. A real scene calls the
per-model service directly — see `src/scenes/faceSwapWizard/index.ts` or
`src/handlers/handleTextToVideoDirect.ts`._

```typescript
// In Telegram scene
myScene.action('generate-video', async ctx => {
  await ctx.answerCbQuery()
  const isRu = isRussianFromState(ctx)

  const input: VideoInput = {
    prompt: ctx.session.prompt,
    model: ctx.session.selectedModel,
    duration: 10,
    aspectRatio: '16:9',
    telegramId: ctx.from!.id.toString(),
  }

  await ctx.reply('⏳ Generating video...')

  try {
    // Use orchestrator
    const orchestrator = MediaOrchestrator.getInstance()
    const result = await orchestrator.generateVideo(input)()

    if ('left' in result) {
      throw result.left
    }

    // Send result
    await ctx.replyWithVideo(result.right.videoUrl, {
      caption: `✅ Video ready! Cost: ${result.right.cost}⭐`,
    })
  } catch (error) {
    logger.error('Video generation failed', { error })
    await ctx.reply(
      isRu
        ? '❌ Ошибка генерации. Попробуйте позже.'
        : '❌ Generation error. Try again later.'
    )
  }
})
```

## Performance Optimization

### 1. Parallel Processing

```typescript
const generateBatch = async (inputs: VideoInput[]): Promise<VideoResult[]> => {
  // Generate all in parallel
  const promises = inputs.map(input => orchestrator.generateVideo(input)())

  const results = await Promise.all(promises)

  return results.filter(r => 'right' in r).map(r => r.right)
}
```

### 2. Connection Pooling

```typescript
class ProviderClient {
  private client: Replicate
  private requestsInFlight = 0
  private maxConcurrent = 10

  async generate(input: any): Promise<any> {
    // Wait if at limit
    while (this.requestsInFlight >= this.maxConcurrent) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    this.requestsInFlight++

    try {
      return await this.client.predictions.create(input)
    } finally {
      this.requestsInFlight--
    }
  }
}
```

### 3. Result Streaming

```typescript
// Stream results as they complete
const generateWithUpdates = async (
  input: VideoInput,
  onProgress: (progress: number) => void
): Promise<VideoResult> => {
  const provider = selectProvider(input)

  let progress = 0
  const interval = setInterval(() => {
    progress += 10
    onProgress(Math.min(progress, 90))
  }, 5000)

  try {
    const result = await provider.generate(input)
    onProgress(100)
    return result
  } finally {
    clearInterval(interval)
  }
}
```

## Critical Patterns Summary

1. ✅ **Use provider abstraction** for all AI services
2. ✅ **Implement failover** with multiple providers
3. ✅ **Cache results** to save costs
4. ✅ **Validate inputs** with Zod schemas
5. ✅ **Log all operations** with emojis + context
6. ✅ **Handle errors gracefully** with Either pattern
7. ✅ **Estimate costs** before generation
8. ✅ **Use functional composition** for pipelines
9. ✅ **Implement retry logic** for transient failures
10. ✅ **Monitor provider health** and switch automatically

This is the foundation of reliable, cost-effective AI media generation at scale!
