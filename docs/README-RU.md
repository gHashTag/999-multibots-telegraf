# 999-multibots-telegraf

## Структура проекта 🗂

Вся документация и Docker-файлы собраны в директории `docs/`:

### Документация 📄

- `README.md` - Основная документация проекта (на английском языке)
- `README-RU.md` - Документация на русском языке (этот файл)
- `DEPLOYMENT.md` - Инструкции по развертыванию
- `README_DEPLOYMENT.md` - Дополнительные инструкции по развертыванию
- `ROADMAP.md` - План развития проекта

### Docker-файлы 🐳

Все файлы, связанные с Docker, собраны в директории `docs/docker/`:

- `Dockerfile` - Основной файл для сборки образа
- `Dockerfile.dev` - Образ для разработки
- `Dockerfile.prod` - Образ для продакшена
- `Dockerfile.test` - Образ для тестирования
- `docker-compose.yml` - Основной файл docker-compose
- `docker-compose.*.yml` - Различные конфигурации docker-compose
- `nginx.conf` - Конфигурация NGINX
- `start.sh` - Скрипт запуска приложения
- `docker-entrypoint.sh` - Входная точка Docker

## Установка и запуск 🚀

### Локально

```bash
# Установка зависимостей
npm install

# Запуск в режиме разработки
npm run dev

# Запуск в продакшен режиме
npm start

# Запуск с помощью Docker
docker-compose up -d
```

### Удаленное развертывание

```bash
ssh -i ~/.ssh/id_rsa root@999-multibots-u14194.vm.elestio.app

cd /opt/app/999-multibots-telegraf
docker compose down
docker-compose up --build -d
```

## Безопасность 🔒

В проекте реализовано защищенное хранилище токенов с помощью модуля `tokenStorage`. Это обеспечивает изоляцию ботов и предотвращает компрометацию всех ботов при утечке одного токена.

## Конфигурация 🔧

Для настройки ботов используйте переменные окружения:
- `XXX_TOKEN` - токены для каждого бота
- `TOKEN_ENCRYPTION_KEY` - ключ шифрования для хранилища токенов

Подробные инструкции по конфигурации находятся в файлах `DEPLOYMENT.md` и `README_DEPLOYMENT.md`.

## Структура кода 📂

```
src/
├── core/                  # Ядро платформы
│   └── bot/               # Основные компоненты ботов
├── middleware/            # Промежуточное ПО для ботов
├── utils/                 # Утилиты для работы с ботами
│   ├── config.ts          # Загрузка и валидация конфигурации
│   ├── launch.ts          # Запуск ботов с обработкой ошибок
│   ├── logger.ts          # Система логирования
│   ├── tokenStorage.ts    # Безопасное хранилище токенов 
│   └── webhooks.ts        # Настройка вебхуков
├── multi.ts               # Точка входа для режима long polling
└── webhook.ts             # Точка входа для режима webhook
```

## Лицензия 📝

MIT 