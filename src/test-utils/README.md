# 🧪 Тестовые утилиты для проекта

В этой директории находятся инструменты для тестирования различных компонентов системы.

## 🐳 Запуск тестового окружения

### Подготовка окружения

1. Убедитесь, что у вас установлен Docker и Docker Compose
2. Скопируйте файл `.env.example` в `.env.test`:
```bash
cp .env.example .env.test
```
3. Настройте переменные окружения в `.env.test`

### Запуск тестового окружения

```bash
# Запуск всего тестового окружения
docker-compose -f docker-compose.test.yml up -d

# Просмотр логов
docker-compose -f docker-compose.test.yml logs -f

# Остановка окружения
docker-compose -f docker-compose.test.yml down
```

### 🔍 Проверка работоспособности

После запуска проверьте доступность сервисов:
- 🤖 Тестовый бот: порт 3008
- ⚡ Inngest Dev Server: http://localhost:8288
- 🌐 Nginx прокси: порт 8080/8443

### 🚨 Устранение проблем

Если тесты не проходят, проверьте:
1. Логи контейнеров:
```bash
docker-compose -f docker-compose.test.yml logs app
```

2. Статус сервисов:
```bash
docker-compose -f docker-compose.test.yml ps
```

3. Переменные окружения:
```bash
docker-compose -f docker-compose.test.yml exec app env
```

## 📁 Структура

```
test-utils/
├── test-config.ts         # Конфигурации для тестов
├── test-env.ts           # Настройки окружения для тестов
├── test-runner.ts        # Основной скрипт запуска тестов
├── webhook-tests.ts      # Тесты вебхуков
├── database-tests.ts     # Тесты базы данных
├── inngest-tests.ts      # Тесты Inngest функций
├── api-client.ts         # HTTP клиент для тестирования API
├── payment/             # Тесты платежной системы
│   ├── paymentProcessor.test.ts  # Тесты обработчика платежей
│   └── types.ts          # Типы для платежных тестов
├── audio/               # Тесты аудио функционала
│   ├── audio-tests.test.ts  # Тесты генерации аудио
│   └── types.ts          # Типы для аудио тестов
└── README.md            # Этот файл
```

## 🔄 Процесс тестирования

### 1. Подготовка тестов
```bash
# Запуск тестового окружения
docker-compose -f docker-compose.test.yml up -d

# Дождитесь полной инициализации (обычно 10-15 секунд)
sleep 15
```

### 2. Запуск тестов
```bash
# Вход в контейнер
docker-compose -f docker-compose.test.yml exec app bash

# Запуск всех тестов
pnpm test

# Или запуск конкретного набора тестов
ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts [тип-тестов]
```

### 3. Мониторинг результатов
- 📊 Результаты тестов выводятся в консоль
- 📝 Логи сохраняются в `/tmp/logs`
- 🔍 Проверьте статус в Inngest Dev Server UI

### 4. Очистка окружения
```bash
# После завершения тестов
docker-compose -f docker-compose.test.yml down
```

## 🚀 Запуск тестов

Для запуска тестов используйте команду:

```bash
ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts [тип-тестов]
```

Доступные типы тестов:
* `webhook` - Тесты вебхуков 🌐
* `database` - Тесты базы данных 💾
* `inngest` - Тесты Inngest функций ⚡
* `neuro` - Тесты генерации изображений 🎨
* `audio` - Тесты генерации аудио 🔊
* `payment` - Тесты платежной системы 💰
* `function` - Тесты для конкретной Inngest функции 🎯
* `all` - Все тесты ✨

### 📝 Примеры

Запуск только тестов вебхуков:
```bash
ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts webhook
```

Запуск только тестов Inngest:
```bash
ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts inngest
```

Запуск только тестов генерации изображений:
```bash
ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts neuro
```

Запуск тестов для конкретной функции:
```bash
ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts function hello-world
```

Запуск всех тестов:
```bash
ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts all
```

## 💰 Тестирование платежной системы

Класс `PaymentProcessor` позволяет тестировать обработку платежей:
- Пополнение баланса
- Списание средств
- Проверка достаточности средств
- Обработка ошибок при недостаточном балансе

Пример использования:
```typescript
const paymentTester = new PaymentProcessor();
const results = await paymentTester.runAllTests();
```

### Доступные тесты платежной системы:
- ✅ Успешное пополнение баланса
- ✅ Успешное списание средств
- ❌ Попытка списания при недостаточном балансе
- ✅ Проверка истории транзакций
- ✅ Проверка уведомлений о платежах

## 🔊 Тестирование аудио функционала

Класс `AudioTester` позволяет тестировать генерацию аудио:
- Генерация аудио из текста
- Проверка качества аудио
- Тестирование различных голосов
- Обработка ошибок

Пример использования:
```typescript
const audioTester = new AudioTester();
const results = await audioTester.runAllTests();
```

### Доступные аудио тесты:
- ✅ Генерация аудио из текста
- ✅ Проверка длительности аудио
- ✅ Тестирование разных голосов
- ✅ Проверка формата аудио
- ❌ Обработка некорректного текста

## Конфигурация

Настройки тестов находятся в файле `test-config.ts`. Здесь вы можете настроить:
- URL API сервера
- Тестовых пользователей
- Примеры данных для тестирования
- Прочие параметры

## Тестирование вебхуков Replicate

Класс `ReplicateWebhookTester` позволяет тестировать обработку вебхуков от сервиса Replicate. 
Он отправляет POST-запросы на эндпоинт `/webhooks/replicate` с эмуляцией различных статусов (успех, ошибка, отмена).

Пример использования:
```typescript
const webhookTester = new ReplicateWebhookTester();
const results = await webhookTester.runAllTests();
```

## Тестирование базы данных

Класс `DatabaseTester` проверяет подключение к базе данных и выполнение основных операций:
- Проверка соединения
- Поиск тренировок по ID
- Получение списка тренировок пользователя

Пример использования:
```typescript
const dbTester = new DatabaseTester();
const results = await dbTester.runAllTests();
```

## Тестирование Inngest функций

Класс `InngestTester` позволяет тестировать функции Inngest, используемые для фоновой обработки задач:
- Отправка событий в Inngest Dev Server
- Прямой вызов функций через Inngest Dev Server
- Тестирование функции тренировки модели

Для работы тестов необходимо запустить Inngest Dev Server:
```bash
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

Пример использования:
```typescript
const inngestTester = new InngestTester();
const results = await inngestTester.runAllTests();
```

### Доступные функции для тестирования

В системе можно тестировать следующие Inngest функции:
- `hello-world` - Простая тестовая функция
- `broadcast` - Функция массовой рассылки
- `payment` - Функция обработки платежей
- `model-training` - Функция тренировки моделей
- `model-training-v2` - Функция тренировки моделей v2
- `neuro` - Функция генерации изображений

### Тестирование конкретной функции

```typescript
const inngestTester = new InngestTester();
const results = await inngestTester.runSpecificFunctionTests('hello-world');
```

### Тестирование генерации изображений

```typescript
const inngestTester = new InngestTester();
const results = await inngestTester.runImageGenerationTests();
```

### Прямой вызов функции тренировки модели

```typescript
const inngestTester = new InngestTester();
const result = await inngestTester.testModelTrainingDirectInvoke();
```

### Отправка события для запуска тренировки

```typescript
const inngestTester = new InngestTester();
const result = await inngestTester.testModelTraining();
```

### Тестирование всех Inngest функций по отдельности

Для более детального тестирования всех Inngest функций можно использовать специальный скрипт, который запускает тесты для каждой функции по отдельности и выводит подробную статистику:

```bash
ts-node -r tsconfig-paths/register src/test-utils/test-all-inngest.ts
```

Этот скрипт последовательно запускает тесты для всех Inngest функций:
1. hello-world
2. broadcast
3. payment
4. model-training
5. model-training-v2
6. neuro

И выводит статистику по каждой функции, а также общую сводку по всем тестам.

## API клиент для тестирования

Класс `ApiClient` предоставляет упрощенный интерфейс для тестирования API:
- Методы GET, POST, PUT, DELETE
- Автоматическая обработка JSON
- Логирование запросов и ответов

Пример использования:
```typescript
const apiClient = new ApiClient('http://localhost:3000');
const response = await apiClient.get('/api/users');
``` 