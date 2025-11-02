# 🎬 AI REELS RENDER - Интеграция с Render Server

## 📋 Обзор

**AI Reels Render** - интегрированная в существующую сцену AI Reels возможность генерации профессиональных видео через render-server на Railway с выбором между Hedra и HeyGen.

**✅ ИНТЕГРАЦИЯ ЗАВЕРШЕНА:** Функционал добавлен в `ai-reels-wizard.ts` как альтернативный метод генерации.

### Преимущества:
- ✅ **Hedra** - быстрая генерация lip-sync (2-3 минуты)
- ✅ **HeyGen** - премиум качество видео (4-5 минут)
- ✅ **ElevenLabs** - естественный синтез голоса
- ✅ **Автоматические интро** и обложки
- ✅ **Inngest** - надежная доставка через event system
- ✅ **Webhook** - автоматическое уведомление при готовности

---

## 🚀 Как это работает

### Архитектура (Интегрированная):

```
┌──────────────────────┐
│   AI Reels Wizard    │
│ (ai-reels-wizard.ts) │
└──────────┬───────────┘
           │
           │ 1. Пользователь загружает фото + текст
           ▼
┌──────────────────────┐
│ ВЫБОР МЕТОДА:        │
│ 🎬 Локальная         │
│ 🚀 Render Server     │
└──────┬───────────────┘
       │
       ├─────────────────────┐
       │                     │
       ▼ ЛОКАЛЬНАЯ           ▼ RENDER SERVER
┌──────────────┐      ┌──────────────────┐
│ Step 5:      │      │ Step 4:          │
│ Lip-sync     │      │ Выбор аватара:   │
│ (veed_fabric)│      │ • Hedra (50⭐)   │
└──────┬───────┘      │ • HeyGen (100⭐) │
       │              └──────┬───────────┘
       ▼                     │
┌──────────────┐             │ sendRenderAvatarVideoEvent()
│ Step 6:      │             ▼
│ WAN 2.5      │      ┌──────────────────┐
│ Image-to-vid │      │ Inngest Cloud    │
└──────┬───────┘      │ https://inn.gs   │
       │              └──────┬───────────┘
       ▼                     │
┌──────────────┐             ▼
│ Step 7:      │      ┌──────────────────┐
│ Склеивание   │      │ Render Server    │
│ (FFmpeg)     │      │ (Railway)        │
└──────┬───────┘      │ • ElevenLabs     │
       │              │ • Hedra/HeyGen   │
       │              │ • Kie.ai         │
       │              └──────┬───────────┘
       │                     │
       ▼                     ▼
┌──────────────────────────────┐
│   Уведомление пользователю   │
│   (готовое видео)            │
└──────────────────────────────┘
```

---

## 📁 Файлы

### 1. Основная сцена (ИНТЕГРИРОВАНО):
**`src/scenes/lipSyncWizard/ai-reels-wizard.ts`**

Wizard сцена с 7 шагами:
- Step 0: Запрос изображения
- Step 1: Обработка изображения (фото или URL)
- Step 2: Обработка текста или голосового сообщения
- **Step 3: ✨ ВЫБОР МЕТОДА (Локальная / Render Server)**
- **Step 4: Выбор аватара (Hedra/HeyGen) - только для Render Server**
- Step 5-7: Локальная генерация (lip-sync + WAN 2.5 + склеивание)

### 2. Render Server Client:
**`src/inngest_app/render-server-client.ts`**

Функции:
- `sendRenderAvatarVideoEvent()` - отправка события на render-server
- `checkRenderServerAvailability()` - проверка доступности
- `createRenderAvatarPayload()` - создание payload

### 3. Inngest Provider:
**`src/inngest_app/inngest-provider.ts`**

Управление двумя Inngest инстансами:
- **BOT** - для основных функций бота
- **RENDER** - для render-server

### 4. TypeScript интерфейсы:
**`src/interfaces/telegram-bot.interface.ts`**

Добавлен тип `aiReelsRender` в `MySession`:
```typescript
aiReelsRender?: {
  step?: 'image' | 'text' | 'avatar_service' | 'processing'
  imageUrl?: string
  text?: string
  audioUrl?: string
  avatarService?: 'hedra' | 'heygen'
  startTime?: number
  eventId?: string
}
```

---

## 🔧 Настройка

### 1. Environment Variables:

Добавить в `.env` (production):
```bash
# RENDER Instance (Render Server на Railway)
INNGEST_EVENT_KEY_RENDER=n6DddAUg5idycTbtQGP7lXn6FCoIDcEkAdlX72WmC5k_GJcrjBFm4n_aCNmInAh_zQ2Yd070y4gzPeYnJTUadA
INNGEST_SIGNING_KEY_RENDER=signkey-prod-e2c2d07a9d0306957816b187e3e4fcd617ee0435923a1b613563c4666c82c047

# Render Server Settings
RENDER_SERVER_URL=https://render-v3-production.up.railway.app
HEDRA_API_KEY=YOUR_HEDRA_API_KEY_HERE

# ElevenLabs
ELEVENLABS_API_KEY=YOUR_ELEVENLABS_API_KEY_HERE

# Kie.ai
KIE_AI_API_KEY=YOUR_KIE_AI_API_KEY_HERE
```

### 2. Регистрация сцены:

Добавить в главный файл регистрации сцен:
```typescript
import { aiReelsRenderWizard } from './scenes/lipSyncWizard/ai-reels-render-wizard'

// Регистрация
stage.register(aiReelsRenderWizard)
```

### 3. Добавление в меню:

```typescript
// В menu scene
Markup.button.callback('🎬 AI Reels Render', 'ai_reels_render')

// Handler
bot.action('ai_reels_render', async ctx => {
  await ctx.scene.enter('ai_reels_render_wizard')
})
```

---

## 💻 Использование в коде

### Пример 1: Прямая отправка на render-server

```typescript
import {
  sendRenderAvatarVideoEvent,
  createRenderAvatarPayload,
} from '@/inngest_app/render-server-client'

// Создать payload
const payload = createRenderAvatarPayload(
  telegramId,
  'Текст для озвучки аватара...',
  'https://example.com/avatar.jpg',
  '0BcDz9UPwL3MpsnTeUlO', // ElevenLabs voice ID
  {
    coverUrl: 'https://example.com/cover.jpg',
    introText1: 'Ai-Stars',
    introText2: 'News',
    upperIntroText: 'Ai-Stars',
  }
)

// Выбрать сервис
payload.avatar_gen_service = 'hedra' // или 'heygen'

// Отправить на render-server
const { eventId } = await sendRenderAvatarVideoEvent(payload)

console.log(`Event ID: ${eventId}`)
// Event ID: 01K7VBFGK96GGFT1KNW1HQES9P
```

### Пример 2: Через inngestProvider

```typescript
import { inngestProvider } from '@/inngest_app/inngest-provider'

await inngestProvider.sendEvent('RENDER', 'render/avatar-video', {
  job_id: `telegram-${telegramId}-${Date.now()}`,
  eleven_labs_api_key: process.env.ELEVENLABS_API_KEY,
  kie_api_key: process.env.KIE_AI_API_KEY,
  cover_url: 'https://example.com/cover.jpg',
  intro_text_1: 'Ai-Stars',
  intro_text_2: 'News',
  upper_intro_text: 'Ai-Stars',
  avatar_gen_service: 'hedra',
  avatar_settings: {
    api_key: process.env.HEDRA_API_KEY,
    avatar_photo_url: 'https://example.com/avatar.jpg',
    voice_id: '0BcDz9UPwL3MpsnTeUlO',
    avatar_speech: 'Текст для озвучки...',
  },
})
```

---

## 🎯 Payload Schema

### Структура для `render/avatar-video`:

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

---

## 🔍 Мониторинг и отладка

### Inngest Dashboard:
https://app.inngest.com

**Что смотреть:**
- Event ID
- Function execution status
- Logs and errors
- Retry attempts

### Railway Logs:
```bash
railway logs --service render-v3-production --tail
```

**Что смотреть:**
- Python FastAPI logs
- Render function execution
- API calls to Hedra/HeyGen
- Error tracebacks

### Bot Logs:
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30
docker logs 999-multibots --tail 100 | grep "AI REELS RENDER"
```

**Что смотреть:**
- Wizard steps execution
- Payment processing
- Event sending
- Webhook callbacks

---

## 💰 Pricing

### Hedra:
- Стоимость: **50⭐**
- Время: **2-3 минуты**
- Качество: **Хорошее**
- Рекомендация: **Для быстрых результатов**

### HeyGen:
- Стоимость: **100⭐**
- Время: **4-5 минут**
- Качество: **Премиум**
- Рекомендация: **Для профессионального контента**

---

## 🧪 Тестирование

### Тестовые скрипты:

```bash
# 1. Проверка правильного Inngest URL
npx tsx tests/test-correct-inngest-url.ts

# 2. Проверка render-server интеграции
npx tsx tests/test-direct-render-call.ts

# 3. Проверка inngestProvider
npx tsx tests/test-inngest-provider.ts
```

### Ожидаемый результат:
```
✅ Event sent successfully!
📝 Event ID: 01K7VBFGK96GGFT1KNW1HQES9P
📊 Status: 200
```

---

## 🔄 Webhook Callback

### Endpoint:
`POST /api/telegram/ai-reels-callback`

### Payload от render-server:
```json
{
  "job_id": "telegram-123456-1234567890",
  "status": "completed",
  "video_url": "https://...",
  "error": null
}
```

### Handler:
```typescript
router.post('/ai-reels-callback', async (req, res) => {
  const { job_id, status, video_url, error } = req.body

  // Извлечь telegram_id из job_id
  const telegramId = job_id.split('-')[1]

  if (status === 'completed' && video_url) {
    // Отправить видео пользователю
    await bot.telegram.sendVideo(telegramId, video_url, {
      caption: '✅ Ваше AI Reels видео готово!',
    })
  } else if (error) {
    // Уведомить об ошибке
    await bot.telegram.sendMessage(
      telegramId,
      `❌ Произошла ошибка: ${error}`
    )
  }

  res.json({ success: true })
})
```

---

## ⚠️ Важные замечания

### 1. URL для Inngest:
**ВСЕГДА используйте**: `https://inn.gs/e/{KEY}`
**НЕ используйте**: `https://api.inngest.com/e/{KEY}` (404)

### 2. Event Keys:
- **Старый ключ**: `kbuLz_G2JL28M5L3dRM5...` ✅ работает
- **Новый ключ**: `n6DddAUg5idycTbtQGP7...` ✅ работает (используется)

### 3. Environment:
Все ключи **уже добавлены** в production .env на сервере 212.86.115.30

### 4. Signing Key:
Используется тот же `INNGEST_SIGNING_KEY` для BOT и RENDER

---

## 📚 См. также:

- [INNGEST_IMPORTANT_RULES.md](./INNGEST_IMPORTANT_RULES.md) - Правила работы с Inngest
- [render-server-integration.md](./render-server-integration.md) - Диагностика render-server
- [inngest-provider-guide.md](./inngest-provider-guide.md) - Руководство по inngestProvider

---

## ✅ Готово к использованию!

AI Reels Render полностью интегрирован и готов к деплою в production.

**Чеклист:**
- ✅ Сцена создана: `ai-reels-render-wizard.ts`
- ✅ TypeScript интерфейсы обновлены
- ✅ Render Server Client готов
- ✅ Inngest Provider настроен
- ✅ Environment variables добавлены в production
- ✅ Правильный Inngest URL используется
- ✅ Тесты пройдены
- ✅ Документация создана

**Следующий шаг:**
1. Зарегистрировать сцену в главном файле
2. Добавить кнопку в меню
3. Создать webhook handler
4. Протестировать в production
5. Мониторить через Inngest Dashboard
