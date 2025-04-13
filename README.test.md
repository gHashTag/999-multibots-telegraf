# Тестирование Telegram бота

## Обзор системы тестирования

Система тестирования предназначена для проверки функциональности различных сцен и компонентов Telegram бота. Тесты позволяют убедиться, что изменения не нарушают существующий функционал и что новые функции работают корректно.

## Структура тестов

- `src/test-utils/tests/scenes/*.test.ts` - тесты для сцен Telegram бота
- `src/test-utils/core/` - вспомогательные утилиты для тестирования
  - `mock.ts` - система мокирования функций
  - `mockContext.ts` - утилиты для создания мок-контекстов Telegram
  - `assertions.ts` - функции для проверки результатов
  - `types.ts` - типы и интерфейсы для тестирования

## Запуск тестов

### Особенности конфигурации проекта

В текущей конфигурации проекта существует конфликт между настройками ESM (ECMAScript modules) и CommonJS:
- `tsconfig.json` настроен для использования ESM (`"module": "es2022"`)
- `package.json` не содержит настройки `"type": "module"`

Из-за этого возникают ошибки при запуске тестов с помощью стандартных методов. Для обхода этой проблемы были созданы специальные скрипты запуска.

### Скрипты для запуска тестов

#### 1. Запуск всех тестов сцен

```bash
bash run-scene-tests.sh
```

Этот скрипт:
- Создает временную конфигурацию с настройкой `"module": "commonjs"`
- Копирует все тесты сцен во временную директорию
- Запускает тесты в изолированной среде
- Выводит детальные результаты
- Сохраняет логи в директории `logs/`

Для сохранения временных файлов после выполнения (полезно для отладки):

```bash
bash run-scene-tests.sh --keep
```

#### 2. Запуск отдельного теста для конкретной сцены

```bash
./run-single-test.sh <ИМЯ_СЦЕНЫ>
```

Например, для запуска тестов textToVideoWizard:

```bash
./run-single-test.sh textToVideoWizard
```

Этот скрипт особенно полезен при разработке новых тестов или отладке существующих, так как позволяет сосредоточиться на одной конкретной сцене без запуска всех тестов.

Опции скрипта:
- `--keep-temp` или `-k` - сохранить временные файлы после выполнения для детальной отладки

```bash
./run-single-test.sh textToVideoWizard --keep-temp
```

#### 3. Запуск тестов конкретной сцены с использованием предустановленных скриптов

```bash
bash run-textToVideoWizard-tests.sh
```

Этот скрипт аналогичен предыдущему, но запускает только тесты для конкретной сцены и сохраняет детальные логи.

### Интерпретация результатов

После запуска тестов скрипт выведет результаты в следующем формате:

```
📊 Результаты: Всего 7, Успешно: 7, Ошибки: 0
```

В случае ошибок будут показаны детали:

```
❌ Обнаружены ошибки в следующих тестах:
   - textToVideoWizard: Select Video Model: Expected function to have been called
```

Все результаты сохраняются в лог-файлах в директории `logs/`.

## Создание новых тестов

### Шаблон тестового файла

Для создания нового теста можно воспользоваться шаблоном, расположенным в `src/test-utils/templates/scene-test-template.ts`. Этот шаблон содержит базовую структуру тестового файла с примерами различных тестовых случаев.

```typescript
import { MyContext } from '@/interfaces';
import { createMockContext, createMockWizardContext } from '../../core/mockContext';
import { TestResult } from '../../core/types';
import { assertReplyContains } from '../../core/assertions';
import { create as mockFunction } from '../../core/mock';
import { TestCategory } from '../../core/categories';
import { logger } from '@/utils/logger';

// Мокированные функции
const mockedSomeFunction = mockFunction<typeof import('@/path/to/module').someFunction>();

// Константы для тестирования
const TEST_USER_ID = 123456789;

/**
 * Настройка тестовой среды
 */
function setupTest() {
  // Настройка моков
  mockedSomeFunction.mockReturnValue(Promise.resolve(true));
  
  // Сброс моков между тестами
  mockedSomeFunction.mockClear();
}

/**
 * Тест для проверки сценария X
 */
export async function testScenarioX(): Promise<TestResult> {
  try {
    setupTest();
    
    // Создаем мок-контекст
    const ctx = createMockWizardContext(0);
    ctx.from = { id: TEST_USER_ID, language_code: 'ru' } as any;
    
    // Запускаем тестируемую функцию
    const result = await someFunction(ctx as unknown as MyContext);
    
    // Проверки
    assertReplyContains(ctx, 'Ожидаемое сообщение');
    
    return {
      name: 'Название теста',
      category: TestCategory.All,
      success: true,
      message: 'Тест успешно пройден'
    };
  } catch (error) {
    logger.error('Ошибка в тесте:', error);
    return {
      name: 'Название теста',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Запуск всех тестов
 */
export async function runAllTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  try {
    results.push(await testScenarioX());
    // Добавьте другие тесты здесь
  } catch (error) {
    logger.error('Ошибка при запуске тестов:', error);
    results.push({
      name: 'Общая ошибка',
      category: TestCategory.All,
      success: false,
      message: String(error)
    });
  }
  
  return results;
}

export default runAllTests;
```

После создания нового тестового файла его нужно включить в `runScenesTests.ts` и, если нужно, создать отдельный скрипт запуска для этой сцены.

### Советы по написанию тестов

1. **Изоляция**: Каждый тест должен быть изолирован и не зависеть от результатов других тестов.
2. **Моки**: Используйте мокирование для всех внешних зависимостей.
3. **Константы**: Используйте константы вместо "магических строк".
4. **Обработка ошибок**: Всегда оборачивайте код тестов в try-catch и возвращайте информативные сообщения об ошибках.
5. **Логирование**: Используйте `logger` для отладочных сообщений.

## Устранение неполадок

### Типичные проблемы и их решения

#### Ошибка: Cannot use import statement outside a module

Эта ошибка связана с конфликтом между ESM и CommonJS. Используйте созданные скрипты для запуска тестов.

#### Ошибка: Cannot find module

Убедитесь, что путь к импортируемому модулю верный и что модуль существует. Проверьте, правильно ли настроены алиасы в tsconfig.json.

#### Ошибка: Property 'X' does not exist on type 'Y'

Проверьте, правильно ли вы типизировали мок-объекты и контексты. Возможно, вам нужно добавить свойство X в мок-объект или использовать правильный тип.

## Дополнительные ресурсы

- [Документация по Telegraf](https://telegraf.js.org/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Mocking в JavaScript](https://jestjs.io/docs/mock-functions) 