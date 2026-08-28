# NeuroBlogger - Мультибот система на Telegraf

Многофункциональная система для управления несколькими Telegram-ботами через один сервер с поддержкой как webhook, так и long-polling режимов.

## 📋 Особенности

- 🤖 Поддержка множества ботов из одного приложения
- 🔐 Улучшенная изоляция ботов для безопасности
- 📊 Расширенное логирование для отладки
- 🔄 Поддержка webhook и long-polling режимов
- 🚀 Интеграция с Supabase для хранения токенов ботов
- 🐳 Docker-контейнеризация для простого развертывания

## 🛠 Технологии

- [Node.js](https://nodejs.org/) - JavaScript runtime
- [TypeScript](https://www.typescriptlang.org/) - Типизированный JavaScript
- [Telegraf](https://telegraf.js.org/) - Telegram Bot Framework
- [Supabase](https://supabase.com/) - База данных для хранения настроек ботов
- [Docker](https://www.docker.com/) - Контейнеризация
- [Nginx](https://nginx.org/) - Прокси-сервер для webhook

## 🚀 Быстрый старт

### Локальная разработка

```bash
# Установка зависимостей
npm install

# Запуск в режиме разработки с hot-reload
npm run dev
```

### Через Docker

```bash
# Запуск в режиме разработки
docker-compose -f docker-compose.dev.yml up

# Запуск в продакшене
docker-compose up -d
```

## 🔨 Структура проекта

```
.
├── src/                      # Исходный код
│   ├── core/                 # Базовые модули
│   │   ├── bot/              # Основная логика ботов
│   │   └── supabase/         # Интеграция с Supabase
│   ├── utils/                # Утилиты
│   │   └── launch.ts         # Логика запуска ботов
│   ├── interfaces/           # TypeScript интерфейсы
│   ├── scenes/               # Сцены для ботов
│   ├── multi.ts              # Точка входа для режима long polling
│   └── webhook.ts            # Точка входа для режима webhook
├── docker-compose.yml        # Основная Docker конфигурация
├── Dockerfile                # Основной Docker образ для продакшена
├── tsconfig.json             # TypeScript конфигурация
└── ROADMAP.md                # Roadmap проекта
```

## 🐳 Docker файлы

| Файл                       | Назначение                    |
| -------------------------- | ----------------------------- |
| Dockerfile                 | Основной образ для продакшена |
| Dockerfile.dev             | Образ для разработки          |
| Dockerfile.test            | Образ для тестирования        |
| docker-compose.yml         | Основная конфигурация         |
| docker-compose.dev.yml     | Конфигурация для разработки   |
| docker-compose.multi.yml   | Для множественных ботов       |
| docker-compose.test.yml    | Для тестирования              |
| docker-compose.webhook.yml | Для webhook режима            |

## 📋 Переменные окружения

Создайте файл `.env` на основе примера. Все значения ниже — плейсхолдеры, а не
рабочие ключи. Настоящие значения лежат в секретах и в репозиторий не коммитятся:

```bash
railway variables --kv | grep BOT_TOKEN
railway variables --kv | grep SUPABASE
```

```
# Токены ботов
BOT_TOKEN_1=1234567890:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
BOT_TOKEN_2=0987654321:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB

# Настройки сервера
PORT=3000
ORIGIN=https://your-domain.com

# База данных
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_KEY=your-supabase-key
```

## 📚 Документация

Для дополнительной информации о разработке и деплое проекта смотрите:

- [ROADMAP.md](ROADMAP.md) - План развития проекта
- [DEPLOYMENT.md](guides/DEPLOYMENT_GUIDE.md) - Инструкции по деплою

## 🧪 Тестирование

```bash
# Запуск тестов
npm test

# Запуск тестов через Docker
docker-compose -f docker-compose.test.yml up
```

## 📄 Лицензия

Этот проект распространяется под лицензией MIT. Подробнее см. в файле LICENSE.
