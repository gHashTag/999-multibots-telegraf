# 🚀 Production Deployment Guide

**Последнее обновление**: 2025-10-16
**Статус**: ✅ Полностью автоматизировано

## 📋 Содержание

- [Быстрый старт](#быстрый-старт)
- [Автоматический деплой](#автоматический-деплой)
- [Ручной деплой](#ручной-деплой)
- [Конфигурация сервера](#конфигурация-сервера)
- [Режимы работы](#режимы-работы)
- [Troubleshooting](#troubleshooting)

---

## 🚀 Быстрый старт

### Метод 1: Slash Command (Рекомендуется)

```bash
/deploy
```

**Что произойдет:**
1. ✅ Валидация изменений
2. ✅ Push в production ветку
3. ✅ Автоматическая пересборка Docker
4. ✅ Проверка работоспособности

### Метод 2: Git Push (Автоматический деплой)

```bash
git checkout production
git merge main  # или вашу feature ветку
git push origin production
```

**GitHub Actions автоматически:**
- Синхронизирует код на сервер
- Пересобирает Docker контейнер
- Запускает бота
- Проверяет статус

---

## 🤖 Автоматический деплой

### GitHub Actions Workflow

**Триггер**: Push в ветку `production`

**Что выполняется:**

```yaml
1. Setup SSH Connection
   └─ Подключение к 212.86.115.30

2. Sync Code
   └─ rsync всех файлов (кроме node_modules, dist, .env)

3. Docker Rebuild
   ├─ docker stop 999-multibots
   ├─ docker rm 999-multibots
   ├─ docker build --no-cache -t 999-multibots .
   └─ docker run -d (с правильными портами и .env)

4. Verification
   ├─ Проверка статуса контейнера
   ├─ Анализ логов на ошибки
   └─ Тест API endpoint (опционально)
```

### Настройка GitHub Secrets

**Обязательный секрет:**
- `SSH_PRIVATE_KEY` - SSH ключ для доступа к серверу

**Как добавить:**
1. GitHub → Repository → Settings → Secrets → Actions
2. New repository secret
3. Name: `SSH_PRIVATE_KEY`
4. Value: Содержимое `~/.ssh/zomro` (включая BEGIN/END строки)

---

## 🛠️ Ручной деплой

### Вариант 1: Полный деплой (Рекомендуется)

```bash
# На локальной машине
git checkout production
git push origin production

# Деплой произойдет автоматически через GitHub Actions
```

### Вариант 2: Прямой SSH деплой

```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 << 'EOF'
cd /root/bot-farm

# Pull latest code
git pull origin production

# Stop old container
docker stop 999-multibots
docker rm 999-multibots

# Build fresh image (ОБЯЗАТЕЛЬНО --no-cache!)
docker build --no-cache -t 999-multibots .

# Start new container
docker run -d --name 999-multibots --restart=always \
  -p 3001:3001 -p 2999:2999 \
  -v /root/bot-farm/.env:/app/.env:ro \
  999-multibots

# Check status
sleep 10
docker logs 999-multibots --tail 50
EOF
```

### Вариант 3: Использование deployment-manager agent

```bash
/deploy
```

Agent автоматически выполнит все необходимые шаги с валидацией.

---

## ⚙️ Конфигурация сервера

### Основные параметры

| Параметр | Значение |
|----------|----------|
| **Сервер** | 212.86.115.30 |
| **SSH ключ** | ~/.ssh/zomro |
| **Путь проекта** | /root/bot-farm |
| **Контейнер** | 999-multibots |
| **Порты** | 3001 (webhooks), 2999 (API) |

### Структура на сервере

```
/root/bot-farm/
├── .env                  # Переменные окружения (не в git)
├── Dockerfile            # Docker конфигурация
├── package.json          # Node.js зависимости
├── src/                  # Исходный код
│   ├── index.ts         # 🔥 ТОЧКА ВХОДА (используется в production)
│   ├── bot.ts           # Устаревшая точка входа (не используется)
│   └── ...
├── scripts/
│   └── docker-entrypoint.sh  # Entrypoint скрипт
└── dist/                # Скомпилированный код (создается при сборке)
    ├── index.js         # 🚀 Запускается в Docker
    └── ...
```

### Переменные окружения (.env)

**Обязательные для работы:**

```bash
# Режим работы
NODE_ENV=production
MODE=polling              # или MODE=webhook

# Боты (минимум один)
BOT_TOKEN_1=ваш_токен_бота_1
BOT_TOKEN_2=ваш_токен_бота_2
# ... до BOT_TOKEN_10

# Supabase
SUPABASE_URL=https://ваш-проект.supabase.co
SUPABASE_SERVICE_KEY=ваш_service_key
SUPABASE_SERVICE_ROLE_KEY=ваш_service_role_key

# AI Server
API_SERVER_URL=https://ai-server-production.up.render-server (local)

# ElevenLabs (для voice)
ELEVENLABS_API_KEY=ваш_api_key

# Robokassa (для платежей)
MERCHANT_LOGIN=ваш_логин
ROBOKASSA_PASSWORD_1=ваш_пароль_1
ROBOKASSA_PASSWORD_2=ваш_пароль_2
```

---

## 🎛️ Режимы работы

### MODE=polling (Текущий режим)

**Конфигурация:**
```bash
MODE=polling
NODE_ENV=production
```

**Особенности:**
- ✅ Работает БЕЗ `TEST_BOT_NAME` в production
- ✅ Запускает первого доступного бота из .env
- ✅ Автоматически удаляет webhook перед запуском
- ✅ Не требует публичного домена

**Логи при запуске:**
```
🔧 [POLLING] Запуск первого доступного бота из .env
✅ [POLLING] Найден бот neuro_blogger_bot
🔌 [WEBHOOK] Обнаружен активный вебхук: https://... Удаляю...
✅ [WEBHOOK] Вебхук удалён, переходим к polling
🚀 [POLLING] Бот neuro_blogger_bot успешно запущен в polling режиме
```

### MODE=webhook (Альтернативный режим)

**Конфигурация:**
```bash
MODE=webhook
NODE_ENV=production
WEBHOOK_DOMAIN=https://ваш-домен.com
```

**Особенности:**
- Требует настроенный домен
- Запускает все 10 ботов одновременно
- Каждый бот на своем порту (3001-3010)

---

## 🚨 Критические правила

### ❌ НИКОГДА НЕ ДЕЛАЙТЕ

1. **`docker restart 999-multibots`**
   → Не применяет изменения кода!

2. **`docker build` без `--no-cache`**
   → Использует устаревший кеш!

3. **Пропуск удаления контейнера**
   → Старые данные могут остаться!

4. **Запуск `dist/bot.js` вместо `dist/index.js`**
   → MODE logic не сработает!

### ✅ ВСЕГДА ДЕЛАЙТЕ

1. **`docker stop` → `docker rm` → `docker build --no-cache`**
2. **Проверяйте логи после деплоя**: `docker logs 999-multibots --tail 100`
3. **Используйте правильный entrypoint**: `dist/index.js`
4. **Монтируйте .env как volume**: `-v /root/bot-farm/.env:/app/.env:ro`

---

## 🔍 Troubleshooting

### Контейнер не запускается

**Проверка:**
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 'docker ps -a | grep 999-multibots'
```

**Если статус "Restarting":**
```bash
# Смотрим логи
docker logs 999-multibots --tail 100

# Частые причины:
# 1. TypeScript ошибки компиляции
# 2. Отсутствует .env файл
# 3. Неправильные переменные окружения
```

### MODE logic не работает

**Проверка:**
```bash
docker logs 999-multibots | grep -E "MODE|POLLING|WEBHOOK"
```

**Если нет логов MODE:**
- Проверьте, что используется `dist/index.js`, а не `dist/bot.js`
- Проверьте `docker-entrypoint.sh`
- Пересоберите с `--no-cache`

### Бот не отвечает на сообщения

**В режиме polling:**
```bash
# Проверьте, что webhook удален
docker logs 999-multibots | grep "переходим к polling"

# Проверьте статус бота
docker logs 999-multibots | grep "успешно запущен"
```

**В режиме webhook:**
```bash
# Проверьте настройку webhook
curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo
```

### TypeScript ошибки при сборке

**Проверка локально:**
```bash
npm run typecheck
```

**Если ошибки есть:**
- Исправьте их перед деплоем
- Или используйте `--skipLibCheck` (уже настроено в Dockerfile)

---

## 📊 Мониторинг

### Проверка статуса контейнера

```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 'docker ps | grep 999-multibots'
```

**Ожидаемый вывод:**
```
999-multibots ... Up 5 minutes ... 0.0.0.0:3001->3001/tcp, 0.0.0.0:2999->2999/tcp
```

### Просмотр логов

```bash
# Последние 50 строк
ssh -i ~/.ssh/zomro root@212.86.115.30 'docker logs 999-multibots --tail 50'

# Логи в реальном времени
ssh -i ~/.ssh/zomro root@212.86.115.30 'docker logs -f 999-multibots'

# Поиск ошибок
ssh -i ~/.ssh/zomro root@212.86.115.30 'docker logs 999-multibots 2>&1 | grep -i error'
```

### Проверка ресурсов

```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 'docker stats 999-multibots --no-stream'
```

---

## 🎯 Быстрые команды

### Перезапуск после изменения .env

```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 'docker restart 999-multibots'
```
⚠️ Использовать ТОЛЬКО если изменили .env без изменения кода!

### Полная пересборка (с кодом)

```bash
git push origin production
```
Автоматический деплой через GitHub Actions.

### Экстренный откат

```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 << 'EOF'
cd /root/bot-farm
git checkout HEAD~1
docker stop 999-multibots && docker rm 999-multibots
docker build --no-cache -t 999-multibots .
docker run -d --name 999-multibots --restart=always \
  -p 3001:3001 -p 2999:2999 \
  -v /root/bot-farm/.env:/app/.env:ro \
  999-multibots
EOF
```

---

## 📚 Дополнительные ресурсы

- **Pre-Deployment Checklist**: `docs/PRE_DEPLOY_CHECKLIST.md`
- **Architecture Overview**: `docs/DEPLOYMENT_FIX_SUMMARY.md`
- **GitHub Actions Workflow**: `.github/workflows/production-deploy.yml`
- **Deployment Manager Agent**: `.claude/agents/deployment-manager.md`
- **Deploy Command**: `.claude/commands/deploy.md`

---

## ✅ Checklists

### Перед каждым деплоем

- [ ] Изменения закоммичены в git
- [ ] На ветке `production`
- [ ] TypeScript компилируется без ошибок
- [ ] Локальные тесты проходят (если есть)
- [ ] .env файл на сервере актуален

### После деплоя

- [ ] Контейнер в статусе "Up"
- [ ] Логи не содержат критических ошибок
- [ ] Бот отвечает на тестовое сообщение
- [ ] API endpoint доступен (если MODE=webhook)

---

**Дата создания**: 2025-10-16
**Автор**: Claude Code
**Версия**: 2.0
