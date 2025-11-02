# Dev Environment Setup (CICD Branch)

## Обзор

Создано новое Dev-окружение для работы с веткой CICD, которая работает без тестов Jest.

## Структура окружений

| Окружение | Сервер | Ветка | Назначение |
|-----------|--------|-------|------------|
| **Production** | `${WEBHOOK_DOMAIN}` | `Jest-Test` | Продакшн с полными тестами |
| **Development** | `localhost` | `cicd` | Dev без тестов |

## Ключевые файлы

### 1. Конфигурация Docker

```bash
# Dev-окружение
deployment/docker/docker-compose.dev.yml
```

**Особенности:**
- Контейнер: `999-multibots-dev`
- Сеть: `172.28.0.0/16` (отличается от продакшна)
- Переменные с суффиксом `_DEV`

### 2. Ansible Inventory

```bash
# Dev сервер
deployment/ansible/inventory-dev
```

### 3. SSH и Deploy скрипты

```bash
# SSH подключение
scripts/deployment/ssh-dev-connect.sh

# Деплой dev окружения
scripts/deployment/deploy-dev-cicd.sh
```

### 4. Environment файл

```bash
# Пример переменных для dev
.env.dev.example
```

## Быстрый старт

### 1. SSH подключение к dev серверу

```bash
# Подключение к dev серверу
./scripts/deployment/ssh-dev-connect.sh

# Или напрямую (пример)
# ssh -i ~/.ssh/id_rsa root@your-dev-host
```

### 2. Деплой CICD ветки на dev

```bash
# Автоматический деплой
./scripts/deployment/deploy-dev-cicd.sh
```

### 3. Ручной деплой (если нужен)

```bash
# На dev сервере
cd /opt/bot-farm
git checkout cicd
git pull origin cicd
docker-compose -f deployment/docker/docker-compose.dev.yml up -d --build
```

## Настройка переменных окружения

1. **Скопируйте пример:**
   ```bash
   cp .env.dev.example .env.dev
   ```

2. **Заполните dev-переменные:**
   - `BOT_TOKEN_*_DEV` - токены dev ботов
   - `SUPABASE_*_DEV` - dev база данных
   - `INNGEST_*_DEV` - dev Inngest
   - `SECRET_KEY_DEV` - dev платежи

## Различия веток

### Jest-Test (Продакшн)
- ✅ Полная тестовая инфраструктура
- ✅ Jest тесты
- ✅ Все функции тестирования

### CICD (Dev)
- ❌ Тесты удалены (-3564 строки)
- ✅ Основной функционал
- ✅ Быстрая сборка

## Мониторинг

### Проверка статуса dev окружения

```bash
# На dev сервере
docker-compose -f deployment/docker/docker-compose.dev.yml ps
docker-compose -f deployment/docker/docker-compose.dev.yml logs -f
```

### URLs

- **Dev:** http://localhost:2999
- **Prod:** ${WEBHOOK_DOMAIN}

## Troubleshooting

### Проблемы с SSH

```bash
# Проверить SSH ключ
ls -la ~/.ssh/id_rsa

# Проверить подключение (пример)
# ssh -i ~/.ssh/id_rsa root@your-dev-host "echo 'OK'"
```

### Проблемы с Docker

```bash
# Перезапуск dev окружения
docker-compose -f deployment/docker/docker-compose.dev.yml down
docker-compose -f deployment/docker/docker-compose.dev.yml up -d --build
```

### Логи

```bash
# Логи приложения
docker logs 999-multibots-dev

# Логи nginx
docker logs bot-proxy-dev
```

## Workflow

1. **Разработка** → CICD ветка (dev сервер)
2. **Тестирование** → Jest-Test ветка (prod сервер)
3. **Релиз** → Merge в main

Это позволяет разрабатывать без тестов на dev, а тестировать с полным покрытием на prod.