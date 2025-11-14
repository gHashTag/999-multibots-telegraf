# 🚨 КРИТИЧЕСКИ ВАЖНЫЕ ПРАВИЛА ДЛЯ INNGEST

## ⚠️ ОБЯЗАТЕЛЬНО К ПРОЧТЕНИЮ

### 1. 🔴 ПРАВИЛЬНЫЙ URL ДЛЯ INNGEST API

**✅ ПРАВИЛЬНО:**
```typescript
const url = `https://inn.gs/e/${eventKey}`
```

**❌ НЕПРАВИЛЬНО (НЕ РАБОТАЕТ):**
```typescript
const url = `https://api.inngest.com/e/${eventKey}`  // ← 404 Not Found
```

### Почему это критично:
- `https://api.inngest.com/e/{KEY}` → **404 Not Found** ❌
- `https://inn.gs/e/{KEY}` → **200 OK** ✅

### Где используется:
1. **src/inngest_app/inngest-provider.ts** ✓
2. **src/inngest_app/send-event.ts** ✓
3. **Все тесты** ✓

---

## 2. 📋 EVENT KEY КОНФИГУРАЦИЯ

### Environment Variables:

```bash
# BOT Instance (основной бот)
INNGEST_EVENT_KEY=akoHhkQS3NGSQhDzcosD7o-0dGSJ9PWLiGol-fi5QMnZOG5XpvuxGBlnh_an9VQ0ygwA4BZEa3lfjKlbgm3U2A
INNGEST_SIGNING_KEY=signkey-prod-e2c2d07a9d0306957816b187e3e4fcd617ee0435923a1b613563c4666c82c047

# RENDER Instance (render-server на Render Server)
INNGEST_EVENT_KEY_RENDER=n6DddAUg5idycTbtQGP7lXn6FCoIDcEkAdlX72WmC5k_GJcrjBFm4n_aCNmInAh_zQ2Yd070y4gzPeYnJTUadA
INNGEST_SIGNING_KEY_RENDER=signkey-prod-e2c2d07a9d0306957816b187e3e4fcd617ee0435923a1b613563c4666c82c047
```

### Как работает:

**inngestProvider** управляет двумя инстансами:

1. **BOT** - наш сервер (three-head-dragon.shop)
   - Для AI Reels функций
   - Event name: `ai-reels/generate`

2. **RENDER** - render-server (Render Server)
   - Для Hedra/HeyGen avatar генерации
   - Event name: `render/avatar-video`

---

## 3. 🎯 ИСПОЛЬЗОВАНИЕ В КОДЕ

### Правильный пример:

```typescript
import { inngestProvider } from '@/inngest_app/inngest-provider'

// Отправка на BOT инстанс
await inngestProvider.sendEvent('BOT', 'ai-reels/generate', {
  telegramId: '123',
  imageUrl: '...',
  text: '...'
})

// Отправка на RENDER инстанс (для Hedra/HeyGen)
await inngestProvider.sendEvent('RENDER', 'render/avatar-video', {
  job_id: '...',
  avatar_gen_service: 'hedra',
  avatar_settings: { ... }
})
```

### Или через render-server client:

```typescript
import { sendRenderAvatarVideoEvent, createRenderAvatarPayload }
  from '@/inngest_app/render-server-client'

const payload = createRenderAvatarPayload(
  telegramId,
  avatarSpeech,
  avatarPhotoUrl,
  voiceId,
  { coverUrl, introText1, introText2 }
)

const { eventId } = await sendRenderAvatarVideoEvent(payload)
```

---

## 4. 🔍 ДИАГНОСТИКА ПРОБЛЕМ

### Симптом: 404 Not Found при отправке события

**Причина:** Используется неправильный URL

**Решение:**
```typescript
// Проверьте что используется правильный URL:
const correctUrl = `https://inn.gs/e/${eventKey}`  // ✓
```

### Симптом: "RENDER instance not configured"

**Причина:** Отсутствует `INNGEST_EVENT_KEY_RENDER` в .env

**Решение:**
```bash
# Добавьте в .env:
INNGEST_EVENT_KEY_RENDER=n6DddAUg5idycTbtQGP7lXn6FCoIDc...
```

### Симптом: 500 Internal Server Error

**Причина:** Проблема на стороне render-server или неправильный payload

**Решение:**
1. Проверьте логи render-server: `railway logs --service render-v3-production`
2. Проверьте структуру payload согласно схеме
3. Проверьте что все обязательные поля заполнены

---

## 5. 📊 RENDER SERVER PAYLOAD SCHEMA

### Обязательная структура для `render/avatar-video`:

```typescript
{
  "job_id": string,                    // Уникальный ID задачи
  "eleven_labs_api_key": string,       // ElevenLabs API key
  "kie_api_key": string,               // Kie.ai API key
  "cover_url": string,                 // URL обложки видео
  "intro_text_1": string,              // Текст интро 1
  "intro_text_2": string,              // Текст интро 2
  "upper_intro_text": string,          // Верхний текст интро
  "avatar_gen_service": "hedra" | "heygen", // Сервис генерации
  "avatar_settings": {
    "api_key": string,                 // Hedra/HeyGen API key
    "avatar_photo_url": string,        // URL фото аватара
    "voice_id": string,                // ElevenLabs voice ID
    "avatar_speech": string            // Текст для озвучки
  }
}
```

### Пример создания payload:

```typescript
const payload = createRenderAvatarPayload(
  telegramId,
  'Текст для озвучки аватара...',
  'https://example.com/avatar.jpg',
  '0BcDz9UPwL3MpsnTeUlO',  // voice_id
  {
    coverUrl: 'https://example.com/cover.jpg',
    introText1: 'Ai-Stars',
    introText2: 'News',
    upperIntroText: 'Ai-Stars'
  }
)
```

---

## 6. 🎬 ИНТЕГРАЦИЯ В AI REELS СЦЕНУ

### Флоу генерации через render-server:

```
1. Пользователь выбирает фото аватара
2. Пользователь вводит текст или голос
3. Пользователь выбирает сервис: Hedra или HeyGen
4. Создается payload с createRenderAvatarPayload()
5. Отправляется на render-server через sendRenderAvatarVideoEvent()
6. Render-server обрабатывает:
   - ElevenLabs генерирует голос
   - Hedra/HeyGen создает lip-sync видео
   - Kie.ai добавляет интро и обложку
7. Результат возвращается через webhook на наш сервер
8. Бот отправляет готовое видео пользователю
```

### Код интеграции в wizard:

```typescript
// В AI Reels сцене после получения всех данных:

// 1. Выбор сервиса (Hedra или HeyGen)
const avatarService = ctx.session.aiReels.avatarService // 'hedra' | 'heygen'

// 2. Создание payload
const payload = createRenderAvatarPayload(
  telegramId,
  ctx.session.aiReels.text,
  ctx.session.aiReels.imageUrl,
  ctx.session.aiReels.voiceId,
  {
    coverUrl: process.env.DEFAULT_COVER_URL,
    introText1: 'Ai-Stars',
    introText2: 'News',
    upperIntroText: 'Ai-Stars'
  }
)

// Обновить avatar_gen_service
payload.avatar_gen_service = avatarService

// 3. Отправка на render-server
const { eventId } = await sendRenderAvatarVideoEvent(payload)

// 4. Уведомление пользователя
await ctx.reply(
  `✅ Генерация запущена!\n` +
  `Event ID: ${eventId}\n` +
  `Вы получите уведомление когда видео будет готово.`
)
```

---

## 7. 🔗 ПОЛЕЗНЫЕ ССЫЛКИ

- **Inngest Dashboard:** https://app.inngest.com
- **Render Server:** https://render-v3-production.up.render-server (local)
- **Render Server Dashboard:** https://render-server (local)
- **Inngest Docs:** https://www.inngest.com/docs

---

## 8. ✅ ЧЕКЛИСТ ПЕРЕД ДЕПЛОЕМ

- [ ] Используется `https://inn.gs/e/{KEY}` (НЕ `api.inngest.com`)
- [ ] `INNGEST_EVENT_KEY_RENDER` добавлен в production .env
- [ ] `INNGEST_SIGNING_KEY_RENDER` добавлен в production .env
- [ ] Протестирован через `npx tsx tests/test-correct-inngest-url.ts`
- [ ] Проверено в Inngest Dashboard что события доставляются
- [ ] Webhook endpoint настроен: `/api/telegram/ai-reels-callback`
- [ ] Render Server logs мониторятся: `railway logs --tail`

---

## 9. 📞 ПОДДЕРЖКА И ДЕБАГ

### Тестовые скрипты:

```bash
# Проверка правильного URL
npx tsx tests/test-correct-inngest-url.ts

# Проверка inngestProvider
npx tsx tests/test-inngest-provider.ts

# Проверка render-server интеграции
npx tsx tests/test-direct-render-call.ts
```

### Мониторинг в production:

```bash
# Логи бота
ssh -i ~/.ssh/zomro root@212.86.115.30
docker logs 999-multibots --tail 100 | grep "INNGEST"

# Логи render-server
railway logs --service render-v3-production --tail
```

---

## ⚡ БЫСТРАЯ СПРАВКА

| Что | URL/Значение |
|-----|--------------|
| Inngest API | `https://inn.gs/e/{KEY}` ✅ |
| BOT Event Key | `akoHhkQS3NGSQhDzcosD7o-0dGSJ9...` |
| RENDER Event Key | `n6DddAUg5idycTbtQGP7lXn6FCoIDc...` |
| Signing Key | `signkey-prod-e2c2d07a9d030695...` |
| Render Server | `https://render-v3-production.up.render-server (local)` |
| Event BOT | `ai-reels/generate` |
| Event RENDER | `render/avatar-video` |

---

**📝 ПОМНИ:** Всегда используй `https://inn.gs/e/{KEY}` для отправки событий!
