# Completion Notification System

## Overview

System notification sound implementation for Telegram bot to provide audio feedback when tasks complete.

## Implementation Details

### Core Module

**File:** `/src/helpers/completionNotification.ts`

Provides three notification functions:

1. **`sendCompletionNotification(ctx, isRu, taskType?)`**
   - Simple completion notification with sound
   - Sends "✅ Готово!" (RU) or "✅ Done!" (EN)
   - Uses `disable_notification: false` to enable sound

2. **`sendEnhancedCompletionNotification(ctx, isRu, options?)`**
   - Custom emoji and message support
   - Options: `emoji`, `message`, `taskType`
   - Allows flexible completion messages

3. **`sendAudioCompletionNotification(ctx, isRu, audioUrl?)`**
   - For special cases requiring audio file
   - Can send custom audio completion sound
   - Falls back to text notification

### Integrated Wizards

#### 1. Text-to-Speech Wizard
**File:** `/src/scenes/textToSpeechWizard/index.ts`

```typescript
// After sending voice and document
await sendCompletionNotification(ctx, isRu, 'text_to_speech')
```

**Trigger:** When TTS generation completes successfully

#### 2. Improve Prompt Wizard
**File:** `/src/scenes/improvePromptWizard/index.ts`

Integrated in three generation types:
- **NeuroPhoto:** After `generateNeuroPhotoHybrid` completes
- **Text-to-Video:** After `generateTextToVideo` completes
- **Text-to-Image:** Before showing balance message

```typescript
await sendCompletionNotification(ctx, isRu, 'neuro_photo')
await sendCompletionNotification(ctx, isRu, 'text_to_video')
await sendCompletionNotification(ctx, isRu, 'text_to_image')
```

#### 3. Async LipSync Manager
**File:** `/src/core/lipsync/async-lipsync-manager.ts`

```typescript
// In sendSuccessResult method
await this.bot.telegram.sendMessage(
  job.chatId,
  '✅ Готово!',
  { disable_notification: false }
)
```

**Trigger:** When async lip-sync video generation completes

## How It Works

### Telegram Notification API

The system uses Telegram's `disable_notification` parameter:

```typescript
await ctx.reply('✅ Готово!', {
  disable_notification: false  // Enable sound notification
})
```

**Default behavior:**
- `disable_notification: true` - Silent notification (default for most bots)
- `disable_notification: false` - Sound notification with system sound

### User Experience

1. **Task starts** → User sees progress message
2. **Task completes** → User hears notification sound + sees "✅ Готово!"
3. **Detailed result** → Bot sends full result with media/files

### Sound Notification Timing

- **Immediate:** Sound plays as soon as completion message arrives
- **Non-intrusive:** Uses system notification sound
- **User-controlled:** Can be disabled in Telegram settings

## Implementation Best Practices

### When to Use

✅ **Use completion notification when:**
- Long-running tasks complete (>5 seconds)
- User might be away from device
- Important generation/processing finishes
- User needs immediate feedback

❌ **Don't use for:**
- Instant operations (<2 seconds)
- Error messages (use error handlers)
- Intermediate progress updates
- Menu navigations

### Code Pattern

```typescript
try {
  // 1. Start long operation
  await longRunningTask()

  // 2. Send completion notification FIRST
  await sendCompletionNotification(ctx, isRu, 'task_name')

  // 3. Send detailed result
  await ctx.reply('Detailed success message...')

} catch (error) {
  // Handle errors (no notification sound for errors)
  await ctx.reply('Error message...')
}
```

## Testing

### Manual Testing

1. Start a generation task (text-to-speech, image, video)
2. Wait for completion
3. Verify:
   - Sound notification plays
   - "✅ Готово!" message appears
   - Detailed result follows

### Testing Checklist

- [ ] Text-to-speech completion sound
- [ ] Image generation completion sound
- [ ] Video generation completion sound
- [ ] LipSync async completion sound
- [ ] Sound plays on mobile devices
- [ ] Sound respects user's Telegram settings
- [ ] No duplicate notifications

## Future Enhancements

### Potential Improvements

1. **User Preferences**
   - Add database field: `enable_completion_sounds`
   - Allow users to toggle notifications

2. **Custom Sounds**
   - Upload custom completion audio files
   - Different sounds for different task types

3. **Smart Notifications**
   - Only notify if user inactive >30 seconds
   - Group multiple completions

4. **Notification Analytics**
   - Track notification delivery
   - Monitor user engagement

## Configuration

### Environment Variables

None required - uses existing Telegram bot configuration.

### User Settings

Users can control notifications via Telegram app:
- Settings → Notifications → Bot notifications
- Per-chat notification settings

## Troubleshooting

### Sound Not Playing

**Possible causes:**
1. User disabled notifications in Telegram
2. Device on silent mode
3. Bot notifications muted for specific chat

**Solution:** User must enable notifications in Telegram settings

### Multiple Notifications

If multiple notifications fire, check:
- Wizard doesn't call `sendCompletionNotification` twice
- Async operations don't duplicate notifications

## API Reference

### sendCompletionNotification

```typescript
async function sendCompletionNotification(
  ctx: Context | MyContext,
  isRu: boolean,
  taskType?: string
): Promise<void>
```

**Parameters:**
- `ctx`: Telegram context
- `isRu`: Russian language flag
- `taskType`: Optional task identifier for logging

**Returns:** Promise<void>

**Example:**
```typescript
await sendCompletionNotification(ctx, true, 'image_generation')
```

### sendEnhancedCompletionNotification

```typescript
async function sendEnhancedCompletionNotification(
  ctx: Context | MyContext,
  isRu: boolean,
  options?: {
    emoji?: string
    message?: string
    taskType?: string
  }
): Promise<void>
```

**Parameters:**
- `ctx`: Telegram context
- `isRu`: Russian language flag
- `options`: Custom notification options

**Example:**
```typescript
await sendEnhancedCompletionNotification(ctx, true, {
  emoji: '🎉',
  message: 'Видео готово!',
  taskType: 'video_generation'
})
```

## Files Modified

### New Files
- `/src/helpers/completionNotification.ts` - Core notification module

### Modified Files
- `/src/scenes/textToSpeechWizard/index.ts` - Added TTS completion notification
- `/src/scenes/improvePromptWizard/index.ts` - Added notifications for 3 generation types
- `/src/core/lipsync/async-lipsync-manager.ts` - Added async completion notification
- `/src/bot.ts` - Fixed syntax error (missing closing brace)

## Logging

All notifications log to application logger:

```typescript
logger.info('[CompletionNotification] Notification sent', {
  telegram_id: ctx.from?.id,
  taskType: 'task_name',
  language: 'ru' | 'en'
})
```

**Log locations:**
- Check application logs for `[CompletionNotification]` entries
- Track notification success/failure rates

## Summary

The completion notification system provides:
- ✅ Audio feedback for task completion
- ✅ Multi-language support (RU/EN)
- ✅ Integrated into 4 major workflows
- ✅ Non-intrusive user experience
- ✅ Proper error handling
- ✅ Comprehensive logging

Users now receive immediate audio notification when:
- Text-to-speech generation completes
- Image generation finishes
- Video generation finishes
- LipSync video generation completes

This improves UX by alerting users when long-running tasks finish, so they know completion status without constantly checking the chat.
