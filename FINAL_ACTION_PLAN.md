# 🎯 ПЛАН ВОССТАНОВЛЕНИЯ: /api/telegram/ai-reels-callback

**Дата:** 2025-11-04  
**Статус:** 🔴 КРИТИЧЕСКИЙ  
**Endpoint:** `https://three-head-dragon.shop/api/telegram/ai-reels-callback`

---

## 📊 РЕЗУЛЬТАТЫ АНАЛИЗА (3 ДНЯ)

### ✅ НАЙДЕННАЯ ИНФОРМАЦИЯ:

1. **История изменений:**
   - 2025-11-01: Исправлены ID сцен, проблемы с handleMenu
   - 2025-11-02: Критический 502 Bad Gateway исправлен очисткой 43GB мусора
   - 2025-11-04: Контейнеры остановлены, требуется перезапуск

2. **Анализ кода:**
   - ✅ nginx/nginx.conf - КОРРЕКТЕН
   - ✅ src/api_server/index.ts - порт 3000 настроен
   - ✅ src/inngest_app/functions/ai-reels-callback.ts - Inngest функция готова
   - ✅ src/api_server/routes/ai-reels-callback.routes.ts - Express routes работают
   - ✅ deploy.sh - правильно пробрасывает порт 3000

3. **Проблема:**
   - 🔴 Продакшен сервер 212.86.115.30: контейнеры остановлены
   - 🔴 API на порту 3000 недоступен
   - 🔴 Webhook endpoint не отвечает

---

## ⚡ НЕМЕДЛЕННЫЕ ДЕЙСТВИЯ

### Способ 1: Автоматическое восстановление
```bash
# Запуск скрипта экстренного восстановления
./emergency-restore.sh
```

### Способ 2: Ручное восстановление
```bash
# SSH на сервер
ssh root@212.86.115.30

# Обновление кода
cd /root/999-agents-telegraf
git pull origin production

# Пересборка Docker образа
docker build --no-cache -t 999-agents-telegraf:latest .

# Остановка старых контейнеров
docker stop 999-multibots 2>/dev/null || true
docker rm 999-multibots 2>/dev/null || true

# Запуск нового контейнера
docker run -d \
  --name 999-multibots \
  --restart unless-stopped \
  -p 3000:3000 \
  -p 2999-3010:2999-3010 \
  -p 4000:4000 \
  -v /root/999-agents-telegraf/.env:/app/.env:ro \
  999-agents-telegraf:latest

# Запуск nginx (если нужно)
docker run -d \
  --name bot-proxy \
  --restart unless-stopped \
  --network host \
  -v /root/nginx-config:/etc/nginx/conf.d:ro \
  nginx:alpine

# Проверка
curl http://localhost:3000/health
curl http://localhost/api/telegram/ai-reels-callback
```

---

## 🧪 ТЕСТИРОВАНИЕ

После восстановления проверить:

1. **Health Check:**
```bash
curl http://212.86.115.30:3000/health
```
**Ожидаемый ответ:**
```json
{"status":"UP","source":"health.routes","timestamp":"..."}
```

2. **Webhook GET:**
```bash
curl http://212.86.115.30/api/telegram/ai-reels-callback
```
**Ожидаемый ответ:**
```json
{"status":"ok","service":"ai-reels-callback","timestamp":"..."}
```

3. **Webhook POST:**
```bash
curl -X POST http://212.86.115.30/api/telegram/ai-reels-callback \
  -H "Content-Type: application/json" \
  -d '{"status":"completed","download_url":"https://example.com/video.mp4","job_id":"telegram-123456789-1234567890"}'
```
**Ожидаемый ответ:**
```json
{"message":"AI Reels callback received and will be processed asynchronously","timestamp":"..."}
```

4. **Логи:**
```bash
docker logs 999-multibots | grep -E "callback|AI REELS"
```
**Ожидаемый вывод:**
```
🔔 [AI REELS CALLBACK] Webhook received
🎬 [AI REELS CALLBACK] Received callback from Railway
✅ [AI REELS CALLBACK] Processed successfully
```

---

## 🔐 КОНФИГУРАЦИЯ СИСТЕМЫ

### Архитектура:
```
┌─────────────────────────────────────────┐
│   NGINX Reverse Proxy (bot-proxy)      │
│   three-head-dragon.shop               │
│   Порт: 80, 443                        │
└──────────────┬──────────────────────────┘
               │
               ├─ /api/telegram/ai-reels-callback
               │   → http://999-multibots:3000/...
               │
               ├─ /api/
               │   → http://999-multibots:3000/api/
               │
               └─ /health
                   → http://999-multibots:3000/health

┌─────────────────────────────────────────┐
│   Docker Container: 999-multibots      │
│   Порт: 3000, 2999-3010, 4000          │
│                                         │
│   ┌─────────────────────────────────┐  │
│   │   Express API Server            │  │
│   │   Port: 3000                    │  │
│   │   - ai-reels-callback.routes    │  │
│   │   - Inngest Functions           │  │
│   └─────────────────────────────────┘  │
│                                         │
│   ┌─────────────────────────────────┐  │
│   │   Telegram Bot Farm             │  │
│   │   Ports: 2999-3010              │  │
│   └─────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### Критические порты:
- **3000** - API сервер (ОБЯЗАТЕЛЬНО!)
- **2999-3010** - Telegram боты
- **4000** - Дополнительный сервис

---

## 📝 ДОКУМЕНТАЦИЯ

Созданные файлы:
1. **RECOVERY_REPORT.md** - Детальный анализ проблемы
2. **emergency-restore.sh** - Скрипт автоматического восстановления
3. **FINAL_ACTION_PLAN.md** - План действий (этот файл)

---

## ✅ КРИТЕРИИ УСПЕХА

Система восстановлена, если:
- [ ] Контейнеры запущены и работают
- [ ] API отвечает на http://212.86.115.30:3000/health
- [ ] Webhook отвечает на GET запросы
- [ ] Webhook принимает POST запросы
- [ ] Логи показывают успешную обработку callbacks
- [ ] Railway render-server может доставлять callbacks

---

## 🚨 ЭКСТРЕННЫЕ КОНТАКТЫ

**Продакшен сервер:** 212.86.115.30  
**Путь к проекту:** /root/999-agents-telegraf  
**Контейнеры:** 999-multibots, bot-proxy

---

## 📚 УРОКИ

1. **Проблема НЕ в коде** - все файлы конфигурации корректны
2. **Проблема в инфраструктуре** - контейнеры остановлены
3. **Решение простое** - перезапуск через deploy.sh или emergency-restore.sh
4. **Важность мониторинга** - нужно следить за состоянием контейнеров

---

**Автор:** Claude Code  
**Создано:** 2025-11-04 11:00 UTC  
**Статус:** ⚠️ ТРЕБУЕТСЯ ДЕЙСТВИЕ
