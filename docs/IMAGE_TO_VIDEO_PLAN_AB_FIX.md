# Image to Video Plan A/B Implementation Report

## Issue Summary
User reported that Image to Video generates horizontal (16:9) videos when vertical (9:16) was selected for Veo 3 models.

## Root Causes Identified

### 1. No Plan A/B System for Image to Video
- **Problem**: Image to Video was using Replicate directly for ALL models
- **Impact**: Veo 3 models don't work with Replicate, they need Kie.ai API

### 2. Wrong Aspect Ratio Parameter Format  
- **Problem**: Code used `aspect_ratio` (snake_case) for Replicate format
- **Correct**: Kie.ai API expects `aspectRatio` (camelCase)

### 3. Missing API Integration
- **Problem**: Veo models were being sent to Replicate instead of Kie.ai
- **Impact**: Requests would fail or produce wrong results

## Solution Implemented

### 1. Created New Service with Plan A/B (`/src/services/generateImageToVideo.ts`)
```typescript
export async function generateImageToVideo(params: ImageToVideoRequest) {
  // Plan A: Try server first at /api/v1/veo/generate/image-to-video
  // Plan B: Use KieAiProvider directly with correct aspectRatio format
}
```

### 2. Updated Main Generation Function
Modified `/src/modules/videoGenerator/generateImageToVideo.ts`:
- Added special handling for Veo models (veo-3, veo-3-fast)
- Imports and uses new Plan A/B service
- Passes `aspectRatio` in correct camelCase format
- Properly handles video URL response from Plan A/B

### 3. Enhanced Logging
Added detailed logging in Image to Video wizard:
- Logs when aspect ratio is selected (9:16 or 16:9)
- Tracks aspect ratio through the entire flow
- Logs model ID and all parameters sent to API

## Key Changes

### File: `/src/services/generateImageToVideo.ts` (NEW)
- Implements Plan A/B system similar to Text to Video
- Plan A: Attempts server endpoint `/api/v1/veo/generate/image-to-video`
- Plan B: Falls back to direct Kie.ai API via KieAiProvider
- Properly formats `aspectRatio` as camelCase for Kie.ai
- Sends admin notifications when Plan B activates

### File: `/src/modules/videoGenerator/generateImageToVideo.ts`
- Lines 201-295: Special handling for Veo models
- Calls new Plan A/B service instead of Replicate
- Handles video download and saving from Plan A/B response
- Returns early after successful Plan A/B generation

### File: `/src/scenes/imageToVideoWizard/index.ts`  
- Lines 1057-1061: Added logging for 9:16 selection
- Lines 1038-1042: Added logging for 16:9 selection
- Line 1149: Logs selectedAspectRatio in background generation

## Testing Recommendations

1. Test vertical video (9:16) generation with Veo 3 Fast
2. Test horizontal video (16:9) generation with Veo 3 Fast  
3. Verify Plan A (server) attempts first
4. Verify Plan B (direct API) works when server is down
5. Check admin notifications when Plan B activates

## Deployment Notes

1. Build the project: `npm run build`
2. Deploy to production
3. Monitor logs for aspect ratio tracking
4. Check that Veo models generate correct aspect ratios

## Expected Behavior After Fix

- When user selects "📱 Вертикальное (9:16)", Veo models should generate vertical videos
- When user selects "📺 Горизонтальное (16:9)", Veo models should generate horizontal videos
- Plan A should try server first, Plan B should use direct Kie.ai API
- Aspect ratio parameter sent as `aspectRatio` (camelCase) to Kie.ai API