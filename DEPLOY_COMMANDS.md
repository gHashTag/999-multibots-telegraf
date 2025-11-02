# 🚀 Команды для деплоя в production

## 1. Остановка текущих контейнеров
```bash
docker-compose down
```

## 2. Пересборка Docker образа без кэша
```bash
docker-compose build --no-cache
```

## 3. Запуск контейнеров
```bash
docker-compose up -d
```

## 4. Проверка статуса
```bash
docker-compose ps
docker-compose logs app
```

## 5. Проверка healthcheck
```bash
curl http://localhost:2999/health
```

## Альтернативный способ (если используется Docker directly):
```bash
# Сборка без кэша
docker build --no-cache -t neuro-blogger-telegram-bot .

# Остановка старого контейнера
docker stop 999-multibots 2>/dev/null || true
docker rm 999-multibots 2>/dev/null || true

# Запуск нового контейнера
docker run -d \
  --name 999-multibots \
  --restart unless-stopped \
  --network app-network \
  -p 2999:2999 \
  -p 3000:3000 \
  -p 3001:3001 \
  -p 3002:3002 \
  -p 3003:3003 \
  -p 3004:3004 \
  -p 3005:3005 \
  -p 3006:3006 \
  -p 3007:3007 \
  -p 3008:3008 \
  -p 3009:3009 \
  -p 3010:3010 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /etc/nginx:/etc/nginx \
  -v /etc/pki:/etc/pki \
  -v files-volume:/etc/nginx/html/files \
  --env-file .env \
  neuro-blogger-telegram-bot
```

## Проверка тега:
```bash
git tag -l | grep fix-buttons-27-27-working
git log --oneline --decorate | head -5
```
