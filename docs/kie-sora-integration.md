# Kie.ai Sora 2 Integration

## Overview

This integration provides access to OpenAI's Sora 2 video generation models through Kie.ai's API. Sora 2 is capable of generating high-quality videos from text prompts using a job-based asynchronous workflow.

## Models

### Sora 2 Standard (`sora-2-text-to-video`)
- **Pricing**: 30 credits ($0.15) per 10 seconds
- **Quality**: Standard quality video generation
- **Use case**: General purpose video generation

### Sora 2 Pro (`sora-2-pro-text-to-video`)
- **Pricing**: 40 credits ($0.20) per 10 seconds
- **Quality**: Higher quality video generation
- **Use case**: Professional-grade video content

## API Endpoints

### Create Task
```
POST /api/v1/jobs/createTask
```

**Request:**
```typescript
{
  model: 'sora-2-text-to-video' | 'sora-2-pro-text-to-video',
  callBackUrl?: string,
  input: {
    prompt: string,
    aspect_ratio?: 'landscape' | 'portrait',
    remove_watermark?: boolean
  }
}
```

**Response:**
```typescript
{
  code: 200,
  msg: 'success',
  data: {
    taskId: string
  }
}
```

### Check Task Status
```
GET /api/v1/jobs/taskStatus?taskId={taskId}
```

**Response:**
```typescript
{
  code: 200,
  msg: 'success',
  data: {
    taskId: string,
    status: 'pending' | 'processing' | 'completed' | 'failed',
    successFlag: 0 | 1 | 2 | 3,
    videoUrl?: string,
    resultUrls?: string[],
    errorMessage?: string,
    duration?: number
  }
}
```

## Usage

### Basic Video Generation

```typescript
import { KieAiProvider } from './services/video-providers/KieAiProvider'

const provider = new KieAiProvider()

// Generate video
const result = await provider.generateSoraVideo(
  'A serene sunset over a calm ocean',
  'sora-2-text-to-video',
  'landscape',
  false
)

if (result.success && result.data?.taskId) {
  console.log('Task created:', result.data.taskId)
  console.log('Cost:', result.cost.stars, 'stars')
}
```

### With Polling

```typescript
// Generate and poll for completion
const result = await provider.generateSoraVideo(
  'A futuristic cityscape at night',
  'sora-2-pro-text-to-video'
)

if (result.success && result.data?.taskId) {
  // Poll with automatic retry and exponential backoff
  const finalResult = await provider.pollSoraTaskStatus(
    result.data.taskId,
    180000 // Max 3 minutes
  )

  if (finalResult.success && finalResult.data?.videoUrl) {
    console.log('Video ready:', finalResult.data.videoUrl)
  }
}
```

### Manual Status Checking

```typescript
// Check status manually
const status = await provider.checkSoraTaskStatus(taskId)

if (status.success) {
  if (status.data?.videoUrl) {
    console.log('Video ready:', status.data.videoUrl)
  } else {
    console.log('Still processing...')
  }
}
```

## Response Status Codes

### Success Flags
- `0`: Task is pending/processing
- `1`: Task completed successfully
- `2`: Task failed
- `3`: Content policy violation

### Status Values
- `pending`: Task queued
- `processing`: Video being generated
- `completed`: Video ready
- `failed`: Generation failed

## Polling Strategy

The implementation uses exponential backoff for efficient polling:

1. **Initial delay**: 5 seconds
2. **Backoff multiplier**: 1.5x
3. **Maximum delay**: 30 seconds
4. **Maximum attempts**: 20
5. **Total timeout**: 3 minutes (180 seconds)

Example delay sequence:
```
Attempt 1: 5s
Attempt 2: 7.5s
Attempt 3: 11.25s
Attempt 4: 16.87s
Attempt 5: 25.31s
Attempt 6+: 30s (capped)
```

## Webhook Support

If `BASE_WEBHOOK_URL` is configured in `.env`, the integration will automatically register webhooks:

```
Callback URL: {BASE_WEBHOOK_URL}/api/kie-ai/sora-callback
```

**Note**: Webhook infrastructure must be implemented separately.

## Cost Calculation

### Sora 2 Standard
```typescript
// $0.15 per 10 seconds = $0.015/second
// Rounded up to nearest 10 seconds
const cost = Math.ceil(duration / 10) * 0.15
```

### Sora 2 Pro
```typescript
// $0.20 per 10 seconds = $0.02/second
// Rounded up to nearest 10 seconds
const cost = Math.ceil(duration / 10) * 0.20
```

### Star Conversion
```typescript
const STAR_COST_USD = 0.016
const stars = Math.floor(costUSD / STAR_COST_USD)
```

## Error Handling

### API Errors
```typescript
try {
  const result = await provider.generateSoraVideo(prompt)
  if (!result.success) {
    console.error('Error:', result.error)
  }
} catch (error) {
  console.error('Exception:', error)
}
```

### Common Errors

1. **Missing API Key**
   ```
   Error: KIE_AI_API_KEY is required
   ```

2. **Content Policy Violation**
   ```
   successFlag: 3
   Error: Content rejected by policy
   ```

3. **Generation Failure**
   ```
   successFlag: 2
   Error: Video generation failed
   ```

4. **Timeout**
   ```
   Error: Video generation timeout after 180 seconds
   ```

## Configuration

### Environment Variables

```bash
# Required
KIE_AI_API_KEY=your_api_key_here

# Optional (for webhooks)
BASE_WEBHOOK_URL=https://your-domain.com
```

### Timeout Settings

Default timeouts (configurable in `KieAiProvider`):
- API request timeout: 300 seconds (5 minutes)
- Status check timeout: 30 seconds
- Polling max wait: 180 seconds (3 minutes)

## Testing

Run the integration test:

```bash
npm run build
node dist/tests/test-kie-sora-integration.js
```

## Integration with Existing Code

The Sora 2 implementation follows the same patterns as existing Veo 3 integration:

1. **Same response format**: `KieAiVideoResponse`
2. **Same error handling**: Try-catch with logging
3. **Same retry logic**: Exponential backoff
4. **Same cost calculation**: USD to stars conversion

## Best Practices

1. **Always check task status** before assuming completion
2. **Use polling method** for automatic retry handling
3. **Handle timeouts gracefully** (3-minute limit)
4. **Log task IDs** for debugging and tracking
5. **Monitor API credits** to avoid exhaustion
6. **Validate prompts** to reduce policy violations

## Limitations

1. **Maximum polling time**: 3 minutes
2. **Video duration**: Fixed at 10 seconds (default)
3. **Aspect ratios**: Only 'landscape' and 'portrait' supported
4. **No image-to-video**: Text-to-video only for Sora models
5. **Watermark removal**: Requires `remove_watermark: true` flag

## Roadmap

- [ ] Implement webhook callback handler
- [ ] Add support for longer video durations
- [ ] Add image-to-video support (if Kie.ai adds it)
- [ ] Add video quality selection options
- [ ] Implement persistent task storage for recovery

## Related Files

- `/src/services/video-providers/KieAiProvider.ts` - Main implementation
- `/tests/test-kie-sora-integration.ts` - Integration tests
- `/.env` - Configuration
- `/docs/kie-sora-integration.md` - This documentation
