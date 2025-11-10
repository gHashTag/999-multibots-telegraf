# 🚀 Стабильная конфигурация Railway AI Reels Webhook

**Дата:** 2025-11-10
**Статус:** ✅ WORKING - Протестировано и стабильно
**Snapshot:** `working-webhook-20251110-213839`
**Git Tag:** `webhook-stable-20251110`

---

## 📋 ПРОБЛЕМА, КОТОРУЮ РЕШИЛИ

### Исходная проблема:
1. Railway render-server отправлял webhook с `download_url`, но код не распознавал это поле
2. Файлы > 50 MB не могли быть отправлены через Telegram API (ошибка "wrong type of web page content")
3. Nginx периодически терял SSL сертификаты при пересоздании контейнеров
4. Webhook callback URL работал только с HTTP, не с HTTPS

### Решение:
✅ Добавлена поддержка `download_url` в webhook handler
✅ Проверка размера файла через HEAD запрос
✅ Файлы > 50 MB отправляются как ссылка, не как видео
✅ SSL сертификаты с проверкой валидности
✅ Nginx восстановлен с корректными volume mappings

---

## 🔧 КОНФИГУРАЦИЯ WEBHOOK

### 1. Endpoint URL
```
https://three-head-dragon.shop/api/video-callback/:telegramId
```

**Пример:**
```
https://three-head-dragon.shop/api/video-callback/144022504
```

### 2. Payload структура (Railway render-server)
```json
{
  "download_url": "https://selstorage.ru/path/to/video.mp4",
  "job_id": "telegram-144022504-1762780185937"
}
```

### 3. Nginx конфигурация

**Файл:** `/root/bot-farm/nginx-config/default.conf`

```nginx
# HTTP server - redirect to HTTPS (except callback)
server {
    listen 80;
    server_name three-head-dragon.shop;

    # Railway render-server callback (HTTP без редиректа)
    location = /api/video-callback {
        proxy_pass http://999-multibots:2999/api/video-callback;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto http;
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_connect_timeout 30s;
        proxy_send_timeout 90s;
        proxy_read_timeout 90s;
    }

    # Остальной трафик → HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS server
server {
    listen 443 ssl;
    http2 on;
    server_name three-head-dragon.shop;
    client_max_body_size 100M;

    # SSL Certificate
    ssl_certificate /etc/nginx/ssl/cert.crt;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # HTTPS callback with telegramId
    location ~ ^/api/video-callback/(\d+)$ {
        proxy_pass http://999-multibots:2999$request_uri;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_connect_timeout 30s;
        proxy_send_timeout 90s;
        proxy_read_timeout 90s;
    }
}
```

---

## 💻 КОД ИЗМЕНЕНИЙ

### sendVideoDirectly() с проверкой размера файла

**Файл:** `src/api_server/routes/kie-ai-webhook.routes.ts`

```typescript
async function sendVideoDirectly(
  telegramId: string,
  videoUrl: string,
  metadata: { jobId?: string; duration?: number }
): Promise<void> {
  try {
    const botInstance = defaultBotInstance || getBotInstance()
    if (!botInstance) {
      throw new Error('No bot instance available')
    }

    const chatId = parseInt(telegramId)

    // ✅ Проверяем размер файла через HEAD запрос
    let fileSize = 0
    try {
      const headResponse = await fetch(videoUrl, { method: 'HEAD' })
      const contentLength = headResponse.headers.get('content-length')
      if (contentLength) {
        fileSize = parseInt(contentLength)
        logger.info('📏 [SEND VIDEO DIRECTLY] File size detected', {
          fileSize,
          fileSizeMB: (fileSize / 1024 / 1024).toFixed(2),
          isLargeFile: fileSize > 50 * 1024 * 1024
        })
      }
    } catch (error) {
      logger.warn('⚠️ [SEND VIDEO DIRECTLY] Could not get file size', {
        error: error instanceof Error ? error.message : String(error)
      })
    }

    const MAX_TELEGRAM_VIDEO_SIZE = 50 * 1024 * 1024 // 50 MB

    // ✅ Если файл > 50 MB - отправляем ссылку, иначе - видео
    if (fileSize > MAX_TELEGRAM_VIDEO_SIZE) {
      logger.info('📎 [SEND VIDEO DIRECTLY] File too large, sending as link', {
        fileSizeMB: (fileSize / 1024 / 1024).toFixed(2)
      })

      await botInstance.telegram.sendMessage(
        chatId,
        `✅ Видео готово!\n\n` +
        `⚠️ Файл слишком большой (${(fileSize / 1024 / 1024).toFixed(1)} MB), отправляю ссылку:\n\n` +
        `🔗 ${videoUrl}\n\n` +
        `🎬 Job ID: ${metadata.jobId || 'N/A'}\n` +
        `⏱ Длительность: ${metadata.duration || 'N/A'} сек`,
        {
          disable_web_page_preview: false
        }
      )
    } else {
      // Отправляем видео пользователю
      await botInstance.telegram.sendVideo(
        chatId,
        videoUrl,
        {
          caption: `✅ Видео готово!\n\n🎬 Job ID: ${metadata.jobId || 'N/A'}\n⏱ Длительность: ${metadata.duration || 'N/A'} сек`,
        }
      )
    }

    logger.info('✅ [SEND VIDEO DIRECTLY] Video sent successfully', {
      telegramId,
      chatId,
      jobId: metadata.jobId
    })
  } catch (error) {
    logger.error('❌ [SEND VIDEO DIRECTLY] Error sending video', {
      telegramId,
      videoUrl: videoUrl.substring(0, 100),
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })
    throw error
  }
}
```

### processGenericVideoWebhook() с поддержкой download_url

```typescript
const videoUrl = payload.download_url ||  // ✅ Railway render-server
                 payload.videoUrl ||
                 payload.video_url ||
                 payload.url ||
                 payload.result_url ||
                 payload.output ||
                 payload.data?.videoUrl ||
                 payload.data?.video_url ||
                 payload.data?.output

const success = payload.success !== undefined
  ? payload.success
  : (payload.download_url ? true : (payload.status === 'completed' || ...))
```

---

## 🔐 SSL СЕРТИФИКАТЫ

### Проверка валидности

**Файл:** `/root/bot-farm/check-ssl.sh`

```bash
#!/bin/bash
# SSL Certificate Health Check Script

# Проверяем наличие SSL файлов
if [ ! -f /root/bot-farm/ssl/cert.crt ]; then
    echo '❌ ERROR: SSL certificate not found'
    exit 1
fi

if [ ! -f /root/bot-farm/ssl/key.pem ]; then
    echo '❌ ERROR: SSL key not found'
    exit 1
fi

# Проверяем валидность сертификата
expiry_date=$(openssl x509 -enddate -noout -in /root/bot-farm/ssl/cert.crt | cut -d= -f2)
expiry_epoch=$(date -d "$expiry_date" +%s)
current_epoch=$(date +%s)
days_until_expiry=$(( ($expiry_epoch - $current_epoch) / 86400 ))

if [ $days_until_expiry -lt 0 ]; then
    echo "❌ ERROR: SSL certificate expired $days_until_expiry days ago!"
    exit 1
fi

if [ $days_until_expiry -lt 7 ]; then
    echo "⚠️  WARNING: SSL certificate expires in $days_until_expiry days!"
fi

echo "✅ SSL certificates OK (expires in $days_until_expiry days)"
exit 0
```

### Интеграция в deploy.sh

```bash
deploy() {
    log_info "=== DEPLOY НАЧАЛО ==="
    check_server

    # ✅ Проверка SSL сертификатов
    log_info "0. Проверка SSL сертификатов..."
    ssh_exec "$PROJECT_PATH/check-ssl.sh" || {
        log_error "SSL сертификаты не прошли проверку! Деплой остановлен."
        exit 1
    }

    # ... остальной код деплоя
}
```

---

## 🐳 DOCKER COMPOSE

### Nginx volumes (КРИТИЧЕСКИ ВАЖНО!)

```yaml
services:
  proxy:
    image: nginx:latest
    container_name: bot-proxy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx-config:/etc/nginx/conf.d:ro
      - ./ssl:/etc/nginx/ssl:ro  # ← ВАЖНО!
    networks:
      - app-network
```

**Если volumes не указаны в docker-compose.yml, запускать вручную:**

```bash
docker run -d \
  --name bot-proxy \
  --network bot-farm_app-network \
  -p 80:80 \
  -p 443:443 \
  -v /root/bot-farm/nginx-config:/etc/nginx/conf.d:ro \
  -v /root/bot-farm/ssl:/etc/nginx/ssl:ro \
  --restart unless-stopped \
  nginx:latest
```

---

## 📦 SNAPSHOT & ROLLBACK

### Создание snapshot

```bash
SNAPSHOT_NAME="working-webhook-$(date +%Y%m%d-%H%M%S)"

# Docker images
docker save bot-farm-app nginx:latest | gzip > /root/docker-snapshot-${SNAPSHOT_NAME}.tar.gz

# Configs
tar -czf /root/config-snapshot-${SNAPSHOT_NAME}.tar.gz \
  /root/bot-farm/nginx-config/ \
  /root/bot-farm/ssl/ \
  /root/bot-farm/check-ssl.sh \
  /root/bot-farm/deploy.sh \
  /root/bot-farm/docker-compose.yml \
  /root/bot-farm/.env
```

### Восстановление из snapshot

```bash
SNAPSHOT_NAME="working-webhook-20251110-213839"

# Остановить контейнеры
cd /root/bot-farm
docker compose down

# Восстановить Docker images
docker load < /root/docker-snapshot-${SNAPSHOT_NAME}.tar.gz

# Восстановить конфиги
cd /root
tar -xzf config-snapshot-${SNAPSHOT_NAME}.tar.gz

# Запустить
cd /root/bot-farm
docker compose up -d
```

---

## 🧪 ТЕСТИРОВАНИЕ

### Проверка webhook

```bash
curl -X POST https://three-head-dragon.shop/api/video-callback/144022504 \
  -H 'Content-Type: application/json' \
  -d '{
    "download_url": "https://example.com/video.mp4",
    "job_id": "test-job-123"
  }'
```

**Ожидаемый ответ:**
```json
{
  "message": "Video webhook received and will be processed asynchronously",
  "timestamp": "2025-11-10T14:36:13.216Z"
}
```

### Проверка логов

```bash
docker logs 999-multibots --tail 50 | grep -E '(File size|large|sendMessage|Video sent)'
```

**Ожидаемые логи для большого файла:**
```
📏 [SEND VIDEO DIRECTLY] File size detected {"fileSize":72986884,"fileSizeMB":"69.61","isLargeFile":true}
📎 [SEND VIDEO DIRECTLY] File too large, sending as link {"fileSizeMB":"69.61"}
✅ [SEND VIDEO DIRECTLY] Video sent successfully
```

---

## ⚠️ ИЗВЕСТНЫЕ ПРОБЛЕМЫ И РЕШЕНИЯ

### 1. Nginx теряет SSL сертификаты

**Причина:** Docker Compose не указывает volumes для SSL
**Решение:** Запускать nginx вручную с явными volume mappings (см. секцию Docker Compose выше)

### 2. Webhook возвращает 502 Bad Gateway

**Причина:** Nginx не запущен или потерял SSL сертификаты
**Решение:**
```bash
# Проверить SSL
/root/bot-farm/check-ssl.sh

# Пересоздать nginx
docker rm -f bot-proxy
docker run -d --name bot-proxy \
  --network bot-farm_app-network \
  -p 80:80 -p 443:443 \
  -v /root/bot-farm/nginx-config:/etc/nginx/conf.d:ro \
  -v /root/bot-farm/ssl:/etc/nginx/ssl:ro \
  --restart unless-stopped nginx:latest
```

### 3. download_url не распознается

**Причина:** Старая версия кода без поддержки `download_url`
**Решение:** Откатиться к snapshot или git tag `webhook-stable-20251110`

```bash
cd /root/bot-farm
git checkout webhook-stable-20251110
docker compose build --pull app
docker compose up -d
```

### 4. Файлы > 50 MB не отправляются

**Причина:** Telegram API не принимает видео > 50 MB
**Решение:** Код автоматически отправляет ссылку для больших файлов (уже реализовано)

---

## 📊 КОММИТЫ И ВЕРСИИ

| Коммит | Описание | Файлы |
|--------|----------|-------|
| `ec489374` | Add detectVideoWebhookProvider function | `kie-ai-webhook.routes.ts` |
| `c2f6e88a` | Add download_url support for Railway | `kie-ai-webhook.routes.ts` |
| `d0694d96` | Send large videos (>50MB) as links | `kie-ai-webhook.routes.ts` |

**Git Tag:** `webhook-stable-20251110`
**Snapshot:** `working-webhook-20251110-213839`

---

## 📞 КОНТАКТЫ

**Для экстренных вопросов:**
- Проверить документацию: `docs/WEBHOOK_RAILWAY_STABLE_CONFIG.md`
- Посмотреть snapshot: `/root/docker-snapshot-working-webhook-20251110-213839.tar.gz`
- Git история: `git log --oneline --grep="webhook"`

---

**Последнее обновление:** 2025-11-10 14:40 UTC
**Статус:** ✅ Production Ready
