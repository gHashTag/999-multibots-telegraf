# Nginx Configuration & Webhook Setup

## Обзор архитектуры

В проекте используется следующая многоуровневая архитектура для обработки запросов:

```
Внешний запрос -> Nginx-proxy -> Express-сервер -> Бот-обработчик
```

1. **Внешний прокси** - Nginx на порту 443/80, проксирует запросы на порт 8080
2. **Внутренний прокси** - Nginx на порту 8080, проксирует запросы на соответствующие порты приложения:
   - Порт 2999: основной порт приложения и обработчик вебхуков `/telegraf/*`
   - Порт 3001-3007: отдельные порты для каждого бота

## Конфигурация Nginx

Основная конфигурация Nginx находится в файле `nginx-config/default.conf`:

```nginx
server {
    listen 80;
    listen 443 ssl;
    server_name _;

    ssl_certificate /etc/pki/cert.crt;
    ssl_certificate_key /etc/pki/key.pem;

    # Обработка телеграм вебхуков
    location ~ ^/telegraf/ {
        proxy_pass http://app:2999;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Основной порт приложения
    location / {
        proxy_pass http://app:2999;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Индивидуальные маршруты для каждого бота
    location /neuro_blogger_bot {
        proxy_pass http://app:3001;
        # ... [стандартные заголовки]
    }

    # ... [аналогичные блоки для других ботов]
}
```

### Важные моменты конфигурации Nginx

1. **Проксирование вебхуков**: Все запросы на `/telegraf/*` направляются на порт 2999, где работает специальный обработчик вебхуков
2. **Отсутствие конечного слеша**: В Location блоках нет завершающего слеша, это критично для правильной работы вебхуков
3. **Заголовки прокси**: Необходимо передавать X-Real-IP и X-Forwarded-For для правильной обработки запросов

## Настройка Webhook для ботов

Webhooks настраиваются в `src/bot.ts` следующим образом:

```typescript
bot.launch({
  webhook: {
    domain: process.env.WEBHOOK_DOMAIN,
    port: currentPort,
    path: `/telegraf/${bot.secretPathComponent()}`,
  },
  allowedUpdates: ['message', 'callback_query'],
})
```

Где:

- `WEBHOOK_DOMAIN` - доменное имя сервера (без слеша в конце)
- `currentPort` - уникальный порт для каждого бота (3001-3007)
- `secretPathComponent` - уникальный хеш, генерируемый Telegraf для защиты вебхука

## Централизованный обработчик вебхуков

В файле `src/webhookHandler.ts` реализован централизованный обработчик вебхуков, который запускается на порту 2999:

```typescript
// Маршрут для обработки вебхуков Telegram
app.post('/telegraf/:token', (req, res) => {
  const token = req.params.token
  const bot = botTokens.get(token)
  if (bot) {
    // Передаем запрос в обработчик бота
    bot.handleUpdate(req.body, res)
  } else {
    console.error(`❌ Не найден бот для токена: ${token.substring(0, 6)}...`)
    res.status(404).send('Bot not found')
  }
})
```

## Docker конфигурация

Конфигурация Docker настроена в `docker-compose.yml` и включает:

1. **app** - основной контейнер с ботами

   - Порты: 2999, 3001-3007
   - Монтирование необходимых файлов и сертификатов

2. **nginx** - контейнер с Nginx
   - Порты: 8443:443, 8080:80
   - Монтирование nginx-config и сертификатов

## Проверка и отладка

### Тестирование конфигурации Nginx

```bash
# Проверка синтаксиса конфигурации
docker exec bot-proxy nginx -t

# Перезагрузка конфигурации без перезапуска
docker exec bot-proxy nginx -s reload
```

### Проверка вебхуков Telegram

```bash
# Получение информации о текущем webhook
curl -X POST https://api.telegram.org/bot{BOT_TOKEN}/getWebhookInfo
```

## Возможные проблемы и их решения

1. **Ошибка 502 Bad Gateway**:

   - Проверьте, запущен ли Express-сервер на порту 2999
   - Проверьте наличие маршрута `/telegraf/` в конфигурации Nginx

2. **Боты не отвечают на команды**:

   - Убедитесь, что вебхуки правильно настроены
   - Проверьте, что порты ботов (3001-3007) проксируются корректно

3. **Конфликты Location блоков в Nginx**:
   - Используйте уникальные пути для каждого бота
   - Избегайте перекрытия маршрутов

## ВАЖНО: Любые изменения в конфигурации Nginx или вебхуков должны быть задокументированы только в этом файле!
