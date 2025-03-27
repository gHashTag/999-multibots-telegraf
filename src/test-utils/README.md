# Утилиты для тестирования

Данная директория содержит инструменты для тестирования различных компонентов системы.

## Структура

- `test-config.ts` - конфигурационный файл с настройками и тестовыми данными
- `test-runner.ts` - основной файл для запуска тестов
- `webhook-tests.ts` - тесты для веб-хуков Replicate
- `api-client.ts` - утилита для работы с API

## Использование

### Запуск всех тестов

```bash
ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts all
```

### Запуск конкретного типа тестов

```bash
ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts webhook
```

## Конфигурация

Настройки для тестов находятся в файле `test-config.ts`. Вы можете изменять значения в этом файле для тестирования различных сценариев.

### Тестирование веб-хуков

Для тестирования веб-хуков используются примеры из конфигурации:

1. Успешное завершение тренировки
2. Ошибка тренировки
3. Отмена тренировки

## Добавление новых тестов

Чтобы добавить новые типы тестов:

1. Создайте новый файл с тестами (например, `new-feature-tests.ts`)
2. Добавьте тестовые данные в `test-config.ts`
3. Обновите `test-runner.ts` для запуска новых тестов

## Примеры

### Тестирование веб-хука с пользовательскими данными

```typescript
import { ReplicateWebhookTester } from './webhook-tests';

const tester = new ReplicateWebhookTester();
const customPayload = {
  id: 'custom-training-id',
  model: 'ostris/flux-dev-lora-trainer',
  version: 'e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497',
  status: 'succeeded',
  output: {
    uri: 'https://example.com/model.tar',
  },
};

tester.sendWebhook(customPayload).then(result => {
  console.log(result);
});
```

### Использование API клиента

```typescript
import { ApiClient } from './api-client';

const client = new ApiClient();
client.checkApiHealth().then(isHealthy => {
  console.log(`API здоров: ${isHealthy}`);
});
``` 