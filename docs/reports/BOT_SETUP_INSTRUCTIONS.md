# 🤖 Инструкции по добавлению 11-го бота (OM_AI_Digital_studio_bot)

## ✅ Выполненные настройки

### 1. Docker Compose
- ✅ Добавлен BOT_TOKEN_11 в docker-compose.yml
- ✅ Добавлен порт 3011:3011 в docker-compose.yml

### 2. Nginx Configuration
- ✅ Добавлена конфигурация для OM_AI_Digital_studio_bot (порт 3011)
- ✅ Файл: config/nginx/nginx-config/default.conf

### 3. Bot Configuration
- ✅ Добавлен BOT_TOKEN_11 в src/core/bot/index.ts
- ✅ Добавлен OM_AI_Digital_studio_bot в BOT_NAMES
- ✅ Добавлен OM_AI_Digital_studio_bot в USERNAME_TO_BOT_NAME mapping
- ✅ Добавлен OM_AI_Digital_studio_bot в тип BotName

### 4. Dockerfile
- ✅ Обновлен EXPOSE для портов 3000-3011

### 5. Database
- ⚠️ Создан файл add_avatar.sql для выполнения в Supabase Dashboard

## 📋 Следующие шаги

### ✅ Шаг 1: Токен получен
- **Bot**: OM_AI_Digital_studio_bot
- **Username**: t.me/OM_AI_Digital_studio_bot
- **⚠️ Токен**: Получен от BotFather, добавить в Infisical как BOT_TOKEN_11

### Шаг 2: Добавить токен в Infisical
1. Зайти в Infisical Dashboard
2. Найти проект: `999-multibots-telegraf`
3. Добавить переменную: `BOT_TOKEN_11`
4. Установить значение: токен от BotFather (НЕ публиковать в документации!)
5. Сохранить и развернуть

### Шаг 3: Добавить аватар в базу данных
1. Зайти в Supabase Dashboard
2. Открыть SQL Editor
3. Выполнить запрос из файла: `add_avatar.sql`
4. Или выполнить вручную:
```sql
INSERT INTO avatars (
    telegram_id,
    bot_name,
    avatar_url,
    "group",
    created_at,
    updated_at
) VALUES (
    '7669741878', -- Telegram ID аватара
    'HaimGroupMedia_bot',
    'https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/landingpage/avatars/HaimGroupMedia_bot/coco-age.jpeg',
    'ai_stars',
    NOW(),
    NOW()
) ON CONFLICT (telegram_id, bot_name) DO NOTHING;
```

### Шаг 4: Перезапустить сервер
```bash
# Пересобрать и перезапустить
docker-compose down
docker-compose up -d --build

# Проверить статус
docker-compose ps
```

### Шаг 5: Проверить работу бота
1. Написать боту в Telegram
2. Проверить логи: `docker-compose logs -f app`
3. Убедиться, что бот отвечает на команды

## 🔍 Проверочные команды

### Проверка портов
```bash
# Все порты должны быть в LISTEN
netstat -tulpn | grep 300
```

### Проверка ботов
```bash
# В логах должна появиться информация о 11 ботах
docker-compose logs app | grep "Bots initialized"
```

### Проверка nginx
```bash
# Проверить конфигурацию nginx
docker-compose exec nginx nginx -t
```

## 📊 Список ботов

| №  | Имя бота                | Токен         | Порт  |
|----|-------------------------|---------------|-------|
| 1  | neuro_blogger_bot       | BOT_TOKEN_1   | 3001  |
| 2  | MetaMuse_Manifest_bot   | BOT_TOKEN_2   | 3002  |
| 3  | ZavaraBot               | BOT_TOKEN_3   | 3003  |
| 4  | LeeSolarbot             | BOT_TOKEN_4   | 3004  |
| 5  | NeuroLenaAssistant_bot  | BOT_TOKEN_5   | 3005  |
| 6  | NeurostylistShtogrina   | BOT_TOKEN_6   | 3006  |
| 7  | Gaia_Kamskaia_bot       | BOT_TOKEN_7   | 3007  |
| 8  | Kaya_easy_art_bot       | BOT_TOKEN_8   | 3008  |
| 9  | AI_STARS_bot            | BOT_TOKEN_9   | 3009  |
| 10 | HaimGroupMedia_bot      | BOT_TOKEN_10  | 3010  |
| 11 | OM_AI_Digital_studio_bot| BOT_TOKEN_11  | 3011  |

## ⚠️ Важные заметки

1. **Port Mapping**: Каждый бот работает на отдельном порту
2. **Nginx Proxy**: Все боты доступны через nginx по URL: `https://domain.com/{bot_name}`
3. **Webhook URLs**: Для каждого бота нужно установить webhook:
   - URL: `https://your-domain.com/OM_AI_Digital_studio_bot`
4. **Environment Variables**: Все токены должны быть в Infisical

## 🐛 Устранение неисправностей

### Бот не отвечает
1. Проверить токен в Infisical
2. Проверить логи: `docker-compose logs app`
3. Убедиться, что порт 3011 открыт

### 502 Bad Gateway
1. Проверить nginx конфигурацию: `docker-compose exec nginx nginx -t`
2. Проверить, что бот слушает порт 3011
3. Перезапустить nginx: `docker-compose restart nginx`

### Ошибки базы данных
1. Проверить подключение к Supabase
2. Убедиться, что аватар добавлен в таблицу avatars
3. Проверить права доступа к Supabase

## 📞 Контакты

- **Telegram**: @playra
- **Supabase**: https://supabase.com/dashboard/project/fbgmxbvzwgxfkagxkmqc
- **Infisical**: https://app.infisical.com/

---
**Дата создания**: 2025-12-03
**Статус**: ✅ Готов к запуску
