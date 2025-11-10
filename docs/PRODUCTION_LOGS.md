# 📋 Команды для просмотра логов на production

## 🚀 Render Server хостинг

### Быстрый доступ к логам:

```bash
# Установить Render Server CLI (если еще не установлен)
npm install -g @railway/cli

# Войти в Render Server
railway login

# Просмотр логов в реальном времени
railway logs --tail

# Просмотр последних 100 строк логов
railway logs --lines 100

# Фильтрация логов по ключевым словам
railway logs --grep "neuro-photo"
railway logs --grep "ERROR"
railway logs --grep "generateNeuroPhotoHybrid"
```

### Через веб-интерфейс:
1. Перейдите на https://render-server (local)
2. Выберите ваш проект
3. Нажмите на сервис
4. Перейдите во вкладку "Logs"

## 🔍 Полезные команды для отладки нейрофото:

```bash
# Проверка URL сервера
railway logs --grep "API_SERVER_URL"

# Проверка запросов на генерацию
railway logs --grep "/generate/neuro-photo"

# Проверка ошибок 401 (токен)
railway logs --grep "401"

# Проверка успешных генераций
railway logs --grep "Neuro image generation response"
```

## ⚠️ Важные переменные окружения на production:

На production сервере должны быть установлены:
- `API_SERVER_URL` - URL вашего AI сервера
- `SERVER_API_URL` - альтернативный URL сервера
- `SECRET_API_KEY` - ключ для авторизации запросов
- `REPLICATE_API_TOKEN` - токен Replicate (если используется прямая генерация)

## 📊 Мониторинг в реальном времени:

```bash
# Следить за всеми логами
railway logs --follow

# Следить только за ошибками
railway logs --follow --grep "ERROR\|error\|Error"

# Следить за конкретным ботом
railway logs --follow --grep "clip_maker_neuro_bot"
```