# Inngest Provider - Руководство по использованию

## Обзор

`inngestProvider` - это централизованный менеджер для управления несколькими Inngest инстансами в проекте.

### Поддерживаемые инстансы:

1. **BOT** - основной бот (наш сервер `three-head-dragon.shop`)
2. **RENDER** - render-server на Railway для генерации видео

## Настройка Environment Variables

### .env файл:

```bash
# ======================================
# BOT Instance (Основной бот)
# ======================================
INNGEST_EVENT_KEY=akoHhkQS3NGSQhDzcosD7o-0dGSJ9PWLiGol-fi5QMnZOG5XpvuxGBlnh_an9VQ0ygwA4BZEa3lfjKlbgm3U2A
INNGEST_SIGNING_KEY=signkey-prod-e2c2d07a9d0306957816b187e3e4fcd617ee0435923a1b613563c4666c82c047
INNGEST_BASE_URL=https://three-head-dragon.shop/api/inngest

# ======================================
# RENDER Instance (Render Server)
# ======================================
INNGEST_EVENT_KEY_RENDER=kbuLz_G2JL28M5L3dRM5mfwWSwNb4zi8eWTr5y4wrYWXEyIgcMyGz7NTkcY52AWjUcQz8m_Ig9lhJ6_m3-unaw
INNGEST_SIGNING_KEY_RENDER=signkey-prod-e2c2d07a9d0306957816b187e3e4fcd617ee0435923a1b613563c4666c82c047

# ======================================
# Render Server Settings
# ======================================
RENDER_SERVER_URL=https://render-v3-production.up.railway.app
HEDRA_API_KEY=sk_hedra_jTiPa9kEiQ25EwjwkAoaCPmxcMfZZalnSUi-tQOjZrBISgz9jqKtK0j96YzreHQ3
```

## Использование в коде

### 1. Импорт провайдера

```typescript
import { inngestProvider } from '@/inngest_app/inngest-provider'
```

### 2. Отправка событий

#### Отправка в BOT инстанс (наш сервер):

```typescript
const result = await inngestProvider.sendEvent(
  'BOT',
  'ai-reels/generate',
  {
    telegramId: '123456789',
    imageUrl: 'https://example.com/image.jpg',
    text: 'Test message',
    resolution: '720p',
  }
)

console.log(`Event ID: ${result.eventId}`)
```

#### Отправка в RENDER инстанс (render-server):

```typescript
const result = await inngestProvider.sendEvent(
  'RENDER',
  'render/avatar-video',
  {
    job_id: 'job-123',
    eleven_labs_api_key: process.env.ELEVENLABS_API_KEY,
    kie_api_key: process.env.KIE_AI_API_KEY,
    avatar_gen_service: 'hedra',
    avatar_settings: {
      api_key: process.env.HEDRA_API_KEY,
      avatar_photo_url: 'https://example.com/avatar.jpg',
      voice_id: 'voice-id',
      avatar_speech: 'Text to speak',
    },
  }
)

console.log(`Event ID: ${result.eventId}`)
```

### 3. Проверка доступности инстанса

```typescript
const isAvailable = await inngestProvider.checkAvailability('RENDER')
console.log(`RENDER available: ${isAvailable}`)
```

### 4. Получение статуса всех инстансов

```typescript
const status = await inngestProvider.getStatus()
console.log(status)
// {
//   BOT: { configured: true, available: true },
//   RENDER: { configured: true, available: true }
// }
```

### 5. Получение конфигурации

```typescript
const config = inngestProvider.getConfig('RENDER')
if (config) {
  console.log(`Event Key: ${config.eventKey}`)
  console.log(`Base URL: ${config.baseUrl}`)
}
```

## Render Server Client

Для работы с render-server используйте готовый клиент:

```typescript
import {
  sendRenderAvatarVideoEvent,
  checkRenderServerAvailability,
  createRenderAvatarPayload,
} from '@/inngest_app/render-server-client'

// Проверка доступности
const isAvailable = await checkRenderServerAvailability()

// Создание payload
const payload = createRenderAvatarPayload(
  telegramId,
  avatarSpeechText,
  avatarPhotoUrl,
  voiceId,
  {
    coverUrl: 'https://example.com/cover.jpg',
    introText1: 'Ai-Stars',
    introText2: 'News',
  }
)

// Отправка события
const { eventId } = await sendRenderAvatarVideoEvent(payload)
```

## Архитектура

```
┌─────────────────────────────────────────┐
│         inngestProvider                 │
│                                         │
│  ┌──────────┐         ┌──────────┐    │
│  │   BOT    │         │  RENDER  │    │
│  │ Instance │         │ Instance │    │
│  └──────────┘         └──────────┘    │
│       │                     │          │
└───────┼─────────────────────┼──────────┘
        │                     │
        ▼                     ▼
┌──────────────┐    ┌──────────────────┐
│ Inngest API  │    │  Inngest API     │
│ (BOT events) │    │ (RENDER events)  │
└──────────────┘    └──────────────────┘
        │                     │
        ▼                     ▼
┌──────────────┐    ┌──────────────────┐
│ Our Server   │    │ Railway Server   │
│ three-head-  │    │ render-v3-       │
│ dragon.shop  │    │ production       │
└──────────────┘    └──────────────────┘
```

## Тестирование

### Тест провайдера:

```bash
npm run test:inngest-provider
# или
npx tsx tests/test-inngest-provider.ts
```

### Тест render-server:

```bash
npx tsx tests/test-render-server-hedra.ts
```

### Тест имен событий:

```bash
npx tsx tests/test-render-event-names.ts
```

## Troubleshooting

### 404 Not Found при отправке событий

**Проблема:** Event key не связан с render-server в Inngest Dashboard.

**Решение:**
1. Проверить настройки event key в Inngest Dashboard
2. Убедиться, что event key направлен на правильный app/environment
3. Проверить имена событий в render-server коде

### Instance not configured

**Проблема:** Отсутствуют необходимые environment variables.

**Решение:**
1. Проверить наличие `INNGEST_EVENT_KEY` (для BOT)
2. Проверить наличие `INNGEST_EVENT_KEY_RENDER` (для RENDER)
3. Перезапустить приложение после добавления переменных

### Server not available

**Проблема:** Render-server недоступен или не отвечает.

**Решение:**
1. Проверить статус Railway deployment
2. Проверить логи render-server: `railway logs`
3. Проверить endpoint: `https://render-v3-production.up.railway.app/api/inngest`

## Production Deployment

### Обновление .env в production:

```bash
ssh -i ~/.ssh/zomro root@212.86.115.30
cd /root/bot-farm
nano .env
# Добавить INNGEST_EVENT_KEY_RENDER и INNGEST_SIGNING_KEY_RENDER

# Перезапустить Docker контейнер
docker restart 999-multibots
```

### Проверка в production:

```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 'docker logs 999-multibots --tail 50 | grep INNGEST'
```

## Следующие шаги

1. **Связать event key с render-server** в Inngest Dashboard
2. **Проверить исходный код render-server** для точных имен событий
3. **Настроить webhook** для получения результатов от render-server
4. **Добавить retry logic** для надежности доставки событий

## Контакты и поддержка

- Render Server: https://render-v3-production.up.railway.app
- Inngest Dashboard: https://app.inngest.com
- Документация Inngest: https://www.inngest.com/docs
