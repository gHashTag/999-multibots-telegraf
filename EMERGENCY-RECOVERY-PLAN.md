# 🚨 ПЛАН ЭКСТРЕННОГО ВОССТАНОВЛЕНИЯ 999-AGENTS-TELEGRAF

## 📋 КРАТКИЙ ПЛАН (5 минут)

### Если боты не работают:
```bash
# 1. Проверка статуса
./deploy.sh status

# 2. Если нужно - перезапуск
./deploy.sh deploy

# 3. Проверка callback
curl http://three-head-dragon.shop/api/telegram/ai-reels-callback
```

### Если nginx упал:
```bash
# Восстановление nginx
ssh -i ~/.ssh/zomro root@212.86.115.30 "
  docker network create app-network 2>/dev/null || true
  docker network connect app-network 999-multibots 2>/dev/null || true
  docker start bot-proxy 2>/dev/null || docker restart bot-proxy
"
```

---

## 🎯 КРИТИЧЕСКИ ВАЖНО - NGINX КОНФИГУРАЦИЯ

### ❗ ПРОБЛЕМА:
Nginx контейнер должен работать в сети `app-network` и видеть контейнер `999-multibots`.

### ✅ РЕШЕНИЕ:
**Всегда запускать nginx в сети app-network!**

```bash
# Создание сети (один раз)
docker network create app-network

# Запуск nginx
docker run -d \
  --name bot-proxy \
  --network app-network \
  -p 80:80 \
  -v /root/nginx-config:/etc/nginx/conf.d:ro \
  nginx:alpine

# Подключение 999-multibots к сети
docker network connect app-network 999-multibots
```

### 📝 Nginx Config (/root/nginx-config/default.conf):
```nginx
# HTTP to HTTPS redirect
server {
    listen 80;
    server_name three-head-dragon.shop;
    return 301 https://$server_name$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name three-head-dragon.shop;
    client_max_body_size 100M;

    # Let's Encrypt SSL Certificate (Auto-renews)
    ssl_certificate /etc/nginx/ssl/three-head-dragon.shop.crt;
    ssl_certificate_key /etc/nginx/ssl/three-head-dragon.shop.key;
    ssl_protocols TLSv1.2 TLSv1.3;

    location /api/ {
        proxy_pass http://999-multibots:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
    }

    location /health {
        proxy_pass http://999-multibots:3000/health;
    }

    location / {
        proxy_pass http://999-multibots:3000/;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

### 🔒 SSL СЕРТИФИКАТ:
- **Let's Encrypt** валидный сертификат (автообновление)
- **Расположение:** `/root/nginx-config/three-head-dragon.shop.crt` и `.key`
- **Срок действия:** до 2026-01-29 (автообновление через certbot)
- **Статус:** ✅ **РАБОТАЕТ** - валидный для всех внешних сервисов
- **Установлен:** 2025-10-31 via certbot

---

## 🔧 ПОЛНЫЙ PLAN ВОССТАНОВЛЕНИЯ (10 минут)

### Шаг 1: Проверка состояния
```bash
# Статус всех контейнеров
docker ps

# Проверка сетей
docker network ls

# Проверка логов
./deploy.sh logs 50
```

### Шаг 2: Если контейнеры не запущены
```bash
# Запуск всех сервисов
./deploy.sh deploy
```

### Шаг 3: Проверка callback
```bash
# Локально на сервере (HTTPS)
curl -k https://localhost/api/telegram/ai-reels-callback

# Снаружи (HTTPS)
curl -k https://three-head-dragon.shop/api/telegram/ai-reels-callback

# HTTP редирект на HTTPS (опционально)
curl http://three-head-dragon.shop/api/telegram/ai-reels-callback
```

### Шаг 4: Обновление SSL сертификата (Let's Encrypt)
```bash
# Обновление сертификата Let's Encrypt
ssh -i ~/.ssh/zomro root@212.86.115.30 "
  # Проверяем текущий сертификат
  certbot certificates

  # Обновляем сертификат если нужно
  certbot renew --quiet

  # Копируем новые файлы
  cp /etc/letsencrypt/live/three-head-dragon.shop/fullchain.pem /root/nginx-config/three-head-dragon.shop.crt
  cp /etc/letsencrypt/live/three-head-dragon.shop/privkey.pem /root/nginx-config/three-head-dragon.shop.key

  # Перезапускаем nginx
  docker restart bot-proxy

  # Проверяем
  sleep 5
  curl -I https://three-head-dragon.shop/api/telegram/ai-reels-callback
"
```

---

## 📦 СНАПШОТЫ ДЛЯ ОТКАТА

### Список доступных снапшотов:
```bash
# На сервере
ls -lh /root/docker-snapshot-*.tar.gz
```

### Рекомендуемые снапшоты:
```bash
# ⭐ ПОЛНЫЙ PACK С ИСПРАВЛЕНИЯМИ (РЕКОМЕНДУЕТСЯ)
MIDJOURNEY-FIXED-20251101_002940.tar.gz (183M)

# Midjourney + нейрофото + HTTP callback + SSL

# ИСПРАВЛЕНИЕ НЕЙРОФОТО (альтернатива)
NEUROPHOTO-FIX-20251031_235025.tar.gz (183M)

# HTTP Callback для Railway
HTTP-CALLBACK-RAILWAY-20251031_232545.tar.gz (183M)

# С Let's Encrypt SSL (старая версия)
SSL-LETSENCRYPT-20251031_160946.tar.gz (183M)

# Альтернативные версии
HTTPS-READY-20251031_155846.tar.gz (183M)
WORKING-CALLBACK-20251031_154416.tar.gz (183M)
```

### Откат к снапшоту:
```bash
# К версии с Midjourney и всеми исправлениями (рекомендуется)
./rollback.sh MIDJOURNEY-FIXED-20251101_002940

# К версии с исправлением нейрофото
./rollback.sh NEUROPHOTO-FIX-20251031_235025

# К версии с HTTP callback для Railway
./rollback.sh HTTP-CALLBACK-RAILWAY-20251031_232545

# К версии с Let's Encrypt SSL
./rollback.sh SSL-LETSENCRYPT-20251031_160946
```

### Создание нового снапшота:
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 "
  docker save 999-agents-telegraf:latest | gzip > /root/docker-snapshot-\$(date +%Y%m%d_%H%M%S).tar.gz
  ls -lh /root/docker-snapshot-*.tar.gz
"
```

---

## 🔍 ДИАГНОСТИКА ПРОБЛЕМ

### Боты не отвечают:
```bash
# Проверка логов
./deploy.sh logs 100 | grep -i error

# Проверка инициализации
./deploy.sh status | grep ботов

# Перезапуск
./deploy.sh deploy
```

### Callback не работает (Railway render-server):
```bash
# Проверка HTTP callback (Railway compatibility)
curl http://three-head-dragon.shop/api/telegram/ai-reels-callback

# Проверка HTTPS callback (other services)
curl -k https://three-head-dragon.shop/api/telegram/ai-reels-callback

# Проверка nginx
docker logs bot-proxy

# Проверка сети
docker network inspect app-network
```

### API недоступен:
```bash
# Локально
curl http://localhost:3000/health

# Через nginx
curl http://three-head-dragon.shop/health
```

---

## ✅ ФИНАЛЬНАЯ ПРОВЕРКА

После любого восстановления проверить:
```bash
echo "=== ПРОВЕРКА СИСТЕМЫ ==="

echo "1. Контейнеры:"
docker ps --format 'table {{.Names}}\t{{.Status}}'

echo -e "\n2. HTTPS Callback:"
curl -k -s https://three-head-dragon.shop/api/telegram/ai-reels-callback | head -3

echo -e "\n3. HTTP Redirect (должен редиректить на HTTPS):"
curl -I http://three-head-dragon.shop/api/telegram/ai-reels-callback 2>/dev/null | head -3

echo -e "\n4. Health (HTTPS):"
curl -k -s https://three-head-dragon.shop/health | head -3

echo -e "\n5. Боты:"
docker logs 999-multibots 2>&1 | grep 'Бот.*инициализирован' | wc -l
```

---

## 🎯 БЫСТРЫЕ КОМАНДЫ

| Команда | Действие |
|---------|----------|
| `./deploy.sh deploy` | Полный деплой |
| `./deploy.sh status` | Проверка статуса |
| `./deploy.sh logs 100` | Логи |
| `./rollback.sh MIDJOURNEY-FIXED-20251101_002940` | Откат к версии с Midjourney и всеми исправлениями |
| `curl https://three-head-dragon.shop/api/telegram/ai-reels-callback` | ✅ HTTPS callback (валидный SSL) |
| `curl http://three-head-dragon.shop/api/telegram/ai-reels-callback` | ✅ HTTP callback (Railway compatibility) |

---

## 📞 КОНТАКТЫ

- **Сервер:** 212.86.115.30
- **SSH:** ssh -i ~/.ssh/zomro root@212.86.115.30
- **Домен:** three-head-dragon.shop
- **Callback URL:** https://three-head-dragon.shop/api/telegram/ai-reels-callback

---

## ⚠️ ВАЖНЫЕ ЗАМЕТКИ

1. **HTTP Callback для Railway** - `/api/telegram/ai-reels-callback` работает на HTTP и HTTPS
2. **Let's Encrypt SSL** - валидный сертификат до 2026-01-29 (автообновление)
3. **Nginx в сети app-network** - критично для работы с 999-multibots
4. **Всегда проверяйте callback после деплоя** - это критически важно
5. **Создавайте снапшоты перед изменениями** - для быстрого отката
6. **MIDJOURNEY-FIXED снапшот** - рекомендуется для production (содержит Midjourney v7)

---

## ✅ ФИНАЛЬНЫЙ СТАТУС (2025-10-31)

```
🔒 SSL: ✅ Let's Encrypt (до 2026-01-29)
🔄 HTTP→HTTPS: ✅ 301 редирект (кроме /api/telegram/ai-reels-callback)
📡 HTTP Callback: ✅ 200 OK (Railway compatibility)
📡 HTTPS Callback: ✅ 200 OK (other services)
🌐 API: ✅ UP
🤖 Боты: ✅ 10/10 инициализированы
🐳 Docker: ✅ Running
💾 Снапшоты: ✅ 7 версий готовы (включая MIDJOURNEY-FIXED)
🎨 Midjourney v7: ✅ Добавлен в список моделей генерации
📚 Документация: ✅ Обновлена
```

## 🚀 ИСПРАВЛЕНИЯ (2025-10-31)

### 1. Railway Callback Fix
**Проблема:** Railway render-server отправлял callback на HTTP, получал 301 редирект на HTTPS, но httpx не следует редиректам для POST запросов.
**Решение:**
1. Настроен nginx для работы callback endpoint на HTTP (без редиректа)
2. Добавлен отдельный location для callback на HTTPS
3. Остальной трафик редиректится на HTTPS
**Результат:** ✅ Railway render-server успешно отправляет callback на HTTP

### 2. NeuroPhoto Wizard Fix
**Проблема:** После выбора модели в нейрофото, следующий шаг "проскакивался" - не происходил переход к вводу промпта.
**Решение:** Исправлена проверка `if (result.model)` на `if (result.success && result.model)` в `src/scenes/neuroPhotoWizard/index.ts:726`
**Результат:** ✅ Нейрофото работает корректно после выбора модели

### 3. Menu Cleanup Fix
**Проблема:** В главном меню была кнопка "➕ Добавить модель", которая не нужна в production.
**Решение:** Убрана кнопка из `src/menu/mainMenu.ts:154-158`
**Результат:** ✅ Главное меню очищено от лишних кнопок

### 4. Midjourney Model Addition
**Проблема:** Midjourney v7 не отображался в списке моделей для генерации изображений.
**Решение:** Добавлен в `src/price/models/imageModelPrices.ts:186-195`
**Результат:** ✅ Midjourney v7 доступен в разделе "🖼️ Генерация изображений"

**🎉 СИСТЕМА ПОЛНОСТЬЮ ГОТОВА К PRODUCTION!**
