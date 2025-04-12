# 🧪 Система тестирования проекта NeuroBlogger

## Общая информация

Проект использует собственную систему тестирования, основанную на модуле `src/test-utils`. 
Все тесты должны следовать принципам и паттернам, определенным в этом модуле.

## ⚠️ Важные моменты

1. Проект использует **собственный фреймворк для тестирования**, расположенный в директории `src/test-utils`
2. **НЕ** используется Jest или другие сторонние фреймворки!
3. Все тесты должны возвращать объект типа `TestResult`
4. Используйте логгер с эмодзи для улучшения читаемости логов

## Структура тестов

Все тесты находятся в директории `src/test-utils/tests/` и разделены по категориям:

- `payment` - тесты платежной системы
- `telegram` - тесты функциональности Telegram-бота
- `inngest` - тесты для событийной системы Inngest
- и другие категории

Исполняемые скрипты запуска тестов находятся в соответствующих поддиректориях:

- `src/test-utils/payment/` - скрипты запуска тестов платежной системы
- `src/test-utils/telegram/` - скрипты запуска тестов Telegram-бота
- и т.д.

## 🗂️ Категории тестов

В системе тестирования определены следующие категории:

| Категория | Код | Описание |
|-----------|-----|----------|
| Все тесты | `all` | Запуск всех доступных тестов |
| Нейро | `neuro` | Тесты для генерации изображений и видео |
| База данных | `database` | Тесты Supabase и операций с БД |
| Вебхуки | `webhook` | Тесты обработки вебхуков |
| Inngest | `inngest` | Тесты Inngest функций |
| Платежи | `payment` | Тесты платежной системы |
| Речь | `speech` | Тесты для аудио функций |
| API | `api` | Тесты REST API |
| Система | `system` | Тесты системных компонентов и конфигурации |

## 🚀 Запуск тестов

### Через NPM скрипты (рекомендуемый способ)

```bash
# Запуск всех тестов
npm run test:all

# Запуск тестов для функций нейро
npm run test:neuro

# Запуск тестов для вебхуков
npm run test:webhook

# Запуск тестов для базы данных
npm run test:database

# Запуск тестов inngest функций
npm run test:inngest

# Запуск тестов с подробным выводом
npm run test:verbose

# Запуск тестов переводов
npm run test:translations
```

### Через основную точку входа (index.ts)

```bash
# Запуск всех тестов
npx ts-node -r tsconfig-paths/register src/test-utils/index.ts

# Запуск тестов нейрофото
npx ts-node -r tsconfig-paths/register src/test-utils/index.ts --category=neuro

# Запуск с детальным выводом
npx ts-node -r tsconfig-paths/register src/test-utils/index.ts --verbose

# Запуск нескольких категорий
npx ts-node -r tsconfig-paths/register src/test-utils/index.ts --category=neuro,webhook
```

## Интерфейс TestResult

Все тесты должны возвращать результат в формате интерфейса TestResult:

```typescript
interface TestResult {
  success: boolean;
  message: string;
  name: string;
}
```

## Написание тестов

### Правильная структура теста

```typescript
import { TestResult } from '../types';
import { TEST_CONFIG } from '../test-config';

export async function runMyTest(): Promise<TestResult> {
  try {
    // Реализация теста
    return {
      success: true,
      message: 'Тест успешно пройден',
      name: 'Мой тест'
    };
  } catch (error) {
    return {
      success: false,
      message: error.message,
      name: 'Мой тест'
    };
  }
}
```

### Использование mock-функций

Вместо Jest.Mock используются собственные mock-функции:

```typescript
const createMockFn = () => () => {};

// Пример использования:
const mockFunction = createMockFn();
```

## 🔄 Две системы тестирования

Проект поддерживает две системы тестирования, которые объединены в единый интерфейс:

1. **Новая система** (через `runTests.ts`):
   - Использует фабрики тестовых данных
   - Имеет базовые классы для создания тестеров
   - Лучше организована и предназначена для масштабирования

2. **Оригинальная система** (через `test-runners/test-runner.test.ts`):
   - Поддерживает большинство существующих тестов
   - Имеет свои способы запуска тестов

Обе системы запускаются при вызове `index.ts`, что позволяет постепенно переводить тесты с оригинальной системы на новую.

## Запуск тестов в Docker

### Сборка Docker-образа для тестирования

```bash
docker-compose -f docker-compose.test.yml build
```

### Запуск тестового окружения

```bash
docker-compose -f docker-compose.test.yml up -d
```

### Запуск конкретных тестов внутри контейнера

```bash
docker exec neuro-blogger-telegram-bot-test npm run test:payment-processor
```

### Просмотр логов

```bash
docker logs -f neuro-blogger-telegram-bot-test
```

### Остановка и удаление тестового окружения

```bash
docker-compose -f docker-compose.test.yml down -v
```

## Логирование в тестах

Все операции должны логироваться с использованием эмодзи:
- ℹ️ Информационные логи
- ✅ Успешные операции
- ❌ Ошибки
- 🚀 Начало операции
- 🏁 Завершение
- 🔍 Шаги валидации
- ⚡ События Inngest
- 🎯 Тестовые случаи
- 🔄 Повторные попытки
- 💾 Операции с данными

## Запрещенные практики ⛔

- Использование Jest или синтаксиса Jest
- Создание тестов вне директории test-utils
- Использование Jest матчеров (expect, describe, it и т.д.)
- Файлы конфигурации Jest
- Jest-специфичные инструменты и плагины