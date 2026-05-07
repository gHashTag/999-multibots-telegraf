# Inngest Production Secrets

## Секреты для добавления в Production

### BOT INNGEST (Основной бот)

```bash
BOT_INNGEST_EVENT_KEY=akoHhkQS3NGSQhDzcosD7o-0dGSJ9PWLiGol-fi5QMnZOG5XpvuxGBlnh_an9VQ0ygwA4BZEa3lfjKlbgm3U2A
BOT_INNGEST_BASE_URL=https://three-head-dragon.shop/api/inngest
BOT_INNGEST_SIGNING_KEY=signkey-prod-e2c2d07a9d0306957816b187e3e4fcd617ee0435923a1b613563c4666c82c047
```

### RENDER INNGEST (Render Server)

```bash
RENDER_INNGEST_EVENT_KEY=kbuLz_G2JL28M5L3dRM5mfwWSwNb4zi8eWTr5y4wrYWXEyIgcMyGz7NTkcY52AWjUcQz8m_Ig9lhJ6_m3-unaw
RENDER_INNGEST_SIGNING_KEY=signkey-branch-8e271f30535f3894656ff9b5e4cf97e1673880aa06c7b5d1470b3082110b2cf6
RENDER_INNGEST_BASE_URL=https://render-v3-production.up.render-server (local)/api/inngest
```

## Назначение переменных

### BOT_INNGEST_*
Используется для основного бота (three-head-dragon.shop)
- **EVENT_KEY**: Ключ для отправки событий в Inngest
- **SIGNING_KEY**: Ключ для подписи и верификации вебхуков
- **BASE_URL**: URL Inngest сервера для основного бота

### RENDER_INNGEST_*
Используется для Render Server (AI Reels генерация)
- **EVENT_KEY**: Ключ для отправки событий на Render Server
- **SIGNING_KEY**: Ключ для HMAC-SHA256 подписи запросов
- **BASE_URL**: URL Render Server Inngest endpoint

## Как добавить в production

### На сервере 212.86.115.30:

```bash
# 1. SSH подключение
ssh -i ~/.ssh/zomro root@212.86.115.30

# 2. Переход в проект
cd /root/bot-farm

# 3. Редактирование .env
nano .env

# 4. Добавить все 6 переменных (см. выше)

# 5. Пересобрать Docker с новыми переменными
docker stop 999-multibots
docker rm 999-multibots
docker build --no-cache -t 999-multibots .
docker run -d --name 999-multibots --restart=always \
  -p 3000:3000 -p 2999:2999 -p 3001:3001 -p 3002:3002 -p 3003:3003 \
  -p 3004:3004 -p 3005:3005 -p 3006:3006 -p 3007:3007 -p 3008:3008 \
  -p 3009:3009 -p 3010:3010 \
  -v /root/bot-farm/.env:/app/.env:ro \
  999-multibots

# 6. Проверка логов
docker logs 999-multibots --tail 50 | grep INNGEST
```

## Изменения в коде

### inngest-provider.ts

Код теперь использует новые имена переменных:

```typescript
// BOT instance
const botEventKey = process.env.BOT_INNGEST_EVENT_KEY
const botSigningKey = process.env.BOT_INNGEST_SIGNING_KEY
const botBaseUrl = process.env.BOT_INNGEST_BASE_URL

// RENDER instance
const renderEventKey = process.env.RENDER_INNGEST_EVENT_KEY
const renderSigningKey = process.env.RENDER_INNGEST_SIGNING_KEY
const renderBaseUrl = process.env.RENDER_INNGEST_BASE_URL
```

### Отправка событий на Render Server

При отправке событий на RENDER instance, код временно устанавливает env vars:

```typescript
if (instance === 'RENDER') {
  process.env.INNGEST_BASE_URL = config.baseUrl  // Render Server URL
  process.env.INNGEST_SIGNING_KEY = config.signingKey
  process.env.INNGEST_EVENT_KEY = config.eventKey
}

await config.client.send({ name: eventName, data })

// Восстановление оригинальных значений
```

## Проверка работы

После деплоя проверьте логи на наличие:

```
✅ [INNGEST PROVIDER] BOT instance configured
✅ [INNGEST PROVIDER] RENDER instance configured with SDK client
```

При отправке события на Render Server:

```
📤 [INNGEST PROVIDER] Sending event to RENDER via SDK
🔑 [INNGEST PROVIDER] Set environment for RENDER
✅ [INNGEST PROVIDER] Event sent to RENDER via SDK
```

## Troubleshooting

### Если видите "missing RENDER_INNGEST_EVENT_KEY"
Проверьте, что все 3 RENDER переменные добавлены в .env

### Если видите "404 Event key not found"
1. Проверьте, что RENDER_INNGEST_BASE_URL правильный
2. Проверьте, что код устанавливает env vars перед отправкой
3. Проверьте логи Render Server

### Если события не доходят до Render Server
1. Проверьте доступность Render Server URL
2. Проверьте RENDER_INNGEST_SIGNING_KEY совпадает с Render Server
3. Проверьте логи на Render Server на наличие ошибок подписи
