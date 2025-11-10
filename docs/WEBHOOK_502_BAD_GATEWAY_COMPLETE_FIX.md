# 🔥 WEBHOOK 502 Bad Gateway - ПОЛНОЕ ИСПРАВЛЕНИЕ

**Дата создания:** 2025-11-01
**Статус:** КРИТИЧЕСКИ ВАЖНО
**Проблема:** `https://three-head-dragon.shop/api/telegram/ai-reels-callback` возвращает 502 Bad Gateway

---

## 🎯 ПРОБЛЕМА

Ошибка от Render Server:
```
httpx.HTTPStatusError: Server error '502 Bad Gateway' for url 'https://three-head-dragon.shop/api/telegram/ai-reels-callback'
```

**Причина:** API сервер недоступен на порту 3000 внутри Docker контейнера

---

## 🏗️ АРХИТЕКТУРА (ОСНОВАНА НА ИСТОРИИ КОММИТОВ)

### Компоненты системы:

```
┌─────────────────────────────────────────────────────────────┐
│                    NGINX Reverse Proxy                       │
│                   three-head-dragon.shop                     │
│                   SSL/HTTPS (Let's Encrypt)                  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ├─ POST /api/telegram/ai-reels-callback
                     │  → http://999-multibots:3000/api/telegram/ai-reels-callback
                     │
                     ├─ POST /api/kie-ai/callback
                     │  → http://999-multibots:3000/api/kie-ai/callback
                     │
                     └─ GET /health
                        → http://999-multibots:3000/health

┌─────────────────────────────────────────────────────────────┐
│            Docker Container: 999-multibots                   │
│                    Port: 3000                                │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │              Express API Server                      │  │
│  │                 Port: 3000                           │  │
│  │  - ai-reels-callback.routes.ts                       │  │
│  │  - kie-ai-webhook.routes.ts                          │  │
│  │  - health.routes.ts                                  │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │           Telegram Bot Farm (10 bots)                │  │
│  │         Ports: 2999-3010                             │  │
│  └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔍 ДИАГНОСТИКА

### 1. Проверка контейнера:
```bash
# Статус контейнера
docker ps -a | grep 999-multibots

# Логи контейнера
docker logs 999-multibots | tail -100

# Проброс портов
docker port 999-multibots
```

**Ожидаемый результат:**
```
3000/tcp -> 0.0.0.0:3000
```

### 2. Проверка API сервера:
```bash
# Внутри контейнера
docker exec 999-multibots netstat -tlnp | grep 3000

# Тест локально
curl http://localhost:3000/health
```

**Ожидаемый результат:**
```
{"status":"UP","source":"health.routes","timestamp":"..."}
```

### 3. Проверка nginx:
```bash
# Статус nginx
systemctl status nginx

# Конфигурация
nginx -t

# Логи
tail -f /var/log/nginx/error.log
```

### 4. Проверка DNS:
```bash
nslookup three-head-dragon.shop
dig three-head-dragon.shop

# Тест HTTPS
curl -I https://three-head-dragon.shop/api/telegram/ai-reels-callback
```

---

## ✅ ПОЛНОЕ ИСПРАВЛЕНИЕ

### Шаг 1: Проверить и пересоздать контейнер

```bash
# Остановить старый контейнер
docker stop 999-multibots
docker rm 999-multibots

# Собрать новый образ (ОБЯЗАТЕЛЬНО без кэша!)
docker build --no-cache --pull -t 999-agents-telegraf:latest .

# Запустить с правильными портами
docker run -d \
  --name 999-multibots \
  --restart=always \
  -p 3000:3000 \
  -p 2999-3010:2999-3010 \
  -p 4000:4000 \
  -v /root/999-multibots-telegraf/.env:/app/.env:ro \
  999-agents-telegraf:latest
```

**КРИТИЧЕСКИ ВАЖНО:** Порт 3000 ДОЛЖЕН быть пробрасываем!

### Шаг 2: Проверить nginx конфигурацию

**Файл:** `/etc/nginx/sites-available/three-head-dragon`

```nginx
# HTTP Server (redirect to HTTPS, except callback endpoint)
server {
    listen 80;
    server_name three-head-dragon.shop;

    # ✅ Allow callback endpoint on HTTP (for Render Server compatibility)
    location = /api/telegram/ai-reels-callback {
        proxy_pass http://999-multibots:3000/api/telegram/ai-reels-callback;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto http;
    }

    # All other HTTP requests → redirect to HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS Server
server {
    listen 443 ssl http2;
    server_name three-head-dragon.shop;

    # SSL Configuration
    ssl_certificate /etc/nginx/ssl/three-head-dragon.shop.crt;
    ssl_certificate_key /etc/nginx/ssl/three-head-dragon.shop.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # ✅ Callback endpoint on HTTPS (for other services)
    location = /api/telegram/ai-reels-callback {
        proxy_pass http://999-multibots:3000/api/telegram/ai-reels-callback;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;

        # Webhook best practices
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_connect_timeout 30s;
        proxy_send_timeout 90s;
        proxy_read_timeout 90s;
    }

    # All other API endpoints
    location /api/ {
        proxy_pass http://999-multibots:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Health Check
    location /health {
        proxy_pass http://999-multibots:3000/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Шаг 3: Перезапустить nginx

```bash
# Проверить конфигурацию
nginx -t

# Перезагрузить
systemctl reload nginx
```

### Шаг 4: Проверить запуск API сервера

**Файл:** `/Users/playra/999-agents-telegraf/worktrees/ai-reels/src/api_server/index.ts`

```typescript
// Определяем порт. Берем из process.env.PORT, если есть, иначе 4000 (совместимо с reverse proxy).
const PORT = '3000'  // ← КРИТИЧЕСКИ ВАЖНО!

export function startApiServer(): void {
  const app: any = express()

  // ✅ Безопасная конфигурация trust proxy для nginx
  // Доверяем только первому прокси (nginx), а не всем
  app.set('trust proxy', 1)

  // ✅ РЕШЕНИЕ ПРОБЛЕМЫ ТАЙМАУТОВ: Увеличиваем таймауты для долгих операций
  app.use((req: any, res: any, next: any) => {
    // Увеличиваем таймаут до 10 минут для всех запросов
    req.setTimeout(600000) // 10 минут
    res.setTimeout(600000) // 10 минут
    next()
  })

  // Middleware для парсинга JSON с установленным лимитом в 10MB
  app.use(express.json({ limit: '10mb' }) as any)

  // Улучшенный middleware для логгирования запросов
  app.use((req: any, res: any, next: any) => {
    logger.info(`[API] Request received`, {
      method: req.method,
      url: req.url,
      headers: req.headers,
    })
    next()
  })

  // Регистрируем маршруты
  app.use('/', healthRouter)
  app.use('/api', aiReelsCallbackRouter)
  // ... другие роуты

  // Запуск основного сервера
  app.listen(PORT, () => {
    console.log(`[API] Server started on port ${PORT}`)  // ← Должно быть 3000
  })
}
```

---

## 🧪 ТЕСТИРОВАНИЕ

### Тест 1: Локальная проверка порта
```bash
curl http://localhost:3000/health
```

**Ожидаемый ответ:**
```json
{"status":"UP","source":"health.routes","timestamp":"2025-11-01T10:00:00.000Z"}
```

### Тест 2: Проверка webhook endpoint
```bash
curl -X GET https://three-head-dragon.shop/api/telegram/ai-reels-callback
```

**Ожидаемый ответ:**
```json
{
  "status": "ok",
  "service": "ai-reels-callback",
  "timestamp": "2025-11-01T10:00:00.000Z"
}
```

### Тест 3: POST webhook callback
```bash
curl -X POST https://three-head-dragon.shop/api/telegram/ai-reels-callback \
  -H "Content-Type: application/json" \
  -d '{
    "download_url": "https://example.com/video.mp4",
    "job_id": "telegram-123456789-1234567890",
    "status": "completed",
    "bot_name": "HaimGroupMedia_bot"
  }'
```

**Ожидаемый ответ:**
```json
{
  "message": "AI Reels callback received and will be processed asynchronously",
  "timestamp": "2025-11-01T10:00:00.000Z"
}
```

### Тест 4: Проверка логов
```bash
docker logs 999-multibots | grep -i "callback\|ai-reels"
```

**Ожидаемый вывод:**
```
🔔 [AI REELS CALLBACK] Webhook received
🎬 [AI REELS CALLBACK] Received callback from Render Server
✅ [AI REELS CALLBACK] Processed successfully
```

---

## 📋 АВТОМАТИЧЕСКАЯ ПРОВЕРКА

### Скрипт диагностики:
```bash
#!/bin/bash
echo "=== WEBHOOK 502 BAD GATEWAY DIAGNOSTIC ==="
echo ""

echo "1. Checking Docker container..."
docker ps | grep 999-multibots
echo ""

echo "2. Checking port mappings..."
docker port 999-multibots
echo ""

echo "3. Checking API server health..."
curl -s http://localhost:3000/health | jq .
echo ""

echo "4. Checking HTTPS endpoint..."
curl -s -I https://three-head-dragon.shop/api/telegram/ai-reels-callback
echo ""

echo "5. Checking nginx status..."
systemctl status nginx --no-pager -l
echo ""

echo "6. Checking nginx configuration..."
nginx -t
echo ""

echo "7. Checking container logs (last 20 lines)..."
docker logs 999-multibots | tail -20
echo ""

echo "=== END DIAGNOSTIC ==="
```

---

## 🛠️ ЭКСТРЕННОЕ ВОССТАНОВЛЕНИЕ

### Если все сломалось:

```bash
#!/bin/bash
# Emergency restore script

# 1. Stop everything
docker stop 999-multibots 2>/dev/null || true
docker rm 999-multibots 2>/dev/null || true
systemctl stop nginx

# 2. Rebuild from scratch
cd /root/999-multibots-telegraf
git pull origin production
docker build --no-cache --pull -t 999-agents-telegraf:latest .

# 3. Start with correct ports
docker run -d \
  --name 999-multibots \
  --restart=always \
  -p 3000:3000 \
  -p 2999-3010:2999-3010 \
  -p 4000:4000 \
  -v $(pwd)/.env:/app/.env:ro \
  999-agents-telegraf:latest

# 4. Wait for container to start
sleep 10

# 5. Start nginx
systemctl start nginx
systemctl reload nginx

# 6. Health check
sleep 5
curl -s http://localhost:3000/health
```

---

## 🔒 ИСТОРИЯ ПРОБЛЕМ И РЕШЕНИЙ

### 2025-10-16: Первое исправление
**Проблема:** Webhook возвращал 502 Bad Gateway
**Решение:**
- Добавлен проброс порта 2999 в Docker
- Обновлена nginx конфигурация для проксирования на localhost:2999
- Внедрены webhook best practices

### 2025-11-01: Второе исправление
**Проблема:** API сервер запускается на порту 3000, но не пробрасывается
**Решение:**
- Проброс порта 3000 в Docker: `-p 3000:3000`
- Обновлена nginx конфигурация для проксирования на `http://999-multibots:3000`
- Добавлено логирование для диагностики

---

## 📚 ССЫЛКИ

- [Nginx 502 Bad Gateway Docker - Stack Overflow](https://stackoverflow.com/questions/38346847/nginx-docker-container-502-bad-gateway-response)
- [502 Bad Gateway NGINX Fix - CloudPanel](https://www.cloudpanel.io/blog/502-bad-gateway-nginx-fix/)
- [Webhook Best Practices](https://bobcares.com/blog/nginx-502-bad-gateway-docker/)
- [Express.js API Server Documentation](../src/api_server/README.md)

---

## ✅ ЧЕКЛИСТ ДЛЯ БУДУЩИХ ИЗМЕНЕНИЙ

- [ ] Docker контейнер запущен и доступен
- [ ] Порт 3000 пробрасывается в Docker
- [ ] API сервер слушает порт 3000
- [ ] Nginx проксирует на `http://999-multibots:3000`
- [ ] SSL сертификат валиден
- [ ] Локальные тесты проходят
- [ ] HTTPS тесты проходят
- [ ] Логи показывают успешную обработку
- [ ] Webhook callbacks приходят от Render Server
- [ ] Видео отправляются пользователям

---

**Автор:** Claude Code (на основе анализа git истории и документации)
**Статус:** ✅ ГОТОВО К ПРИМЕНЕНИЮ
