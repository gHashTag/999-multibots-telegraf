# ✅ Dev Environment ГОТОВ К РАБОТЕ!

## 🎯 Что настроено:

### 🔐 Безопасность
- ✅ **Тестовые токены ботов** (НЕ продакшн!)
- ✅ **Отдельный webhook domain** для dev
- ✅ **Development режим** (NODE_ENV=development)
- ✅ **Продакшн токены сохранены** в `.env.prod.backup`

### 🤖 Тестовые боты:
```bash
# Основные тестовые боты:
BOT_TOKEN_1=7313269542:...  # @clip_maker_neuro_bot  
BOT_TOKEN_2=7388884770:...  # Второй тестовый бот

# Остальные слоты дублируют тестовые токены
# (чтобы приложение не падало)
```

### 🌐 Сервер:
- **URL:** `999-multibots-dev-u14194.vm.elestio.app`
- **API:** `http://localhost:2999` ✅ РАБОТАЕТ
- **Webhook:** `https://999-multibots-dev-u14194.vm.elestio.app`
- **Ветка:** `cicd` (без тестов Jest)

### 📦 Контейнеры:
```bash
NAME                STATUS    PORTS
999-multibots-dev   Up        0.0.0.0:2999-3010->2999-3010/tcp
bot-proxy-dev       Up        0.0.0.0:8080->80/tcp, 8443->443/tcp
```

## 🚀 Как использовать:

### 1. SSH подключение:
```bash
ssh -i ~/.ssh/id_rsa root@999-multibots-dev-u14194.vm.elestio.app
```

### 2. Управление контейнерами:
```bash
cd /opt/app/999-multibots-telegraf

# Статус
docker-compose -f docker-compose.dev.yml ps

# Логи
docker logs 999-multibots-dev --tail 50

# Перезапуск
docker-compose -f docker-compose.dev.yml restart

# Остановка
docker-compose -f docker-compose.dev.yml down
```

### 3. Работа с кодом:
```bash
# Переключиться на ветку для разработки
git checkout cicd
git pull origin cicd

# После изменений - пересборка
docker-compose -f docker-compose.dev.yml down
docker-compose -f docker-compose.dev.yml up -d --build
```

### 4. Тестирование ботов:
```bash
# Найти @clip_maker_neuro_bot в Telegram
# Отправить команду /start
# Проверить что бот отвечает
```

## 📁 Важные файлы:

- `.env` - текущая dev конфигурация 
- `.env.prod.backup` - продакшн настройки (BACKUP!)
- `.env.dev.test` - шаблон dev настроек
- `docker-compose.dev.yml` - dev контейнеры

## ⚠️  ВАЖНЫЕ ПРАВИЛА:

### ✅ ЧТО МОЖНО:
- Тестировать новые функции
- Ломать dev окружение
- Экспериментировать с кодом
- Делать deploy в dev

### ❌ ЧТО НЕЛЬЗЯ:
- Использовать продакшн токены в dev
- Применять изменения сразу в продакшн  
- Удалять `.env.prod.backup`
- Пушить dev токены в git

## 🔄 Workflow разработки:

1. **Разработка** → изменения в коде на ветке `cicd`
2. **Тестирование** → deploy в dev окружение  
3. **Проверка** → тестирование с `@clip_maker_neuro_bot`
4. **Merge** → после успешных тестов merge в main

## 🆘 Troubleshooting:

### Контейнер падает:
```bash
docker logs 999-multibots-dev --tail 100
# Ищем ошибки и исправляем .env
```

### Боты не отвечают:
```bash
# Проверить webhook
curl https://999-multibots-dev-u14194.vm.elestio.app

# Проверить токены
grep BOT_TOKEN_1 .env
```

### Восстановить продакшн настройки:
```bash
cp .env.prod.backup .env
docker-compose -f docker-compose.dev.yml restart
```

---

## 🎉 ГОТОВО К БЕЗОПАСНОЙ РАЗРАБОТКЕ!

Теперь можно спокойно экспериментировать и не бояться сломать продакшн! 🚀