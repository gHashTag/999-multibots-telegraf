---
name: check
description: Quick JavaScript error check in production logs
---

## Быстрая диагностика production логов

SSH в production и выполни:
```bash
ssh prod999 "docker logs 999-multibots --tail 100 2>&1"
```

## Правила диагностики

### CRITICAL (требует немедленного исправления):
- `Cannot find module` - модуль не найден (перебилдить Docker)
- `MODULE_NOT_FOUND` - проверить импорты и пути
- `TypeError: Cannot` - ошибка типа, null/undefined access
- `ReferenceError:` - необъявленная переменная
- `SyntaxError:` - синтаксическая ошибка в коде
- `UnhandledPromiseRejectionWarning` - необработанный промис
- `ENOENT:` - файл не найден
- `FATAL` - критическая ошибка приложения
- `Segmentation fault` - crash процесса

### WARNING (требует внимания):
- `[WARN]:` - предупреждения приложения
- `[Infisical]` - проблемы с секретами (проверить Infisical Dashboard)
- `Error:` - общие ошибки (анализировать контекст)
- `ECONNREFUSED` - проблемы соединения с внешними сервисами
- `ETIMEDOUT` - таймаут соединения
- `TelegramError` - ошибки Telegram API
- `429 Too Many Requests` - rate limiting

### INFO (для контекста):
- `[INFO]:` - информационные сообщения
- `Bot started` - успешный старт бота
- `Webhook set` - webhook установлен
- `Health check passed` - health check прошёл

## Дополнительные проверки

### Статус контейнера:
```bash
ssh prod999 "docker ps | grep 999-multibots"
```

### Использование ресурсов:
```bash
ssh prod999 "docker stats 999-multibots --no-stream"
```

### Health check:
```bash
curl -s http://188.137.250.69:3001/health
```

### Последние ошибки с grep:
```bash
ssh prod999 "docker logs 999-multibots --tail 500 2>&1 | grep -E '(Error|ERROR|error|CRITICAL|TypeError|Cannot find|FATAL)' | tail -30"
```

### Restart контейнера (если нужно):
```bash
ssh prod999 "docker restart 999-multibots"
```

### Полный лог (последние 500 строк):
```bash
ssh prod999 "docker logs 999-multibots --tail 500 2>&1"
```

## ВАЖНО: Проверка всех Webhook'ов

### Проверить статус webhook'ов всех ботов:
```bash
curl -s http://188.137.250.69:3001/health | jq '.webhooks'
```

### Проверить webhook конкретного бота через Telegram API:
```bash
# Получить токен из логов и проверить
ssh prod999 "docker logs 999-multibots 2>&1 | grep -oP 'BOT_TOKEN=\K[0-9]+:[A-Za-z0-9_-]+' | head -1"
# Затем: curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

### Проверить webhook health через API сервера:
```bash
curl -s http://188.137.250.69:3001/api/webhooks/status
```

### Типичные проблемы webhook:
| Статус | Причина | Решение |
|--------|---------|---------|
| `pending_update_count > 100` | Очередь забита | Перезапустить контейнер |
| `last_error_message` | Ошибка webhook | Проверить SSL и URL |
| `has_custom_certificate: false` | Нет SSL | Проверить сертификат |
| `pending_update_count` растёт | Бот не обрабатывает | Проверить логи ошибок |

### Проверить Inngest webhook:
```bash
curl -s http://188.137.250.69:3001/api/inngest
```

## HTTPS домен (neuro-blogger.com)

### Проверить HTTPS сертификат:
```bash
curl -sI https://neuro-blogger.com/health | head -10
```

### Проверить SSL сертификат:
```bash
echo | openssl s_client -connect neuro-blogger.com:443 -servername neuro-blogger.com 2>/dev/null | openssl x509 -noout -dates
```

### Проверить webhook URL для ботов:
```bash
# Все боты должны использовать HTTPS URL:
# https://neuro-blogger.com/webhook/<bot_token>
curl -s https://neuro-blogger.com/health
```

### Проверить Nginx/reverse proxy статус:
```bash
ssh prod999 "nginx -t && systemctl status nginx --no-pager"
```

### Типичные проблемы HTTPS:
| Проблема | Причина | Решение |
|----------|---------|---------|
| `SSL certificate problem` | Истёк сертификат | `certbot renew` |
| `Connection refused` | Nginx не запущен | `systemctl restart nginx` |
| `502 Bad Gateway` | Backend не отвечает | Проверить Docker контейнер |
| `404 Not Found` | Неправильный proxy_pass | Проверить nginx config |

## После анализа

1. **Если CRITICAL ошибки** - немедленно предложи исправление или перебилдь Docker
2. **Если WARNING** - объясни причину и предложи решение
3. **Если всё ок** - ответь "Production работает нормально"

## Частые проблемы и решения

| Ошибка | Причина | Решение |
|--------|---------|---------|
| `Cannot find module` | Модуль не установлен или неправильный путь | `./deploy.sh production` |
| `ECONNREFUSED` | Внешний сервис недоступен | Проверить статус сервиса |
| `TelegramError: 409` | Конфликт webhook | Перезапустить контейнер |
| `Infisical error` | Проблемы с секретами | Проверить Infisical Dashboard |
| `ENOMEM` | Недостаточно памяти | Перезапустить контейнер |
