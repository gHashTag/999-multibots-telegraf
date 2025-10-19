# Railway Render-Server Integration

## Архитектура

```
Telegram Bot → Inngest Cloud (inn.gs) → Railway Render-Server
```

**ВАЖНО**: Railway render-server это **функция, зарегистрированная В Inngest Cloud**, а НЕ самостоятельный Inngest сервер!

## Правильный Подход ✅

### 1. Отправка событий в Inngest Cloud

```typescript
const client = new Inngest({
  name: 'telegram-bot-client',
  eventKey: 'kbuLz_G2JL28M5L3dRM5mfwWSwNb4zi8eWTr5y4wrYWXEyIgcMyGz7NTkcY52AWjUcQz8m_Ig9lhJ6_m3-unaw',
  // НЕ устанавливаем inngestBaseUrl - по умолчанию https://inn.gs/
})

await client.send({
  name: 'render/avatar-video',
  data: payload
})
```

### 2. Inngest Cloud автоматически вызывает Railway

- Event key зарегистрирован в Inngest Cloud Dashboard
- Inngest Cloud знает, что нужно вызвать Railway render-server
- Railway получает webhook от Inngest Cloud

## Неправильные Подходы ❌

### ❌ Прямой POST на Railway

```typescript
// ЭТО НЕ РАБОТАЕТ!
fetch('https://render-v3-production.up.railway.app/api/inngest', {
  method: 'POST',
  body: JSON.stringify(payload)
})
// → 401 sig_verification_failed
```

### ❌ Inngest SDK с Railway URL

```typescript
// ЭТО НЕ РАБОТАЕТ!
const client = new Inngest({
  eventKey: 'kbuLz_G2JL28M5L3dRM5...',
  inngestBaseUrl: 'https://render-v3-production.up.railway.app/api/inngest'
})
// → 404 Event key not found
// SDK создает: /api/e/{eventKey} - Railway этого не поддерживает!
```

## Environment Variables

```bash
# RENDER инстанс (для отправки в Inngest Cloud)
RENDER_INNGEST_EVENT_KEY="kbuLz_G2JL28M5L3dRM5mfwWSwNb4zi8eWTr5y4wrYWXEyIgcMyGz7NTkcY52AWjUcQz8m_Ig9lhJ6_m3-unaw"
RENDER_INNGEST_SIGNING_KEY="signkey-branch-8e271f30535f3894656ff9b5e4cf97e1673880aa06c7b5d1470b3082110b2cf6"
RENDER_INNGEST_BASE_URL="https://render-v3-production.up.railway.app/api/inngest" # Для reference, не используется для отправки
```

## Inngest Provider Usage

```typescript
import { inngestProvider } from '@/inngest_app/inngest-provider'

// Отправить событие через RENDER instance
await inngestProvider.sendEvent('RENDER', 'render/avatar-video', {
  job_id: 'test-123',
  // ...payload
})

// Inngest Provider автоматически:
// 1. Использует RENDER_INNGEST_EVENT_KEY
// 2. Отправляет в Inngest Cloud (inn.gs)
// 3. Inngest Cloud вызывает Railway render-server
```

## Event Format

```typescript
{
  name: 'render/avatar-video', // Event name
  data: {
    job_id: string
    eleven_labs_api_key: string
    kie_api_key: string
    cover_url: string
    intro_text_1: string
    intro_text_2: string
    upper_intro_text: string
    avatar_gen_service: 'hedra' | 'other'
    avatar_settings: {
      api_key: string
      avatar_photo_url: string
      voice_id: string
      avatar_speech: string
    }
  }
}
```

## Тестирование

```bash
# Тест отправки в Inngest Cloud
npx tsx tests/test-inngest-cloud.ts

# Результат: ✅ Event sent to Inngest Cloud!
```

## Railway Endpoint

- **URL**: `https://render-v3-production.up.railway.app/api/inngest`
- **Назначение**: Принимать webhooks ОТ Inngest Cloud
- **НЕ поддерживает**: Прямые HTTP POST запросы от клиентов

## Итоговая Схема

```
1. Bot создает payload
   ↓
2. inngestProvider.sendEvent('RENDER', 'render/avatar-video', payload)
   ↓
3. Inngest SDK отправляет в https://inn.gs/e/{eventKey}
   ↓
4. Inngest Cloud получает событие
   ↓
5. Inngest Cloud вызывает Railway webhook
   → POST https://render-v3-production.up.railway.app/api/inngest
   ↓
6. Railway обрабатывает запрос и генерирует видео
```

## Проверка Статуса

```bash
# Проверить Inngest Cloud dashboard
https://app.inngest.com/

# Event Key: kbuLz_G2JL28M5L3dRM5...
# App: render server
```
