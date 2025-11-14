# 🎬 Video Webhook Callback Status - 2025-11-11

## ✅ What Was Fixed:

### 1. **Callback URL now includes telegram_id**
```
BEFORE: https://domain/api/video-callback
AFTER:  https://domain/api/video-callback/{telegram_id}
```

### 2. **All Video Models Updated:**

| Model | Status | Callback URL | Notes |
|-------|--------|--------------|-------|
| **Sora 2** | ✅ FIXED | `/api/video-callback/144022504` | Working - video delivered |
| **Sora 2 Pro** | ✅ FIXED | `/api/video-callback/{id}` | Same implementation as Sora 2 |
| **WAN 2.5 T2V** | ✅ FIXED | `/api/video-callback/{id}` | Jobs API endpoint |
| **WAN 2.5 I2V** | ✅ FIXED | `/api/video-callback/{id}` | Jobs API endpoint |
| **Veo 3** | ✅ FIXED | `/api/video-callback/{id}` | Veo generate endpoint |
| **Veo 3 Fast** | ⏳ TESTING | `/api/video-callback/144022504` | Callback sent correctly |
| **Nano Banana** | ✅ FIXED | `/api/video-callback/{id}` | Kie.AI image editing |

### 3. **Code Changes:**

#### Files Modified (7 total):
1. `src/services/video-providers/KieAiProvider.ts` 
   - Added `telegram_id` parameter to `generateSoraVideo()`
   - Updated callback URL construction for Sora/WAN/Veo models
   
2. `src/services/generateTextToVideo.ts`
   - Pass `telegram_id` to `generateVideo()` calls
   
3. `src/services/generateImageToVideo.ts`
   - Pass `telegram_id` to `generateVideo()` calls
   
4. `src/services/generateNanoBananaKie.ts`
   - Updated callback URL with telegram_id
   
5. `src/modules/videoGenerator/generateTextToVideo.ts`
   - Pass `telegram_id` to `generateVideo()` calls
   
6. `src/modules/videoGenerator/generateImageToVideo.ts`
   - Pass `telegram_id` to `generateVideo()` calls (2 locations)
   
7. `src/services/UniversalProviderManager.ts`
   - Added `telegram_id` to interface and pass through

8. `src/api_server/routes/kie-ai-webhook.routes.ts`
   - Fixed undefined function error
   - Use `processSoraWebhookAsync()` instead of `processKieAiWebhook()`

### 4. **Deployment History:**

| Commit | Time | Description |
|--------|------|-------------|
| `c8416026` | 04:08 | ✅ Add telegram_id to ALL callback URLs |
| `d4a7289f` | 04:18 | 🔧 Fix webhook async function name |

### 5. **Testing Results:**

✅ **Sora 2**: 
- Callback received: `https://three-head-dragon.shop/api/video-callback/144022504`
- Result: Video delivered successfully to user

⏳ **Veo 3 Fast**: 
- Callback sent: `https://three-head-dragon.shop/api/video-callback/144022504`
- Waiting for callback from Kie.AI (video generation in progress)

## 🎯 How It Works Now:

1. User requests video generation
2. Bot creates request with `telegram_id` 
3. Kie.AI/provider receives callback URL: `/api/video-callback/{telegram_id}`
4. When video is ready, provider calls webhook
5. Handler extracts `telegram_id` from URL
6. Video sent directly to user via `sendVideoDirectly()`

## 📊 Provider Detection:

Webhook handler auto-detects provider by payload structure:
- `taskId` present → Kie.AI (Sora/WAN/Veo)
- `download_url` present → Render Server
- Falls back to generic handler if unknown

## 🚀 Next Steps:

- Monitor Veo 3 Fast callback arrival
- Confirm all models working end-to-end
- Document in changelog if all tests pass

