# Voice Error Handling Documentation

## Problem Description

The application was experiencing 404 errors when trying to generate text-to-speech audio with ElevenLabs API. This typically occurs when:

1. **Voice IDs become invalid** - ElevenLabs automatically deletes voices due to inactivity
2. **Manual voice deletion** - Users delete voices from their ElevenLabs account
3. **API key changes** - When API keys are regenerated or changed
4. **Account quota limits** - When ElevenLabs account limits are reached

## Error Example

```
2025-06-03 09:27:38 [INFO]: [textToSpeechWizard] Calling createAudioFileFromText
[TTS_BOT] Failed to generate audio (manual stream processing): Status code: 404
Voice ID 'bzIkQk09q4CmRz2vomw4' not found
```

## Solution Implementation

### 1. Enhanced Error Handling

- **VoiceNotFoundError Class**: Custom error class for 404 voice ID errors
- **Automatic Database Cleanup**: Invalid voice IDs are automatically removed from the database
- **User-Friendly Messages**: Clear instructions for users on how to recreate their voice avatar

### 2. Proactive Voice Validation

- **Voice Existence Check**: Before attempting to generate audio, the system checks if the voice still exists
- **Validation Helper Functions**: Centralized validation logic for reusability
- **Database Consistency**: Ensures database stays clean of invalid voice IDs

### 3. Key Files Modified

#### `src/core/elevenlabs/createAudioFileFromText.ts`
- Added `VoiceNotFoundError` class
- Enhanced error handling for 404 responses
- Automatic database cleanup for invalid voice IDs

#### `src/core/elevenlabs/index.ts`
- Added `voiceExists()` method to ElevenLabs client
- Added `checkVoiceExists()` helper function
- Enhanced mock client for development/testing

#### `src/helpers/voiceValidation.ts`
- Centralized voice validation logic
- Helper functions for error messages
- Database cleanup utilities

#### `src/scenes/textToSpeechWizard/index.ts`
- Proactive voice validation before audio generation
- Improved error handling with user-friendly messages
- Uses centralized validation helpers

### 4. User Experience Improvements

- **Clear Error Messages**: Users get specific instructions on how to fix the issue
- **Automatic Cleanup**: Invalid voice IDs are removed so users don't encounter the same error repeatedly
- **Prevention**: Voice existence is checked before attempting generation

## Usage Examples

### For Developers

```typescript
import { validateAndCleanVoiceId, getVoiceAvatarErrorMessage } from '@/helpers/voiceValidation'

// Validate voice before use
const isValid = await validateAndCleanVoiceId(voiceId, telegramId)
if (!isValid) {
  await ctx.reply(getVoiceAvatarErrorMessage(isRu))
  return
}
```

### Error Messages for Users

**Russian:**
```
❌ Ваш голосовой аватар больше не доступен или не создан. Пожалуйста, создайте новый голосовой аватар используя 🎤 Голос для аватара в главном меню.
```

**English:**
```
❌ Your voice avatar is no longer available or not created. Please create a new voice avatar using 🎤 Voice for avatar in the main menu.
```

## Troubleshooting

### Common Issues

1. **Voice ID Not Found (404)**
   - **Cause**: Voice was deleted or doesn't exist
   - **Solution**: System automatically clears the invalid ID and prompts user to recreate

2. **API Key Issues**
   - **Cause**: Missing or invalid ELEVENLABS_API_KEY
   - **Solution**: Check environment variables and regenerate API key if needed

3. **Mock Client Behavior**
   - **Cause**: API key not set, falls back to mock client
   - **Solution**: Set proper ELEVENLABS_API_KEY environment variable

### Monitoring

Check logs for these patterns:
- `[TTS_BOT] Voice ID X not found (404)` - Voice doesn't exist
- `[VoiceValidation] Cleared invalid voice ID` - Automatic cleanup occurred
- `[MOCK] Called generate()` - Using mock client (check API key)

## Prevention

1. **Regular Validation**: The system now proactively validates voices before use
2. **User Education**: Clear messages guide users to recreate avatars when needed
3. **Database Hygiene**: Automatic cleanup prevents accumulation of invalid voice IDs
4. **Graceful Degradation**: System handles missing voices gracefully without crashes

## Benefits

- **Improved Reliability**: No more 404 crashes
- **Better UX**: Clear error messages and recovery instructions
- **Maintainability**: Centralized validation logic
- **Data Consistency**: Clean database without invalid references
- **Monitoring**: Better error tracking and debugging information 