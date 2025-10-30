# Sora 2 Webhook Configuration

## ✅ Webhook Infrastructure

### Production Setup
- **Base URL**: `https://three-head-dragon.shop`
- **Sora Callback**: `https://three-head-dragon.shop/api/kie-ai/sora-callback`
- **LipSync Callback**: `https://three-head-dragon.shop/api/kie-ai/callback`

### Environment Variable
```bash
BASE_WEBHOOK_URL=https://three-head-dragon.shop
```

## 📋 Webhook Flow

### 1. Video Generation Request
```typescript
// KieAiProvider.generateSoraVideo()
const callbackUrl = process.env.BASE_WEBHOOK_URL
  ? `${process.env.BASE_WEBHOOK_URL}/api/kie-ai/sora-callback`
  : undefined

const requestData: SoraCreateTaskRequest = {
  model: 'sora-2-text-to-video',
  callBackUrl: callbackUrl,  // ✅ Webhook URL
  input: {
    prompt,
    aspect_ratio: 'landscape',
    remove_watermark: false
  }
}
```

### 2. Kie.ai Processes Video
- Task is created with taskId
- Video generation starts (0-3 minutes)
- Kie.ai calls webhook when done

### 3. Webhook Callback
**Endpoint**: `POST /api/kie-ai/sora-callback`

**Payload**:
```json
{
  "taskId": "abc123",
  "successFlag": 1,
  "videoUrl": "https://...",
  "duration": 10
}
```

**Success Flags**:
- `0` - Processing (not sent)
- `1` - ✅ Success
- `2` - ❌ Failed
- `3` - 🚫 Content Policy Violation

### 4. Async Processing
```typescript
processSoraWebhookAsync(payload)
  ↓
handleSoraSuccess(payload)
  ↓
// TODO: Send video to user via Telegram
```

## 🔄 Current Status

### ✅ Implemented
- Webhook route: `/api/kie-ai/sora-callback`
- Async processing handlers
- Success/Failure/Policy handlers
- Detailed logging

### ⏳ TODO
- [ ] Implement user notification system
- [ ] Store taskId → telegram_id mapping
- [ ] Send video to user when webhook received
- [ ] Handle refunds on failure

## 🛠️ Testing

### Test Webhook Locally
```bash
curl -X POST http://localhost:2999/api/kie-ai/sora-callback \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "test-123",
    "successFlag": 1,
    "videoUrl": "https://example.com/video.mp4",
    "duration": 10
  }'
```

### Check Logs
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 'docker logs 999-multibots | grep "SORA WEBHOOK"'
```

## 📊 Webhook vs Polling

### With Webhook (Current)
- ✅ Immediate notification
- ✅ No wasted API calls
- ✅ Efficient resource usage
- ⚠️ Requires public URL

### Polling (Fallback)
- ✅ Works without webhook
- ❌ 5-second intervals
- ❌ 3-minute timeout
- ❌ More API calls

## 🔐 Security

### Webhook Validation
```typescript
// Validate required fields
if (!payload.taskId) {
  logger.error('Missing taskId')
  return
}

if (typeof payload.successFlag !== 'number') {
  logger.error('Invalid successFlag')
  return
}
```

### Best Practices
- ✅ Fast 202 response
- ✅ Async processing
- ✅ Detailed logging
- ✅ Error handling
- ✅ Validation

## 📝 Integration Pattern

```typescript
// In generateTextToVideo.ts
if (isSoraModel) {
  // 1. Create task with webhook
  const soraResponse = await kieProvider.generateSoraVideo(
    prompt,
    model,
    aspectRatio,
    removeWatermark
  )
  
  // 2. Return taskId for polling fallback
  if (soraResponse.success && soraResponse.data?.taskId) {
    return {
      success: true,
      jobId: soraResponse.data.taskId,
      message: 'Sora video generation started',
    }
  }
}

// 3. Meanwhile, webhook will notify when ready
// 4. Polling runs as backup (3min timeout)
```

## 🌐 Production URLs

### Main Domain
`https://three-head-dragon.shop`

### API Endpoints
- `/api/kie-ai/sora-callback` - Sora webhook
- `/api/kie-ai/callback` - LipSync webhook
- `/api/health` - Health check
- `/api/inngest` - Inngest events

## 📚 Related Files

- `src/api_server/routes/kie-ai-webhook.routes.ts` - Webhook handlers
- `src/services/video-providers/KieAiProvider.ts` - Kie.ai client
- `src/services/generateTextToVideo.ts` - Video generation service
- `.env` - Environment configuration
