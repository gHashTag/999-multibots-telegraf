# Тестовые утилиты для проекта

В этой директории находятся инструменты для тестирования различных компонентов системы.

## Структура

```
test-utils/
├── test-config.ts      # Конфигурации для тестов
├── test-env.ts         # Настройки окружения для тестов
├── test-runner.ts      # Основной скрипт запуска тестов
├── webhook-tests.ts    # Тесты вебхуков Replicate
├── database-tests.ts   # Тесты базы данных
├── inngest-tests.ts    # Тесты Inngest функций
├── api-client.ts       # HTTP клиент для тестирования API
└── README.md           # Этот файл
```

## Запуск тестов

Для запуска тестов используйте команду:

```bash
ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts [тип-тестов]
```

Доступные типы тестов:
* `webhook` - Тесты вебхуков Replicate
* `database` - Тесты базы данных
* `inngest` - Тесты Inngest функций
* `neuro` - Тесты генерации изображений
* `function` - Тесты для конкретной Inngest функции
* `all` - Все тесты

### Примеры

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