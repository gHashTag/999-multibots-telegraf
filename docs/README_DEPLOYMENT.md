# Инструкция по запуску и обслуживанию Telegram ботов на сервере

## Обзор системы

На сервере настроено 2 режима работы ботов:

1. **Long Polling режим** - для тестирования и разработки
2. **Webhook режим** - для продакшен-среды (основной режим)

## Файлы конфигурации

- `multi-bot.js` - скрипт для запуска всех ботов в режиме long polling
- `multi-bot-webhook.js` - скрипт для запуска всех ботов через webhooks
- `docker-compose.multi.yml` - Docker-конфигурация для long polling режима
- `docker-compose.webhook.yml` - Docker-конфигурация для webhook режима (основной)

## Запуск ботов

### Для запуска ботов в production режиме (webhook):

```bash
cd /opt/app/999-multibots-telegraf
docker-compose -f docker-compose.webhook.yml up -d
```

### Для просмотра логов:

```bash
docker-compose -f docker-compose.webhook.yml logs webhook-bot -f
```

### Для перезапуска:

```bash
docker-compose -f docker-compose.webhook.yml restart webhook-bot
```

## Диагностика и отладка

### Проверка состояния webhook для конкретного бота:

```bash
curl -s "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

Например:

```bash
curl -s "https://api.telegram.org/bot7655182164:AAH-bql07FKmsVm4GsT6d2GvFEE4NRoUnMw/getWebhookInfo"
```

### Установка webhook вручную:

```bash
curl -s "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://999-multibots-u14194.vm.elestio.app/webhook/bot_name"
```

### Удаление webhook:

```bash
curl -s "https://api.telegram.org/bot<TOKEN>/deleteWebhook"
```

## Структура URL для webhooks

- Каждый бот использует свой URL для webhook
- Базовый формат: `https://999-multibots-u14194.vm.elestio.app/webhook/<bot_name>`
- Примеры URL:
  - `https://999-multibots-u14194.vm.elestio.app/webhook/neuro_blogger_bot`
  - `https://999-multibots-u14194.vm.elestio.app/webhook/MetaMuse_Manifest_bot`

## Безопасность

- Каждый бот использует собственный секретный токен для защиты webhook
- Формат токена: `multibots_webhook_secret_BOT_TOKEN_N`

## Обновление

При внесении изменений в код ботов:

1. Обновите исходный код на сервере
2. Перезапустите контейнер:
   ```bash
   docker-compose -f docker-compose.webhook.yml restart webhook-bot
   ```

## Режим тестирования (long polling)

Для запуска ботов в режиме тестирования (long polling):

```bash
docker-compose -f docker-compose.multi.yml up -d
```

## Обнаружение проблем

1. Если бот не отвечает:
   - Проверьте логи: `docker-compose -f docker-compose.webhook.yml logs webhook-bot -f`
   - Проверьте статус webhook: `curl -s "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"`
2. Если в логах ошибка авторизации (401):

   - Проверьте правильность токена в .env файле
   - Возможно, токен был отозван или заменен

3. Если в логах ошибка сертификата:
   - Проверьте настройки SSL в nginx

## Важные дополнения

1. Webhook имеет преимущество над long polling. Если вы переключаетесь между режимами, убедитесь что предыдущий контейнер остановлен:

   ```bash
   docker-compose -f docker-compose.multi.yml down
   docker-compose -f docker-compose.webhook.yml down
   ```

2. При обновлении токенов ботов, не забудьте обновить словарь имен в `multi-bot-webhook.js`:
   ```javascript
   const botNameMap = {
     '<TOKEN>': '<BOT_NAME>',
     // ...
   }
   ```
