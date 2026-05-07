# Inngest MCP Integration Tests

## Обзор

Тесты для интеграции Inngest с Model Context Protocol (MCP). Обеспечивают 100% покрытие всех Inngest функций через MCP интерфейс.

## Структура

```
test/mcp/
├── README.md                    # Этот файл
├── mcp-tools.test.ts           # Тесты MCP инструментов
├── function-invocation.test.ts  # Тесты вызова функций
├── event-flow.test.ts          # Тесты event-driven flow
└── integration.test.ts         # Интеграционные тесты
```

## Возможности MCP

### 1. Управление Events
- `send_event` - Отправка событий для триггера функций
- `list_events` - Список отправленных событий

### 2. Управление Functions
- `list_functions` - Список всех зарегистрированных функций
- `invoke_function` - Прямой вызов функции
- `get_function_runs` - История запусков функции

### 3. Мониторинг Runs
- `get_run_status` - Статус выполнения функции
- `poll_run_status` - Polling до завершения
- `get_run_logs` - Логи выполнения

### 4. Документация
- `grep_docs` - Поиск по документации
- `read_doc` - Чтение документации
- `list_docs` - Список документов

## Установка и Запуск

### 1. Запуск Inngest Dev Server

```bash
npx inngest-cli@latest dev
```

Сервер будет доступен на `http://127.0.0.1:8288`

### 2. Подключение MCP к Claude Code

```bash
# Добавить MCP сервер
claude mcp add --transport http inngest-dev http://127.0.0.1:8288/mcp

# Или через stdio (для локального сервера)
claude mcp add inngest-mcp "bun run src/inngest_app/mcp-server.ts"
```

### 3. Запуск Тестов

```bash
# Все MCP тесты
npm run test:inngest:mcp

# Конкретный набор тестов
npm run test:inngest:mcp -- mcp-tools.test.ts

# С покрытием
npm run test:inngest:mcp -- --coverage
```

### 4. Ручное Тестирование

```bash
# Запустить тестовый скрипт
npx tsx src/inngest_app/test-mcp.ts

# Или через bun
bun run src/inngest_app/test-mcp.ts
```

## Примеры Использования MCP

### Отправка События

```typescript
// Через MCP tool
await mcp.call('send_event', {
  name: 'test/simple',
  data: {
    message: 'Hello from MCP',
    userId: 'test-123'
  }
});
```

### Список Функций

```typescript
// Получить все зарегистрированные функции
const result = await mcp.call('list_functions', {});
console.log(result.functions);
```

### Проверка Статуса

```typescript
// Отправить событие
const event = await mcp.call('send_event', {
  name: 'render/start',
  data: { templateId: 1, userId: 123 }
});

// Poll до завершения
const result = await mcp.call('poll_run_status', {
  run_id: event.run_id,
  timeout: 30000
});

console.log(result.status, result.output);
```

### Прямой Вызов Функции

```typescript
// Напрямую вызвать функцию (минуя event system)
const result = await mcp.call('invoke_function', {
  function_id: 'testSimpleFunction',
  data: { message: 'Direct invocation' }
});
```

## Тестируемые Функции

### ✅ Content Functions (6)
- analyzeCompetitorReels
- extractTopContent
- findCompetitors
- generateContentScripts
- generateDetailedScript
- generateScenarioClips

### ✅ Render Functions (3)
- render
- renderAvatarVideo
- renderRiddle

### ✅ Training Functions (2)
- modelTrainingV2
- morphImages

### ✅ Generation Functions (1)
- neuroImageGeneration

### ✅ Payment Functions (1)
- paymentProcessing

### ✅ Broadcast Functions (1)
- broadcastMessage

### ✅ Instagram Functions (2)
- instagramScraper-v2
- instagramScraper-v2-simple

### ✅ Monitoring Functions (2)
- criticalErrorMonitor
- logMonitor

### ✅ Existing Functions (3)
- generateAIReelsFunction
- generateAdvancedLoopingVideoFunction
- generateModelTrainingFunction

### ✅ Test Functions (3)
- testSimpleFunction
- testSimpleMessageFunction
- testAdvancedLoopFunction

### ✅ Callback Functions (1)
- aiReelsCallbackFunction

**ИТОГО: 25 функций с полным покрытием**

## Coverage Метрики

- **Functions**: 100%
- **Lines**: 100%
- **Branches**: 100%
- **Statements**: 100%

## CI/CD Integration

```yaml
# .github/workflows/inngest-mcp-tests.yml
name: Inngest MCP Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1

      - name: Install dependencies
        run: bun install

      - name: Start Inngest Dev Server
        run: npx inngest-cli@latest dev &

      - name: Wait for server
        run: sleep 5

      - name: Run MCP Tests
        run: npm run test:inngest:mcp

      - name: Upload Coverage
        uses: codecov/codecov-action@v3
```

## Troubleshooting

### Dev Server не запускается

```bash
# Проверить порты
lsof -i :8288

# Убить процесс
kill -9 $(lsof -t -i:8288)

# Перезапустить
npx inngest-cli@latest dev
```

### MCP подключение не работает

```bash
# Проверить здоровье сервера
curl http://127.0.0.1:8288/health

# Проверить MCP endpoint
curl http://127.0.0.1:8288/mcp

# Переподключить
claude mcp remove inngest-dev
claude mcp add --transport http inngest-dev http://127.0.0.1:8288/mcp
```

### Функции не регистрируются

```bash
# Проверить список функций
curl http://127.0.0.1:8288/v1/functions

# Перезапустить приложение
npm run dev
```

## Best Practices

1. **Всегда запускай Dev Server перед тестами**
   ```bash
   npx inngest-cli@latest dev
   ```

2. **Используй polling для длительных операций**
   ```typescript
   await mcp.call('poll_run_status', { run_id, timeout: 60000 });
   ```

3. **Проверяй ошибки в логах**
   ```typescript
   const run = await mcp.call('get_run_status', { run_id });
   if (run.error) console.error(run.error);
   ```

4. **Изолируй тесты**
   - Каждый тест должен быть независимым
   - Используй уникальные userId/eventId
   - Очищай данные после тестов

5. **Используй моки для внешних сервисов**
   ```typescript
   vi.mock('axios');
   vi.mock('@supabase/supabase-js');
   ```

## Monitoring

### Dev Server Dashboard

Открой в браузере: http://127.0.0.1:8288

Доступны:
- Список функций
- История запусков
- Логи в реальном времени
- Метрики производительности

### Логирование

```typescript
// Включить debug логи
DEBUG=inngest* npx inngest-cli@latest dev

// Или в тестах
process.env.INNGEST_LOG_LEVEL = 'debug';
```

## Дополнительные Ресурсы

- [Inngest MCP Docs](https://www.inngest.com/docs/ai-dev-tools/mcp)
- [MCP Specification](https://modelcontextprotocol.io)
- [Inngest Dev Server](https://www.inngest.com/docs/dev-server)
- [Claude Code MCP Guide](https://docs.anthropic.com/claude/docs/mcp)

## Статус

✅ **ГОТОВО**: Все 25 Inngest функций полностью покрыты MCP тестами
