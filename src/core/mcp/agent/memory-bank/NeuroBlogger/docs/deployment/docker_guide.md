# 🐳 Запуск проекта в Docker

Этот документ содержит инструкции по запуску проекта в Docker.

## 📋 Требования

- Docker
- docker-compose

## 🔧 Настройка

### 1. Переменные окружения

Создайте файл `.env` в корневой директории проекта со следующими переменными:

```
SUPABASE_URL=ваш_url
SUPABASE_SERVICE_KEY=ваш_ключ
STRIPE_SECRET_KEY=ваш_ключ
STRIPE_WEBHOOK_SECRET=ваш_ключ
HOST_URL=ваш_url
INNGEST_EVENT_KEY=ваш_ключ
INNGEST_SIGNING_KEY=ваш_ключ
OPENAI_API_KEY=ваш_ключ
ANTHROPIC_API_KEY=ваш_ключ
GOOGLE_API_KEY=ваш_ключ
GOOGLE_CSE_ID=ваш_id
CLOUDFLARE_ACCOUNT_ID=ваш_id
CLOUDFLARE_API_TOKEN=ваш_токен
TELEGRAM_BOT_TOKEN=ваш_токен
TELEGRAM_WEBVIEW_TOKEN=ваш_токен
REPLICATE_API_TOKEN=ваш_токен
MISTRAL_API_KEY=ваш_ключ
```

### 2. SSL сертификаты (опционально)

Для работы с HTTPS создайте директории для сертификатов:

```bash
mkdir -p certbot/conf certbot/www
```

## 🚀 Запуск

### Проверка конфигурации Docker

Перед запуском проверьте корректность настройки Docker:

```bash
npm run check:docker
```

### Запуск приложения

```bash
npm run docker:up
```

Или напрямую:

```bash
docker-compose up -d
```

### Проверка логов

```bash
npm run docker:logs
```

Или напрямую:

```bash
docker-compose logs -f
```

### Остановка приложения

```bash
npm run docker:down
```

Или напрямую:

```bash
docker-compose down
```

## 🧪 Запуск тестов

Для запуска тестов в Docker:

```bash
npm run test:docker
```

Это запустит тесты в изолированной среде Docker и отобразит результаты.

## 🔧 Конфигурация

Проект использует три основных файла конфигурации Docker:

1. **Dockerfile** - основной файл для сборки production образа
2. **docker-compose.yml** - конфигурация для запуска production среды
3. **Dockerfile.test** - файл для сборки тестового образа
4. **docker-compose.test.yml** - конфигурация для запуска тестовой среды

## 📁 Структура

```
├── Dockerfile            # Основной Dockerfile для production
├── Dockerfile.test       # Dockerfile для тестов
├── docker-compose.yml    # Конфигурация docker-compose для production
├── docker-compose.test.yml  # Конфигурация docker-compose для тестов
├── configs/
│   └── nginx.conf        # Конфигурация Nginx
├── scripts/
│   ├── check-docker.sh   # Скрипт для проверки Docker конфигурации
│   └── run-docker-tests.sh  # Скрипт для запуска тестов в Docker
└── certbot/              # Директория для SSL сертификатов
    ├── conf/             # Конфигурация сертификатов
    └── www/              # Веб-директория для проверки домена
```

## 🔍 Решение проблем

### Контейнер не запускается

Проверьте логи:

```bash
docker logs neuro-blogger-telegram-bot
```

### Проблемы с переменными окружения

Убедитесь, что файл `.env` существует и содержит все необходимые переменные.

### Проблемы с соединением к базе данных

Убедитесь, что переменные `SUPABASE_URL` и `SUPABASE_SERVICE_KEY` указаны корректно.

## SSH команды для управления

### Подключение к серверу

```bash
ssh -i ~/.ssh/id_rsa root@999-multibots-u14194.vm.elestio.app
```

### Перезапуск контейнеров

```bash
cd /opt/app/999-multibots-telegraf
docker compose down
docker-compose up --build -d
```

### Просмотр логов

```bash
docker logs -f 999-multibots
```

### Обновление из репозитория

```bash
cd /opt/app/999-multibots-telegraf
git pull
./update-docker.sh
```