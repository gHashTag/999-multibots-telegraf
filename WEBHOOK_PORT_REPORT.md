# 🔌 Отчёт: Вебхуки и порты

**Дата**: 2025-11-09
**Проект**: VIBEE - AI-Powered Telegram Bot Platform

---

## 📊 Текущее состояние

### Dev окружение (локально)

```
🔌 [PORTS] Проверка доступных портов...
   ✅ Порт 80: доступен
   ✅ Порт 443: доступен
   ⚠️  Порт 3000: занят (используется другим процессом)
   ✅ Порт 8080: доступен
```

**Вебхуки для ботов**:
```
🔍 [WEBHOOK INFO] Бот: clip_maker_neuro_bot
   URL: не установлен
   Pending updates: 0
   📋 Allowed updates: message, callback_query, pre_checkout_query
   🟢 Активного вебхука нет, можно запускать polling

🔍 [WEBHOOK INFO] Бот: helper_999_bot
   URL: не установлен
   Pending updates: 0
   📋 Allowed updates: message, callback_query, pre_checkout_query
   🟢 Активного вебхука нет, можно запускать polling
```

**Режим работы**: Polling (long-polling)
**API сервер**: Порт 3000 (0.0.0.0)

---

### Production окружение (212.86.115.30)

**Конфигурация из .env**:
```bash
API_PORT=2999
SERVER_PORT=2999
PORT=2999
WEBHOOK_PATH=/webhook

# Вебхуки для сторонних сервисов
BFL_WEBHOOK_URL=https://ai-server-production-production-8e2d.up.railway.app/webhooks/webhook-bfl
BFL_WEBHOOK_SECRET=12345dfis!67890
```

**Telegram боты**: Используют polling (не webhook mode)
**API сервер**: Порт 2999
**Nginx reverse proxy**: НЕ настроен для порта 80

---

## ⚠️ Обнаруженные проблемы

### 1. Порт 80 не используется в production

**Проблема**:
- Приложение слушает на порту 2999
- Порт 80 (стандартный HTTP) не занят
- Telegram вебхуки требуют порт 80, 88, 443 или 8443

**Риски**:
- Невозможно настроить Telegram webhooks на порт 2999
- Приходится использовать polling (менее эффективно)
- Нет SSL/TLS на порту 80

### 2. Отсутствует Nginx reverse proxy

**Проблема**:
- Нет балансировки нагрузки
- Нет SSL termination
- Прямой доступ к Node.js приложению

**Рекомендация**:
Настроить Nginx для проксирования 80/443 → 2999

### 3. Смешанный режим: polling для Telegram, webhooks для AI сервисов

**Текущее состояние**:
- Telegram боты: polling (getUpdates)
- BFL (AI image generation): webhooks
- Inngest (workflow engine): webhooks (закомментирован)

**Проблема**:
Polling менее эффективен чем webhooks:
- Больше нагрузки на Telegram API
- Задержки в получении обновлений
- Больше сетевого трафика

---

## ✅ Рекомендации

### Краткосрочные (для текущей конфигурации)

1. **Оставить polling для dev окружения** ✅
   - Проще для разработки
   - Не требует настройки SSL
   - Текущие логи показывают всю нужную информацию

2. **Документировать конфигурацию портов** ✅
   - Dev: 3000 (API), polling для ботов
   - Prod: 2999 (API), polling для ботов
   - Вебхуки: только для AI сервисов (BFL, Inngest)

### Долгосрочные (для масштабирования)

1. **Настроить Nginx reverse proxy на production**

```nginx
# /etc/nginx/sites-available/vibee

upstream vibee_backend {
    server 127.0.0.1:2999;
    keepalive 64;
}

server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://vibee_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Webhook endpoint для Telegram
    location /webhook {
        proxy_pass http://vibee_backend/webhook;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

2. **Настроить SSL с Let's Encrypt**

```bash
# Установить certbot
apt install certbot python3-certbot-nginx

# Получить сертификат
certbot --nginx -d your-domain.com

# Автоматическое обновление
systemctl enable certbot.timer
```

3. **Переключить Telegram боты на webhook mode**

```typescript
// После настройки Nginx и SSL
async function setupWebhook(bot: Telegraf, webhookUrl: string) {
  await bot.telegram.setWebhook(webhookUrl, {
    allowed_updates: [
      'message',
      'callback_query',
      'pre_checkout_query',
      'successful_payment'
    ],
    drop_pending_updates: true,
    secret_token: process.env.WEBHOOK_SECRET
  })

  console.log(`✅ Webhook установлен: ${webhookUrl}`)
}

// В production
if (!isDev) {
  const webhookUrl = `https://your-domain.com/webhook`
  await setupWebhook(bot, webhookUrl)
  bot.launch({ webhook: { domain: 'your-domain.com', port: 2999 } })
} else {
  // Dev - polling
  bot.launch()
}
```

---

## 📋 Текущие логи (улучшены)

### Что показывают логи теперь:

1. **Проверка портов при старте**:
```
🔌 [PORTS] Проверка доступных портов...
   ✅ Порт 80: доступен
   ✅ Порт 443: доступен
   ⚠️  Порт 3000: занят (используется другим процессом)
   ✅ Порт 8080: доступен
```

2. **Детальная информация о вебхуках**:
```
🔍 [WEBHOOK INFO] Бот: clip_maker_neuro_bot
   URL: не установлен
   Pending updates: 0
   📋 Allowed updates: message, callback_query, pre_checkout_query
   🟢 Активного вебхука нет, можно запускать polling
```

3. **При активном вебхуке (в будущем)**:
```
🔍 [WEBHOOK INFO] Бот: production_bot
   URL: https://your-domain.com/webhook
   Pending updates: 0
   🌐 IP адрес: 149.154.160.0
   📋 Allowed updates: message, callback_query, pre_checkout_query
   ⚠️  Последняя ошибка: Connection timeout
   📅 Время ошибки: 2025-11-09T10:30:00.000Z

🔌 [WEBHOOK] Обнаружен активный вебхук: https://your-domain.com/webhook
   🗑️  Удаляю вебхук для переключения на polling...
   ✅ Вебхук удалён, переходим к polling
```

---

## 🎯 Приоритеты

### Высокий приоритет ✅ (реализовано):
- [x] Информативные логи о вебхуках
- [x] Проверка портов при старте
- [x] Автоматическая очистка вебхуков при переключении на polling

### Средний приоритет (для будущего):
- [ ] Настроить Nginx reverse proxy
- [ ] Получить SSL сертификат
- [ ] Переключить production на webhook mode

### Низкий приоритет (опционально):
- [ ] Load balancing с несколькими инстансами
- [ ] Мониторинг webhook доставляемости
- [ ] Автоматическое переключение polling ↔ webhook

---

## 📝 Изменённые файлы

### src/index.ts

**Добавлено в `startApplication()`** (lines 297-322):
```typescript
// 🔍 Проверка доступных портов
console.log('\n🔌 [PORTS] Проверка доступных портов...')
const net = await import('net')

const checkPort = (port: number): Promise<boolean> => {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close()
      resolve(true)
    })
    server.listen(port, '0.0.0.0')
  })
}

const ports = [80, 443, 3000, 8080]
for (const port of ports) {
  const isAvailable = await checkPort(port)
  if (isAvailable) {
    console.log(`   ✅ Порт ${port}: доступен`)
  } else {
    console.log(`   ⚠️  Порт ${port}: занят (используется другим процессом)`)
  }
}
```

**Добавлено в `initializeBots()`** (lines 205-227):
```typescript
const webhookInfo = await bot.telegram.getWebhookInfo()

console.log(`\n🔍 [WEBHOOK INFO] Бот: ${botInfo.username}`)
console.log(`   URL: ${webhookInfo.url || 'не установлен'}`)
console.log(`   Pending updates: ${webhookInfo.pending_update_count || 0}`)
if (webhookInfo.last_error_date) {
  const lastErrorDate = new Date(webhookInfo.last_error_date * 1000)
  console.log(`   ⚠️  Последняя ошибка: ${webhookInfo.last_error_message}`)
  console.log(`   📅 Время ошибки: ${lastErrorDate.toISOString()}`)
}
if (webhookInfo.ip_address) {
  console.log(`   🌐 IP адрес: ${webhookInfo.ip_address}`)
}
if (webhookInfo.allowed_updates && webhookInfo.allowed_updates.length > 0) {
  console.log(`   📋 Allowed updates: ${webhookInfo.allowed_updates.join(', ')}`)
}

if (webhookInfo.url) {
  console.log(`\n🔌 [WEBHOOK] Обнаружен активный вебхук: ${webhookInfo.url}`)
  console.log(`   🗑️  Удаляю вебхук для переключения на polling...`)
  await bot.telegram.deleteWebhook({ drop_pending_updates: true })
  console.log(`   ✅ Вебхук удалён, переходим к polling\n`)
} else {
  console.log(`   🟢 Активного вебхука нет, можно запускать polling\n`)
}
```

---

## 🔄 Миграция на webhooks (будущее)

### Шаг 1: Подготовка инфраструктуры

```bash
# На production сервере
ssh root@212.86.115.30

# Установить Nginx
apt update && apt install nginx

# Настроить reverse proxy
nano /etc/nginx/sites-available/vibee

# Включить конфигурацию
ln -s /etc/nginx/sites-available/vibee /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

### Шаг 2: Получить SSL сертификат

```bash
# Установить certbot
apt install certbot python3-certbot-nginx

# Получить сертификат (замените your-domain.com)
certbot --nginx -d your-domain.com

# Проверить автообновление
certbot renew --dry-run
```

### Шаг 3: Обновить код приложения

```typescript
// src/index.ts

const WEBHOOK_DOMAIN = process.env.WEBHOOK_DOMAIN // 'your-domain.com'
const WEBHOOK_PATH = process.env.WEBHOOK_PATH || '/webhook'
const USE_WEBHOOKS = process.env.USE_WEBHOOKS === 'true'

if (USE_WEBHOOKS && WEBHOOK_DOMAIN) {
  const webhookUrl = `https://${WEBHOOK_DOMAIN}${WEBHOOK_PATH}`
  await bot.telegram.setWebhook(webhookUrl, {
    allowed_updates: ['message', 'callback_query', 'pre_checkout_query', 'successful_payment'],
    secret_token: process.env.WEBHOOK_SECRET
  })
  console.log(`✅ Webhook установлен: ${webhookUrl}`)
} else {
  await bot.telegram.deleteWebhook()
  bot.launch()
  console.log(`✅ Polling mode активирован`)
}
```

### Шаг 4: Добавить в Infisical

```bash
# Production environment
USE_WEBHOOKS=true
WEBHOOK_DOMAIN=your-domain.com
WEBHOOK_PATH=/webhook
WEBHOOK_SECRET=your-random-secret-token-here
```

---

## ✅ Итог

### Что работает сейчас:
- ✅ Polling mode для всех окружений
- ✅ Информативные логи о вебхуках
- ✅ Автоматическая проверка портов
- ✅ Детальная информация о состоянии вебхуков
- ✅ Webhook mode для AI сервисов (BFL)

### Что можно улучшить:
- ⚠️ Настроить Nginx reverse proxy на порт 80/443
- ⚠️ Получить SSL сертификат
- ⚠️ Переключить на webhook mode в production

### Критичность:
- **Не критично**: Polling работает стабильно
- **Рекомендуется**: Webhook mode более эффективен для высоких нагрузок
- **Приоритет**: Средний (можно отложить до масштабирования)

---

**Дата**: 2025-11-09
**Автор**: Claude Code
**Версия**: 1.0
