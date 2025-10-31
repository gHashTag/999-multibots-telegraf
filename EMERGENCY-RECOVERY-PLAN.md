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
- **Self-signed** сертификат создаётся автоматически при деплое
- **Расположение:** `/root/nginx-config/three-head-dragon.shop.crt` и `.key`
- **Альтернатива:** Можно заменить на Let's Encrypt сертификат

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

### Шаг 4: Если callback не работает
```bash
# Восстановление nginx с HTTPS
ssh -i ~/.ssh/zomro root@212.86.115.30 "
  # Убеждаемся что network есть
  docker network create app-network 2>/dev/null || true

  # Подключаем 999-multibots к network
  docker network connect app-network 999-multibots 2>/dev/null || true

  # Перезапускаем nginx
  docker stop bot-proxy 2>/dev/null || true
  docker rm bot-proxy 2>/dev/null || true

  # Создаем SSL сертификат
  mkdir -p /root/nginx-config
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /root/nginx-config/three-head-dragon.shop.key \
    -out /root/nginx-config/three-head-dragon.shop.crt \
    -subj '/C=RU/ST=Moscow/L=Moscow/O=999-agents/CN=three-head-dragon.shop' 2>/dev/null || true

  # Создаем nginx HTTPS config
  cat > /root/nginx-config/default.conf << 'EOF'
server {
    listen 80;
    server_name three-head-dragon.shop;
    return 301 https://\$server_name\$request_uri;
}
server {
    listen 443 ssl http2;
    server_name three-head-dragon.shop;
    ssl_certificate /etc/nginx/ssl/three-head-dragon.shop.crt;
    ssl_certificate_key /etc/nginx/ssl/three-head-dragon.shop.key;
    location /api/ {
        proxy_pass http://999-multibots:3000/api/;
        proxy_set_header X-Forwarded-Proto https;
    }
    location /health {
        proxy_pass http://999-multibots:3000/health;
    }
}
EOF

  # Запускаем nginx с HTTPS
  docker run -d \
    --name bot-proxy \
    --network app-network \
    -p 80:80 \
    -p 443:443 \
    -v /root/nginx-config:/etc/nginx/conf.d:ro \
    -v /root/nginx-config:/etc/nginx/ssl:ro \
    nginx:alpine
"
```

---

## 📦 СНАПШОТЫ ДЛЯ ОТКАТА

### Список доступных снапшотов:
```bash
# На сервере
ls -lh /root/docker-snapshot-*.tar.gz
```

### Откат к снапшоту:
```bash
./rollback.sh prod-stable-20251031_153330
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

### Callback не работает:
```bash
# Проверка endpoint
curl http://three-head-dragon.shop/api/telegram/ai-reels-callback

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
| `./rollback.sh <snapshot>` | Откат |
| `curl -k https://three-head-dragon.shop/api/telegram/ai-reels-callback` | Проверка HTTPS callback |
| `curl http://three-head-dragon.shop/api/telegram/ai-reels-callback` | HTTP (редирект на HTTPS) |

---

## 📞 КОНТАКТЫ

- **Сервер:** 212.86.115.30
- **SSH:** ssh -i ~/.ssh/zomro root@212.86.115.30
- **Домен:** three-head-dragon.shop
- **Callback URL:** https://three-head-dragon.shop/api/telegram/ai-reels-callback

---

## ⚠️ ВАЖНЫЕ ЗАМЕТКИ

1. **Nginx должен быть в сети app-network** - иначе не видит 999-multibots
2. **999-multibots должен быть подключен к app-network** - иначе nginx не достучится
3. **Всегда проверяйте callback после деплоя** - это критически важно
4. **Создавайте снапшоты перед изменениями** - для быстрого отката
5. ** deploy.sh автоматически настраивает nginx** - используйте его!

---

**🎉 Система готова к работе! Все команды автоматизированы!**
