# 🤖 ПРАВИЛА АРХИТЕКТУРЫ: КОД И КОНФИГУРАЦИЯ

**Дата:** 2025-11-04  
**Статус:** ✅ АКТИВНЫЕ ПРАВИЛА

---

## 🏗️ ТЕКУЩАЯ АРХИТЕКТУРА

### 📍 Production Server (212.86.115.30)
```bash
ssh root@212.86.115.30
```
- **10 ботов** в production режиме
- **Endpoint:** `/api/telegram/ai-reels-callback`
- **Домен:** `https://three-head-dragon.shop`
- **SSL:** Let's Encrypt (автообновление)
- **Docker:** `--network host` (ОБЯЗАТЕЛЬНО!)
- **Nginx:** reverse proxy на `127.0.0.1:3000`

### 📍 Development Server (45.66.11.152)
```bash
ssh root@45.66.11.152
```
- **2 бота** в development режиме
- **Домен:** `https://three-head-dev.shop`
- **SSL:** Let's Encrypt
- **Docker:** --network host
- **Безопасно для тестов**

---

## 🚨 КРИТИЧЕСКИЕ ПРАВИЛА

### ❌ НЕ КОММИТИТЬ:
1. **.env** - содержит ВСЕ токены ботов
2. **.env.local** - содержит токены для тестирования
3. **SSL ключи** - `/etc/letsencrypt/`
4. **Любые секреты** - API keys, токены, пароли

### ✅ ВСЕГДА ИСПОЛЬЗОВАТЬ:
1. **--network host** для Docker контейнеров
2. **Проксирование на 127.0.0.1:3000** в nginx
3. **Port mapping:** -p 3000:3000 -p 2999-3010:2999-3010
4. **Health check:** `curl http://localhost:3000/health`

---

## 🔧 DOCKER КОМАНДЫ

### Запуск Production:
```bash
# Пересборка образа
docker build --no-cache -t 999-agents-telegraf:latest .

# Запуск с host network
docker run -d \
  --name 999-multibots \
  --restart unless-stopped \
  --network host \
  -v /root/999-agents-telegraf/.env:/app/.env:ro \
  999-agents-telegraf:latest

# Nginx с host network
docker run -d \
  --name bot-proxy \
  --restart unless-stopped \
  --network host \
  -v /root/nginx-config:/etc/nginx/conf.d:ro \
  nginx:alpine
```

### Проверка:
```bash
# Статус контейнеров
docker ps

# Логи
docker logs 999-multibots -f

# Проверка endpoint
curl http://localhost/api/telegram/ai-reels-callback
curl http://localhost:3000/health
```

---

## 🌐 NGINX КОНФИГУРАЦИЯ

### Файл: `/root/nginx-config/default.conf`
```nginx
server {
    listen 80 default_server;
    server_name three-head-dragon.shop;
    
    location = /api/telegram/ai-reels-callback {
        proxy_pass http://127.0.0.1:3000/api/telegram/ai-reels-callback;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_buffering off;
        proxy_request_buffering off;
    }
    
    location /health {
        proxy_pass http://127.0.0.1:3000/health;
    }
}
```

---

## 📝 ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ

### Production (.env):
```bash
# Боты (10 штук)
BOT_TOKEN_1=...
BOT_TOKEN_2=...
...
BOT_TOKEN_10=...

# API
TELEGRAM_BOT_TOKEN_AI_STARS=...
OPENAI_API_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

# Настройки
NODE_ENV=production
DEV_SIMULATE_SUBSCRIPTION=false
```

### Development (.env.local):
```bash
# Только 2 бота
DEV_BOT_TOKEN_0=6389824290:AAG3qm-tK2vBM5yaqvSRe4Kuf8Xk-g-MwyE
DEV_BOT_TOKEN_1=6831432194:AAEQa4F9m8p5fglLUJMNaj96wIqC13GpZlw
NODE_ENV=development
```

---

## 🔍 ДИАГНОСТИКА

### Если бот не отвечает:
```bash
# 1. Проверить контейнер
docker ps | grep 999-multibots

# 2. Проверить логи
docker logs 999-multibots | grep -i "bot.*start"

# 3. Проверить порты
ss -tlnp | grep 3000

# 4. Проверить nginx
docker logs bot-proxy
```

### Если endpoint возвращает 502:
```bash
# 1. Проверить что API слушает
curl http://localhost:3000/health

# 2. Проверить nginx конфиг
cat /root/nginx-config/default.conf

# 3. Перезапустить nginx
docker restart bot-proxy
```

---

## 🚀 DEPLOY СКРИПТЫ

### Автоматический деплой:
```bash
# Production
./deploy.sh deploy

# Development
./deploy-development.sh deploy
```

### Ручной деплой:
```bash
# Обновить код
git pull origin production

# Пересобрать
docker build --no-cache -t 999-agents-telegraf:latest .

# Перезапустить
docker stop 999-multibots && docker rm 999-multibots
docker run -d --name 999-multibots --network host -v $(pwd)/.env:/app/.env:ro 999-agents-telegraf:latest
```

---

## ✅ ЧЕКЛИСТ ПРОВЕРКИ

### После деплоя:
- [ ] `docker ps` показывает 2 контейнера (Up)
- [ ] `curl http://localhost:3000/health` возвращает 200
- [ ] `curl http://localhost/api/telegram/ai-reels-callback` возвращает 200
- [ ] `curl https://three-head-dragon.shop/api/telegram/ai-reels-callback` работает
- [ ] Боты отвечают на /start
- [ ] Логи показывают успешный запуск

### Для каждого нового изменения:
1. Проверить .env не коммитится
2. Использовать --network host
3. Проксировать на 127.0.0.1:3000
4. Протестировать endpoint
5. Проверить логи

---

## 🎯 КЛЮЧЕВЫЕ ENDPOINT'Ы

### Production:
- `https://three-head-dragon.shop/api/telegram/ai-reels-callback`
- `https://three-head-dragon.shop/health`

### Development:
- `https://three-head-dev.shop/api/telegram/ai-reels-callback`
- `https://three-head-dev.shop/health`

### Локально:
- `http://localhost:3000/health`
- `http://localhost/api/telegram/ai-reels-callback`

---

## 📚 ФАЙЛЫ КОНФИГУРАЦИИ

### Обязательные:
- `nginx/nginx.conf` - nginx конфигурация
- `src/api_server/index.ts` - API сервер (порт 3000)
- `src/api_server/routes/ai-reels-callback.routes.ts` - webhook handler
- `deploy.sh` - скрипт деплоя
- `.env.example` - шаблон для .env

### Документация:
- `RECOVERY_REPORT.md` - анализ проблемы
- `FINAL_SUCCESS_REPORT.md` - отчет о восстановлении
- `DEPLOYMENT_TO_MAIN_SUCCESS.md` - деплой в main
- `CLAUDE_ARCHITECTURE_RULES.md` - эти правила

---

## 🚨 ЭКСТРЕННЫЕ КОМАНДЫ

### Если все сломалось:
```bash
# Остановить все
docker stop $(docker ps -aq)
docker rm $(docker ps -aq)

# Запустить заново
docker run -d --name 999-multibots --network host \
  -v /root/999-agents-telegraf/.env:/app/.env:ro \
  999-agents-telegraf:latest
```

### Проверка отката:
```bash
# Снапшоты
ls -lh /root/docker-snapshot-*.tar.gz

# Откат к снапшоту
docker load < /root/docker-snapshot-prod-stable-20251104_120000.tar.gz
docker run -d --name 999-multibots --network host \
  -v /root/999-agents-telegraf/.env:/app/.env:ro \
  999-agents-telegraf:latest
```

---

## 🎉 ЗАКЛЮЧЕНИЕ

**Архитектура настроена и работает:**

✅ **Production:** 10 ботов, полная функциональность  
✅ **Development:** 2 бота, безопасное тестирование  
✅ **Docker:** --network host (решает конфликты)  
✅ **Nginx:** reverse proxy на 127.0.0.1:3000  
✅ **SSL:** Let's Encrypt на обоих серверах  
✅ **Webhook:** /api/telegram/ai-reels-callback работает  

**Система готова к production!** 🚀

---

**Автор:** Claude Code  
**Обновлено:** 2025-11-04  
**Версия:** 1.0
