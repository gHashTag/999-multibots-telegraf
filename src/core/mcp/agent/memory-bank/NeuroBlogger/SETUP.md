# 🚀 Инструкция по запуску

## 1. Подготовка окружения

### Переменные окружения
```bash
# Supabase
SUPABASE_URL=https://yuukfqcsdhkyxegfwlcb.supabase.co
SUPABASE_KEY=your_key_here

# Telegram
BOT_TOKEN=your_bot_token
BOT_OWNER_ID=144022504

# GitHub
GITHUB_TOKEN=your_github_token

# E2B
E2B_API_KEY=your_e2b_key
```

### Установка зависимостей
```bash
npm install
```

## 2. Проверка подключений

### Supabase
```typescript
// Тестовый запрос
const { data, error } = await supabase
  .from('autonomous_tasks')
  .select('*')
  .limit(1)
```

### GitHub
```typescript
// Проверка доступа
const { data } = await octokit.rest.users.getAuthenticated()
```

### Telegram
```typescript
// Проверка бота
const botInfo = await bot.telegram.getMe()
```

## 3. Запуск системы

### Локальная разработка
```bash
npm run dev
```

### Продакшн
```bash
npm run build
npm start
```

## 4. Проверка работоспособности

### Тестовые команды
1. Telegram бот:
   ```
   /start - проверка запуска
   /status - проверка состояния
   /help - список команд
   ```

2. Тестовая задача:
   ```
   /improve "Добавить логирование"
   ```

### Мониторинг
1. Проверить логи:
   ```bash
   docker logs -f neuro-blogger-telegram-bot
   ```

2. Проверить статус:
   ```bash
   docker ps
   ```

## 5. Устранение проблем

### Частые проблемы

1. **Ошибка подключения к Supabase**
   ```bash
   # Проверить
   curl -I $SUPABASE_URL
   ```

2. **Проблемы с Telegram**
   ```bash
   # Перезапустить бота
   docker-compose restart telegram-bot
   ```

3. **Ошибки GitHub**
   ```bash
   # Проверить токен
   curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user
   ```

### Логи и отладка

1. **Просмотр логов**
   ```bash
   # Все логи
   docker-compose logs

   # Конкретный сервис
   docker-compose logs telegram-bot
   ```

2. **Отладка**
   ```bash
   # Запуск с отладкой
   npm run dev:debug
   ```

## 6. Следующие шаги

1. **После успешного запуска**
   - Проверить обработку задач
   - Протестировать улучшения
   - Настроить мониторинг

2. **Оптимизация**
   - Настроить кеширование
   - Оптимизировать запросы
   - Улучшить логирование

3. **Масштабирование**
   - Добавить метрики
   - Настроить алерты
   - Улучшить производительность