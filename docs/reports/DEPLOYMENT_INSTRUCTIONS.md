# 🚀 Инструкция по деплою 11-го бота (OM_AI_Digital_studio_bot)

## 📋 Статус готовности

### ✅ ВЫПОЛНЕНО
- [x] Восстановлены все конфигурации после сброса агента
- [x] Добавлены все настройки для OM_AI_Digital_studio_bot
- [x] Проверена TypeScript компиляция (наши изменения корректны)
- [x] Созданы скрипты для тестирования
- [x] Проверена доступность production сервера

### 🔄 ТРЕБУЕТСЯ ВЫПОЛНИТЬ

## 1. 📦 Добавить токен в Infisical

**Перейти в:** https://app.infisical.com/projects/fd763fa3-35d5-4045-93bd-1795c5f00fc3/environments/prod/secrets

**Добавить переменную:**
```
Имя: BOT_TOKEN_11
Значение: 8546804869:AAGYO9teJWJLVSsVj2U9nmyr5N80lIq7bvU
```

**Описание:** Токен бота OM_AI_Digital_studio_bot от BotFather

## 2. 🗄️ Выполнить SQL в Supabase

**Перейти в:** https://supabase.com/dashboard/project/fqptwxdhfjfgdxlpnygq

**Выполнить SQL:**
```sql
-- Аватар для HaimGroupMedia_bot (ID: 7669741878)
INSERT INTO avatars (
    telegram_id,
    bot_name,
    avatar_url,
    "group",
    created_at,
    updated_at
) VALUES (
    '7669741878',
    'HaimGroupMedia_bot',
    'https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/landingpage/avatars/HaimGroupMedia_bot/coco-age.jpeg',
    'ai_stars',
    NOW(),
    NOW()
) ON CONFLICT (telegram_id, bot_name) DO NOTHING;

-- Аватар для OM_AI_Digital_studio_bot
-- (НУЖНО УКАЗАТЬ РЕАЛЬНЫЕ ДАННЫЕ!)
INSERT INTO avatars (
    telegram_id,
    bot_name,
    avatar_url,
    "group",
    created_at,
    updated_at
) VALUES (
    '[TBA]', -- Заменить на Telegram ID владельца бота
    'OM_AI_Digital_studio_bot',
    '[TBA]', -- Заменить на URL аватара
    'ai_stars',
    NOW(),
    NOW()
) ON CONFLICT (telegram_id, bot_name) DO NOTHING;
```

## 3. 🔄 Задеплоить систему

### Вариант A: SSH на сервер
```bash
# Подключиться к серверу
ssh root@188.137.250.69

# Перейти в директорию проекта
cd /opt/999-multibots-telegraf

# Остановить текущие контейнеры
docker-compose down

# Обновить код (если есть изменения)
git pull origin main

# Запустить новые контейнеры
docker-compose up -d --build

# Проверить логи
docker-compose logs -f app
```

### Вариант B: Локально через deploy.sh
```bash
# С локальной машины
./deploy.sh production
```

## 4. ✅ Проверить деплой

### 4.1 Проверить логи контейнера
```bash
docker logs 999-multibots --tail 100 -f
```

**Ожидаем увидеть:**
```
🌟 Инициализировано ботов: { count: 11, bot_names: [...] }
```

### 4.2 Проверить порты
```bash
# Проверить, что все порты 3001-3011 доступны
for port in {3001..3011}; do
  curl -s http://localhost:$port/health || echo "Порт $port недоступен"
done
```

### 4.3 Проверить webhook URL для OM_AI_Digital_studio_bot
```bash
curl -I http://188.137.250.69/OM_AI_Digital_studio_bot
```

**Ожидаем:** HTTP/1.1 200 OK

## 5. 🧪 Протестировать ботов

### 5.1 Автоматическое тестирование
```bash
# Запустить скрипт тестирования
node test-all-bots.js
```

### 5.2 Ручное тестирование
Отправить `/start` каждому боту:

1. **@neuro_blogger_bot** - http://188.137.250.69/neuro_blogger_bot
2. **@MetaMuse_manifestation** - http://188.137.250.69/MetaMuse_Manifest_bot
3. **@ZavaraBot** - http://188.137.250.69/ZavaraBot
4. **@LeeSolarbot** - http://188.137.250.69/LeeSolarbot
5. **@NeuroLenaAssistant_bot** - http://188.137.250.69/NeuroLenaAssistant_bot
6. **@NeurostylistShtogrina** - http://188.137.250.69/NeurostylistShtogrina_bot
7. **@Gaia_Kamskaia_bot** - http://188.137.250.69/Gaia_Kamskaia_bot
8. **@Kaya_easy_art_bot** - http://188.137.250.69/Kaya_easy_art_bot
9. **@AI_STARS_bot** - http://188.137.250.69/AI_STARS_bot
10. **@HaimGroupMedia_bot** - http://188.137.250.69/HaimGroupMedia_bot
11. **@OM_AI_Digital_studio_bot** - http://188.137.250.69/OM_AI_Digital_studio_bot ✅ **НОВЫЙ!**

### 5.3 Ожидаемый результат
Каждый бот должен ответить:
```
Привет, [Имя]!
Добро пожаловать в [Имя бота]!
```

## 📊 Диагностические команды

### Проверить статус контейнеров
```bash
docker ps | grep 999-multibots
```

### Проверить логи Inngest
```bash
docker logs 999-multibots | grep -i inngest
```

### Проверить загрузку секретов
```bash
docker logs 999-multibots | grep -i "BOT_TOKEN_11"
```

### Проверить ошибки
```bash
docker logs 999-multibots | grep -i error
```

## 🔧 Возможные проблемы

### Проблема: "BOT_TOKEN_11 не найден"
**Решение:** Проверить, что переменная добавлена в Infisical и контейнер перезапущен

### Проблема: "Порт 3011 недоступен"
**Решение:** Проверить docker-compose.yml и Dockerfile

### Проблема: "Nginx 404 для /OM_AI_Digital_studio_bot"
**Решение:** Проверить nginx конфигурацию

### Проблема: "Бот не отвечает"
**Решение:** Проверить, что токен корректен и webhook настроен

## ✅ Критерии успешного деплоя

1. ✅ Все 11 ботов инициализировались в логах
2. ✅ Порты 3001-3011 доступны
3. ✅ Webhook URL /OM_AI_Digital_studio_bot отвечает 200
4. ✅ Все боты отвечают на /start
5. ✅ В базе данных есть аватары для ботов

## 📝 Чеклист деплоя

- [ ] BOT_TOKEN_11 добавлен в Infisical
- [ ] SQL выполнен в Supabase
- [ ] `docker-compose up -d --build` выполнен
- [ ] Логи показывают 11 ботов
- [ ] Все порты 3001-3011 доступны
- [ ] /OM_AI_Digital_studio_bot отвечает 200
- [ ] 11-й бот отвечает на /start
- [ ] Аватары загружены в БД

## 🎯 Следующие шаги

После успешного деплоя:

1. **Мониторинг:** Настроить мониторинг нового бота
2. **Аналитика:** Добавить в отчеты
3. **Документация:** Обновить список ботов
4. **Backup:** Создать бэкап конфигурации

---

**Автор:** Claude Code
**Дата:** 2025-12-03
**Статус:** Готов к деплою ✅
