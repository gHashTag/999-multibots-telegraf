# ✅ AI Reels Template 2 (Hedra) - Voice Fix

## 🔍 Проблема
В Шаблоне 2 (AI Reels через render-server + Hedra) использовался **централизованный мужской голос** вместо голоса пользователя из БД.

## 🛠️ Исправления

### 1. **Voice ID пользователя из БД** ✅
**Файл**: `src/scenes/lipSyncWizard/ai-reels-render-wizard.ts:742-756`

**Было**:
```typescript
const payload = createRenderAvatarPayload(
  telegramId,
  text,
  imageUrl,
  '0BcDz9UPwL3MpsnTeUlO', // ❌ Централизованный voice ID
  { ... }
)
```

**Стало**:
```typescript
// ✅ Получаем voice_id пользователя из БД
const { getVoiceId } = await import('@/core/supabase/getVoiceId')
const userVoiceId = await getVoiceId(telegramId)

if (!userVoiceId) {
  await ctx.reply('❌ У вас не настроен голос аватара...')
  return ctx.scene.leave()
}

// Используем ПРАВИЛЬНЫЙ voice_id пользователя
const payload = createRenderAvatarPayload(
  telegramId,
  text,
  imageUrl,
  userVoiceId, // ✅ Voice ID из users.voice_id_elevenlabs
  { ... }
)
```

### 2. **Валидация ElevenLabs токена** ✅
**Файл**: `src/scenes/lipSyncWizard/ai-reels-render-wizard.ts:773-786`

```typescript
// ✅ ВАЛИДАЦИЯ: Проверяем что токен ElevenLabs есть
const elevenLabsToken = process.env.ELEVENLABS_API_KEY
if (!elevenLabsToken) {
  logger.error('[AI REELS RENDER] Missing ELEVENLABS_API_KEY')
  await ctx.reply('❌ Ошибка конфигурации сервера (ElevenLabs token)')
  return ctx.scene.leave()
}
```

### 3. **Детальное логирование payload** ✅
**Файл**: `src/scenes/lipSyncWizard/ai-reels-render-wizard.ts:788-906`

```typescript
// ✅ ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ: Полный payload перед отправкой на render-server
logger.info('[AI REELS RENDER] FULL PAYLOAD DETAILS', {
  telegramId,
  job_id: payload.job_id,
  avatar_gen_service: payload.avatar_gen_service,
  eleven_labs_api_key_present: !!payload.eleven_labs_api_key,
  eleven_labs_api_key_prefix: payload.eleven_labs_api_key?.substring(0, 10),
  kie_api_key_present: !!payload.kie_api_key,
  avatar_settings: {
    voice_id: payload.avatar_settings.voice_id, // ✅ Voice ID пользователя
    avatar_photo_url: payload.avatar_settings.avatar_photo_url.substring(0, 50),
    avatar_speech_length: payload.avatar_settings.avatar_speech.length,
    api_key_present: !!payload.avatar_settings.api_key,
  },
  intro_text_1: payload.intro_text_1.text,
  intro_text_2: payload.intro_text_2.text,
})

console.log('🔴 [STEP 5] CRITICAL: Payload voice_id:', payload.avatar_settings.voice_id)
console.log('🔴 [STEP 5] CRITICAL: Payload eleven_labs_api_key (first 10 chars):', payload.eleven_labs_api_key?.substring(0, 10))
```

## 📊 Что передаётся на render-server

### Payload структура:
```typescript
{
  job_id: "telegram-{telegramId}-{timestamp}",
  eleven_labs_api_key: "sk_a6c23099ae8f4283f67264e6667b2f4316677a52c4c0ee5a", // ✅ Из .env
  kie_api_key: "{KIE_AI_API_KEY}",
  avatar_gen_service: "hedra" | "heygen",
  avatar_settings: {
    api_key: "{HEDRA_API_KEY}", // Из .env
    avatar_photo_url: "{user_image_url}",
    voice_id: "{user_voice_id_from_db}", // ✅ Из users.voice_id_elevenlabs
    avatar_speech: "{user_text}",
    avatar_id: "avatar-{telegramId}-{timestamp}"
  },
  cover_url: "...",
  intro_text_1: { text: "...", position: [...], font_size: 100 },
  intro_text_2: { text: "...", position: [...], font_size: 100 },
  upper_intro_text: "...",
  callback_url: "https://three-head-dragon.shop/api/telegram/ai-reels-callback"
}
```

## ✅ Проверка

### В production логах будет видно:
```
🔴 [STEP 5] User voice ID: {user_voice_id_from_db}
🔴 [STEP 5] ElevenLabs token (masked): sk_a6c2309...
🔴 [STEP 5] CRITICAL: Payload voice_id: {user_voice_id_from_db}
🔴 [STEP 5] CRITICAL: Payload eleven_labs_api_key (first 10 chars): sk_a6c2309
```

### Render-server получит:
- ✅ Правильный ElevenLabs API token
- ✅ Voice ID пользователя из БД
- ✅ Hedra/HeyGen API keys из ENV

## 🎯 Результат

**Шаблон 2** теперь использует:
- ✅ **Голос пользователя** из `users.voice_id_elevenlabs`
- ✅ **Токен ElevenLabs** из `process.env.ELEVENLABS_API_KEY`
- ✅ **Валидацию** наличия голоса у пользователя
- ✅ **Детальное логирование** для отладки

**Шаблон 1** (WAN25) - остался без изменений ✅
