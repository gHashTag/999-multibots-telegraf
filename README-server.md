# Инструкция по развертыванию на сервере

## Требования

- Docker и Docker Compose
- Git
- Доступ к серверу по SSH

## Шаги установки и запуска

### 1. Клонирование репозитория

```bash
ssh -i ~/.ssh/id_rsa root@999-multibots-u14194.vm.elestio.app
cd /opt/app
git clone <url-репозитория> 999-multibots-telegraf
cd 999-multibots-telegraf
```

### 2. Настройка переменных окружения

Создайте файл `.env` в корне проекта:

```bash
cp .env.example .env
nano .env
```

И заполните следующие обязательные переменные:

```
# TELEGRAM BOTS
BOT_TOKEN_1=ваш_токен_бота_1
BOT_TOKEN_2=ваш_токен_бота_2
BOT_TOKEN_3=ваш_токен_бота_3
BOT_TOKEN_4=ваш_токен_бота_4
BOT_TOKEN_5=ваш_токен_бота_5
BOT_TOKEN_6=ваш_токен_бота_6
BOT_TOKEN_7=ваш_токен_бота_7

# SUPABASE
SUPABASE_URL=ваш_url_supabase
SUPABASE_SERVICE_KEY=ваш_service_key
SUPABASE_SERVICE_ROLE_KEY=ваш_service_role_key
SUPABASE_SERVICE_KEY=ваш_api_key

# INNGEST
INNGEST_EVENT_KEY=ваш_event_key
INNGEST_SIGNING_KEY=ваш_signing_key
INNGEST_URL=http://localhost:2999
INNGEST_BASE_URL=http://localhost:2999

# ДРУГИЕ API КЛЮЧИ
OPENAI_API_KEY=ваш_api_key
ELEVENLABS_API_KEY=ваш_api_key
REPLICATE_API_TOKEN=ваш_api_token

# ДРУГИЕ НАСТРОЙКИ
ADMIN_IDS=список_id_админов
NODE_ENV=production
SECRET_KEY=ваш_секретный_ключ
ORIGIN=http://localhost:2999
LOG_FORMAT=combined
```

### 3. Создание необходимых директорий

```bash
mkdir -p logs nginx/conf.d nginx/ssl data/certbot/conf data/certbot/www
```

### 4. Настройка Nginx

Создайте файл конфигурации Nginx:

```bash
cat > nginx/nginx.conf << 'EOF'
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;
    sendfile on;
    keepalive_timeout 65;

    include /etc/nginx/conf.d/*.conf;
}
EOF
```

Создайте конфигурацию для HTTP (без SSL):

```bash
cat > nginx/conf.d/default.conf << 'EOF'
server {
    listen 80;
    server_name _;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location /api/ {
        proxy_pass http://app:2999;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location / {
        proxy_pass http://app:3008;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF
```

### 5. Настройка Docker Compose

Обновите файл `docker-compose.yml`:

```bash
cat > docker-compose.yml << 'EOF'
services:
  app:
    container_name: neuro-blogger-telegram-bot
    build:
      context: ./
      dockerfile: Dockerfile
    restart: unless-stopped
    ports:
      - '2999:2999'
      - '3008:3008'
    env_file:
      - .env
    volumes:
      - ./logs:/app/logs

  nginx:
    image: nginx:stable-alpine
    container_name: neuro-blogger-nginx
    restart: unless-stopped
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - ./data/certbot/conf:/etc/letsencrypt:ro
      - ./data/certbot/www:/var/www/certbot:ro
    depends_on:
      - app
EOF
```

### 6. Запуск приложения

```bash
docker-compose up -d --build
```

### 7. Проверка логов и статуса

```bash
# Проверка статуса контейнеров
docker ps

# Проверка логов приложения
docker logs neuro-blogger-telegram-bot

# Проверка логов Nginx
docker logs neuro-blogger-nginx
```

### 8. Остановка и перезапуск

```bash
# Остановка контейнеров
docker-compose down

# Запуск контейнеров
docker-compose up -d
```

### 9. Обновление приложения

```bash
# Переход в директорию проекта
cd /opt/app/999-multibots-telegraf

# Получение последних изменений
git pull

# Перезапуск контейнеров с новой версией
docker-compose down
docker-compose up -d --build
```

## Дополнительно: настройка SSL с Let's Encrypt

После того, как приложение заработает, можно настроить SSL:

1. Обновите конфигурацию Nginx, добавив домен вместо `server_name _;`
2. Запустите certbot для получения сертификатов:

```bash
docker-compose run --rm certbot certonly --webroot -w /var/www/certbot -d ваш-домен.com
```

3. Обновите конфигурацию Nginx для использования SSL:

```bash
cat > nginx/conf.d/default.conf << 'EOF'
server {
    listen 80;
    server_name ваш-домен.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name ваш-домен.com;

    ssl_certificate /etc/letsencrypt/live/ваш-домен.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ваш-домен.com/privkey.pem;
    
    # SSL конфигурация
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-SHA384;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;
    ssl_session_tickets off;

    # PROXY конфигурация
    location /api/ {
        proxy_pass http://app:2999;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location / {
        proxy_pass http://app:3008;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF
```

4. Перезапустите Nginx:

```bash
docker-compose restart nginx
```

## Решение проблем

1. **Проблема с переменными окружения**: Если боты не запускаются из-за отсутствия переменных окружения, проверьте файл `.env` и убедитесь, что все необходимые переменные установлены.

2. **Проблема с доступом к файлам**: Убедитесь, что у контейнеров есть права на чтение и запись в нужных директориях.

3. **Проблема с Nginx**: Проверьте логи Nginx и убедитесь, что конфигурация корректна.

4. **Проблема с сертификатами**: Если используется SSL, убедитесь, что сертификаты существуют и доступны. 