# Настройка Inngest для работы в разных окружениях

## Обзор

Inngest используется для обработки асинхронных событий в нашем приложении. Для правильной работы Inngest необходимо настроить соответствующие URL в зависимости от среды запуска.

## Переменные окружения

В файле `.env` настроены следующие переменные:

```
# Основной URL для Inngest API (используется в продакшене)
INNGEST_URL=https://api.inngest.com

# Ключ для отправки событий
INNGEST_EVENT_KEY=your_event_key

# Ключ для подписи вебхуков
INNGEST_SIGNING_KEY=your_signing_key

# URL для локального запуска Inngest Dev Server
INNGEST_BASE_URL=http://localhost:8288

# URL для запуска Inngest Dev Server в Docker
INNGEST_BASE_DOCKER_URL=http://host.docker.internal:8288
```

## Особенности работы в разных окружениях

### Локальный запуск

При локальном запуске приложения и Inngest Dev Server на одной машине используется URL `http://localhost:8288`. Это позволяет приложению подключаться к Inngest Dev Server через localhost.

Команда для запуска:
```bash
npm run dev
```

### Запуск в Docker

При запуске в Docker-контейнере для доступа к хост-машине используется специальный доменное имя `host.docker.internal`. Это позволяет приложению в контейнере подключаться к Inngest Dev Server, запущенному на хост-машине.

В `docker-compose.yml` автоматически устанавливается переменная `DOCKER_ENVIRONMENT=true`, которая указывает приложению использовать URL `http://host.docker.internal:8288` вместо `http://localhost:8288`.

Команда для запуска:
```bash
docker-compose up -d
```

## Как это работает

1. При инициализации клиента Inngest в файле `src/inngest-functions/clients.ts` происходит проверка переменной окружения `DOCKER_ENVIRONMENT`.
2. Если `DOCKER_ENVIRONMENT=true`, используется URL из `INNGEST_BASE_DOCKER_URL` (по умолчанию `http://host.docker.internal:8288`).
3. Если `DOCKER_ENVIRONMENT` не установлен, используется URL из `INNGEST_BASE_URL` (по умолчанию `http://localhost:8288`).

## Диагностика проблем

Если возникают проблемы с подключением к Inngest, проверьте следующие моменты:

1. Убедитесь, что Inngest Dev Server запущен и работает на порту 8288.
2. Проверьте логи на наличие ошибок связанных с подключением к Inngest.
3. При запуске в Docker убедитесь, что `DOCKER_ENVIRONMENT=true` установлена в контейнере.
4. Проверьте, что переменные `INNGEST_BASE_URL` и `INNGEST_BASE_DOCKER_URL` правильно настроены в `.env` файле.

## Примеры логов

В случае успешной инициализации в логах будет следующая информация:

```
📌 Используем URL для Inngest {
  "description": "Using Inngest URL",
  "is_docker": true,  // или false при локальном запуске
  "base_url": "http://host.docker.internal:8288", // или "http://localhost:8288" при локальном запуске
  "dev_server_url": "http://host.docker.internal:8288/e/dev-key",
  "timestamp": "2025-04-11T16:11:10.384Z"
}
``` 