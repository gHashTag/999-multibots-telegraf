# 🧪 Продвинутые Инструменты Тестирования для NeuroBlogger

В проекте NeuroBlogger используется набор современных инструментов для тестирования, обеспечивающих полное покрытие различных сценариев использования приложения.

## 🌐 vitest-fetch-mock: Тестирование API

`vitest-fetch-mock` предоставляет возможность тестирования HTTP-запросов без реальных сетевых вызовов.

### Настройка

Для предотвращения конфликтов между тестами, необходимо настраивать fetch-mock **локально в каждом тесте**. 
**ВАЖНО: Порядок импортов и настройки имеет решающее значение**:

```typescript
// В начале файла теста
// 1. Сначала импортируем необходимые модули
import { vi } from 'vitest'
import createFetchMock from 'vitest-fetch-mock'

// 2. Создаем и активируем fetch-mock ДО импорта fetch
const fetchMocker = createFetchMock(vi)
fetchMocker.enableMocks()

// 3. Только после этого импортируем fetch
import { fetch } from 'cross-fetch'

// 4. Теперь в тестах используем fetchMocker
// и запросы fetch будут перехватываться
```

### Примеры использования

```typescript
// Моделирование успешного ответа
fetchMocker.mockResponseOnce(JSON.stringify({ result: 'success' }))

// Моделирование ошибки
fetchMocker.mockRejectOnce(new Error('Network error'))

// Моделирование статуса HTTP
fetchMocker.mockResponseOnce(JSON.stringify({ error: 'Not found' }), { status: 404 })

// Последовательные ответы
fetchMocker
  .mockResponseOnce(JSON.stringify({ page: 1 }))
  .mockResponseOnce(JSON.stringify({ page: 2 }))

// Сброс моков перед/после каждого теста
beforeEach(() => {
  fetchMocker.resetMocks()
})

// Проверка вызовов
expect(fetchMocker).toHaveBeenCalledTimes(1)
expect(fetchMocker).toHaveBeenCalledWith('https://api.example.com/data')
```

Более подробный пример можно найти в `__tests__/examples/api-fetch.test.ts`.

## 🖥️ @vitest/browser: UI-тестирование

`@vitest/browser` позволяет запускать тесты в реальном браузерном окружении для тестирования UI-компонентов.

### Запуск тестов в браузере

```bash
# Запуск всех тестов в браузере
pnpm vitest --browser

# Запуск конкретных тестов в браузере
pnpm vitest --browser ui-components

# Выбор браузера
pnpm vitest --browser.name=firefox
```

### Настройка в файле конфигурации

В `vitest.config.ts` настроены параметры браузерного тестирования:

```typescript
browser: {
  enabled: false, // Включается флагом --browser в командной строке
  headless: true, // Запуск без видимого окна браузера
  name: 'chrome', // Используемый браузер (chrome, firefox, webkit)
}
```

## 📊 vitest-github-actions-reporter: CI/CD интеграция

`vitest-github-actions-reporter` обеспечивает интеграцию результатов тестов с GitHub Actions для улучшения визуализации в CI/CD пайплайнах.

### Автоматическая активация

Репортер настроен в `vitest.config.ts` и автоматически активируется при запуске в среде GitHub Actions:

```typescript
reporters: [
  'default',
  process.env.GITHUB_ACTIONS === 'true' 
    ? 'vitest-github-actions-reporter' 
    : ''
].filter(Boolean)
```

### Пример workflow-файла для GitHub Actions

```yaml
name: Run Tests

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      - name: Install dependencies
        run: pnpm install
      - name: Run tests
        run: pnpm vitest run
```

## 🔄 Полезные команды

```bash
# Запуск тестов с fetch-mock (настраивается локально)
pnpm vitest run

# Запуск тестов в браузере
pnpm vitest --browser

# Запуск тестов с отчетом для GitHub Actions (автоматически в CI)
GITHUB_ACTIONS=true pnpm vitest run

# Запуск тестов с покрытием кода
pnpm vitest run --coverage
```

## 📚 Дополнительные ресурсы

- [Документация vitest-fetch-mock](https://github.com/morrisjdev/vitest-fetch-mock)
- [Документация @vitest/browser](https://github.com/vitest-dev/vitest/tree/main/packages/browser)
- [Документация vitest-github-actions-reporter](https://github.com/Panenco/vitest-github-actions-reporter) 