# 🧪 Тестовая система проекта

В этой директории находятся инструменты для комплексного тестирования всех компонентов системы, включая нейрофункции, базу данных, вебхуки, Inngest функции и другие модули.

## 🔄 Функциональный подход к тестированию

Новая система тестирования использует функциональный подход, предоставляя отдельные модули для различных аспектов тестирования:

- **assert** - модуль для проверки утверждений с богатым набором функций сравнения
- **mock** - модуль для создания заглушек функций и методов объектов
- **snapshot** - модуль для снапшот-тестирования с поддержкой разных форматов

Эти модули предоставляют чистый API в функциональном стиле, что делает тесты более читабельными и поддерживаемыми. Модули могут использоваться как внутри системы тестирования, так и независимо.

### Пример использования функциональных модулей

```typescript
import assert from '@/test-utils/core/assert';
import mock from '@/test-utils/core/mock';

// Создаем мок для функции
const mockFn = mock.create({
  returnValue: 'test'
});

// Используем мок
const result = mockFn();

// Проверяем результат
assert.strictEqual(result, 'test');
assert.isTrue(mockFn.called);
assert.strictEqual(mockFn.callCount, 1);
```

Подробнее о каждом модуле можно узнать в соответствующих разделах документации ниже.

## 📋 Структура проекта после реорганизации

```
test-utils/
├── index.ts                # Основная точка входа для запуска всех тестов
├── README.md               # Этот файл
│
├── core/                   # Базовые компоненты тестирования
│   ├── TestRunner.ts       # Оркестратор запуска тестов
│   ├── InngestFunctionTester.ts  # Базовый класс для тестеров Inngest функций
│   ├── categories.ts       # Категории и подкатегории тестов
│   ├── config.ts           # Конфигурация тестов
│   ├── environment.ts      # Настройки окружения
│   ├── runTests.ts         # Интерфейс запуска тестов новой системы
│   ├── setup.ts            # Базовые настройки тестов
│   ├── setupTests.ts       # Расширенные настройки тестов
│   └── types.ts            # Типы и интерфейсы для тестирования
│
├── tests/                  # Тесты по категориям
│   ├── neuro/              # Тесты нейрофункций
│   │   ├── text-to-video/  # Тесты текст-в-видео
│   │   ├── NeuroPhotoTester.ts   # Тестер для НейроФото
│   │   ├── NeuroPhotoV2Tester.ts # Тестер для НейроФото V2
│   │   ├── neuroPhotoTest.ts     # Тесты НейроФото
│   │   ├── neuroPhotoV2Test.ts   # Тесты НейроФото V2
│   │   └── README.md       # Документация по нейротестам
│   │
│   ├── database/           # Тесты базы данных
│   │   └── database-tests.test.ts  # Тесты БД Supabase
│   │
│   ├── webhooks/           # Тесты вебхуков
│   │   ├── webhook.test.ts      # Тесты Replicate вебхуков
│   │   ├── videoWebhook.test.ts # Тесты видео вебхуков
│   │   └── bfl-webhook-test-runner.test.ts  # Тесты BFL вебхуков
│   │
│   ├── inngest/            # Тесты Inngest-функций
│   │   └── InngestFunctionTester.ts  # Тестер для Inngest функций
│   │
│   ├── speech/             # Тесты аудио функций
│   │   ├── audio-tests.test.ts  # Тесты аудио функций
│   │   └── test-voices.test.ts  # Тесты голосовых функций
│   │
│   └── translations/       # Тесты переводов
│       └── translationTests.ts  # Проверка переводов
│
├── factories/              # Фабрики для создания тестовых данных
│   └── TestDataFactory.ts  # Фабрика тестовых данных
│
├── helpers/                # Вспомогательные функции
│   ├── api-client.ts       # Клиент для работы с API
│   ├── createMockContext.ts # Создание мок-контекста
│   └── createTestUser.ts    # Создание тестового пользователя
│
├── test-runners/          # Запускатели тестов старой системы
│   ├── test-runner.test.ts # Оригинальный скрипт запуска тестов
│   ├── run.test.ts         # Утилиты для запуска отдельных тестов
│   └── index.test.ts       # Тесты самой системы тестирования
│
├── inngest/                # Компоненты для тестов Inngest функций
│   ├── inngest-test-engine.ts  # Движок тестов Inngest
│   ├── inngest-tests.test.ts   # Тесты Inngest функций
│   └── inngest.ts              # Утилиты для Inngest тестов
│
├── mocks/                  # Моки для тестирования
├── payment/                # Тесты платежной системы
├── logs/                   # Логи тестов
└── testCases/              # Тестовые сценарии
```

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

### Подкатегории

Определены следующие подкатегории:

| Родительская категория | Подкатегория | Код | Описание |
|------------------------|--------------|-----|----------|
| Нейро | НейроФото | `neurophoto` | Тесты функции НейроФото |
| Нейро | НейроФото V2 | `neurophoto-v2` | Тесты функции НейроФото V2 |
| Нейро | Текст-в-видео | `text-to-video` | Тесты функции текст-в-видео |
| Вебхуки | Replicate Вебхук | `replicate-webhook` | Тесты вебхуков Replicate |
| Вебхуки | BFL Вебхук | `bfl-webhook` | Тесты вебхуков BFL |
| Вебхуки | НейроФото Вебхук | `neurophoto-webhook` | Тесты вебхуков НейроФото |
| Речь | Голосовой аватар | `voice-avatar` | Тесты голосовых аватаров |
| Речь | Текст-в-речь | `text-to-speech` | Тесты преобразования текста в речь |
| Inngest | Тренировка моделей | `model-training` | Тесты тренировки моделей |
| Система | Порты | `ports` | Тесты доступности и управления портами |

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

### Параметры командной строки

| Параметр | Сокращение | Описание |
|----------|------------|----------|
| `--help` | `-h` | Вывод справки по использованию |
| `--verbose` | `-v` | Подробный вывод результатов |
| `--category=<cat>` | `-c <cat>` | Запуск тестов из указанных категорий (через запятую) |
| `--only=<test>` | `-o <test>` | Запустить только указанные тесты (через запятую) |
| `--skip=<test>` | `-s <test>` | Пропустить указанные тесты (через запятую) |
| `--no-exit` | | Не завершать процесс после выполнения тестов |

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

## ✅ Как добавлять новые тесты

### Добавление нового теста в новую систему

1. Создайте тестер, наследуя от базового класса:

```typescript
// В директории tests/your-category
import { InngestFunctionTester } from '../../core/InngestFunctionTester'
import { TestDataFactory } from '../../factories/TestDataFactory'

export class MyNewTester extends InngestFunctionTester<MyInput, MyOutput> {
  constructor(options: any = {}) {
    super('my/event', {
      name: 'Мой тестер',
      ...options,
    })
  }

  // Метод для запуска конкретного теста
  async testSpecificCase(param: string): Promise<MyOutput> {
    const input = {
      param,
      // Другие параметры
    }
    return this.runTest(input)
  }

  // Обязательный абстрактный метод
  protected async executeTest(input: MyInput): Promise<MyOutput> {
    // Реализация тестирования
    // ...
    return result
  }
}
```

2. Добавьте новые тесты в `runTests.ts`:

```typescript
// В src/test-utils/core/runTests.ts

// Добавьте импорт
import { MyNewTester } from '../tests/your-category/MyNewTester'
import { TestCategory, isInCategory } from './categories'

// В функции runTests
export async function runTests(cliArgs: string[] = []): Promise<void> {
  // ...
  
  // Проверяем, нужно ли запускать новые тесты
  const shouldRunMyTests = isInCategory(TestCategory.MyCategory, args.category)

  if (shouldRunMyTests) {
    const myTester = new MyNewTester({
      verbose: args.verbose
    })

    runner.addTests([
      {
        name: 'Мой новый тест',
        category: 'МояКатегория',
        description: 'Описание нового теста',
        run: async () => await myTester.testSpecificCase('тестовый параметр')
      }
    ])
  }
  
  // ...
}
```

3. При необходимости добавьте новую категорию:

```typescript
// В src/test-utils/core/categories.ts
export enum TestCategory {
  // Существующие категории...
  
  // Добавляем новую
  MyCategory = 'my-category',
}
```

### Добавление теста в оригинальную систему

```typescript
// В новом файле tests/myTests.test.ts
import { logger } from '@/utils/logger'

export async function runMyTests() {
  try {
    logger.info('Запуск моих тестов')
    
    // Реализация тестов
    
    return { success: true }
  } catch (error) {
    logger.error('Ошибка при выполнении моих тестов', error)
    return { success: false, error }
  }
}

// Затем импортируйте и вызовите этот файл из test-runner.test.ts
```

## 🛠️ Общие соглашения

### Именование файлов

- Тестеры: `<Функциональность>Tester.ts` (например, `NeuroPhotoTester.ts`)
- Тесты: `<функциональность>-tests.test.ts` или `<функциональность>Test.ts` (например, `database-tests.test.ts`)
- Фабрики: `<Тип>Factory.ts` (например, `TestDataFactory.ts`)
- Моки: `<компонент>Mock.ts` (например, `SupabaseMock.ts`)

### Организация кода

1. **Тестовые файлы** размещаются в соответствующей категории внутри директории `tests/`
2. **Вспомогательные функции** располагаются в директории `helpers/`
3. **Абстрактные базовые классы** находятся в директории `core/`
4. **Реализации тестеров** располагаются в директории `testers/`
5. **Фабрики** находятся в директории `factories/`

### Правила документирования

1. Каждый тестер должен иметь JSDoc с описанием и примерами использования
2. Сложные тесты должны иметь подробные комментарии
3. Каждая категория тестов должна иметь README.md с описанием принципов тестирования

## 🚧 Тестовое окружение

### Подготовка окружения

1. Убедитесь, что у вас установлен Docker и Docker Compose
2. Проверьте доступность необходимых портов:
```bash
# Проверка доступности портов
npm run check:ports

# Автоматическое освобождение занятых портов
npm run free:ports
```
3. Скопируйте файл `.env.example` в `.env.test`:

```bash
cp .env.example .env.test
```

3. Настройте переменные окружения в `.env.test`:

```
NODE_ENV=test
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_KEY=test-service-key
INNGEST_EVENT_KEY=test-key
# Другие необходимые переменные...
```

### Запуск тестового окружения

```bash
# Запуск всего тестового окружения
docker-compose -f docker-compose.test.yml up -d

# Просмотр логов
docker-compose -f docker-compose.test.yml logs -f

# Остановка окружения
docker-compose -f docker-compose.test.yml down
```

## 📊 Анализ результатов

Система выводит подробные отчеты о выполнении тестов:

```
🏁 Результаты тестирования:
✅ Успешно: 45 тестов
❌ Ошибки: 2 теста
⏱️ Время выполнения: 12.5 сек
```

При ошибках выводится подробная информация:

```
❌ Ошибка в тесте "НейроФото генерация с промптом":
Не удалось получить ответ от API
Error: Request timeout after 5000ms
```

## 🚨 Устранение проблем

### Часто встречающиеся проблемы

1. **Ошибка подключения к Supabase**:
   - Проверьте доступность Supabase по указанному URL
   - Убедитесь, что ключи доступа настроены правильно
   - Запустите `docker-compose -f docker-compose.test.yml up -d supabase`

2. **Таймауты при тестировании API**:
   - Увеличьте таймаут в конфигурации (см. `core/config.ts`)
   - Проверьте доступность внешних сервисов

3. **Ошибки при тестировании Inngest функций**:
   - Запустите локальный Inngest сервер: `npx inngest-cli@latest dev`
   - Проверьте переменные окружения для Inngest

4. **Конфликты портов**:
   - Используйте `npm run check:ports` для проверки доступности портов
   - Если порты заняты, используйте `npm run free:ports` для их освобождения
   - Проверьте конфигурацию портов в `src/config/ports.ts`
   - При добавлении новых сервисов обновите список портов

### Советы по отладке

1. Добавьте флаг `--verbose` для получения подробной информации
2. Проверьте логи в директории `logs/`
3. Используйте `console.log` или логгер внутри тестов для вывода промежуточных результатов
4. Запускайте тесты изолированно, чтобы локализовать проблему

## 📦 Интеграция с CI/CD

Тесты автоматически запускаются в CI/CD пайплайне:

1. При открытии Pull Request запускаются базовые тесты
2. При слиянии в `main` запускаются все тесты
3. Результаты отправляются в систему мониторинга

### Настройка GitHub Actions

```yaml
name: Tests

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
      - uses: actions/setup-node@v3
        with:
          node-version: '16'
      - run: npm ci
      - run: npm run test:all
```

## 🔮 Дальнейшее развитие тестовой системы

Подробный план развития тестовой системы можно найти в файле [roadmap.md](./roadmap.md), который содержит список задач по улучшению инфраструктуры тестирования и чеклист для отслеживания прогресса. Основные направления развития:

1. **Полный переход на функциональную систему** с модулями assert, mock и snapshot
2. **Добавление визуализации результатов** тестирования
3. **Интеграция с CI/CD и системами мониторинга** для отслеживания регрессий
4. **Добавление параллельного выполнения** тестов для ускорения
5. **Улучшение генерации тестовых данных** через фабрики
6. **Автоматизация управления системными ресурсами**:
   - Автоматическая проверка и освобождение портов
   - Мониторинг использования системных ресурсов
   - Предотвращение конфликтов между сервисами

При обновлении системы тестирования рекомендуется отмечать выполненные пункты в файле roadmap.md, чтобы отслеживать прогресс и планировать дальнейшие улучшения.

---

## 🤔 Рекомендации и лучшие практики

1. **Изолируйте тесты** друг от друга, чтобы избежать взаимного влияния
2. **Используйте фабрики** для создания тестовых данных
3. **Мокайте внешние зависимости** для более быстрых и надежных тестов
4. **Группируйте тесты** по функциональности, а не по техническим деталям
5. **Документируйте назначение** каждого теста и его ожидаемое поведение
6. **Регулярно запускайте полный набор тестов** для выявления регрессий
7. **Обновляйте тесты** при изменении функциональности
8. **Добавляйте новые тесты** при разработке новых функций

---

**Остались вопросы?** Обратитесь к команде разработки или создайте issue в репозитории проекта.

---

# Расширенный тестовый фреймворк

Данный тестовый фреймворк предоставляет расширенные возможности для написания и запуска тестов, включая ассерты, моки, снапшоты и другие полезные инструменты.

## Основные возможности

- 🧪 **Декларативные тесты** с использованием декораторов
- 🔍 **Продвинутые ассерты** для проверки условий
- 🛠️ **Мокирование** методов и функций
- 📸 **Снапшот-тестирование** для фиксации и сравнения результатов
- 🕒 **Управление таймаутами** и асинхронными операциями
- 🏝️ **Песочница** для изолированного выполнения кода
- 🧰 **Удобные хелперы** для часто используемых операций
- 📊 **Генерация отчетов** в различных форматах

## Пример использования

```typescript
import { TestSuite, Test, BeforeAll, AfterAll } from './core/types';
import { expect, testContext } from './core/enhanced';

@TestSuite('My Test Suite')
class MyTests {
  @BeforeAll()
  async setup() {
    // Инициализация перед всеми тестами
  }

  @Test('should perform a basic test')
  async testBasic() {
    // Использование expect для проверки условий
    expect.toEqual(2 + 2, 4, 'Math should work');
    expect.toBeTrue(true, 'True should be true');
  }

  @Test('should handle async operations')
  async testAsync() {
    // Тест асинхронных операций
    const result = await expect.toResolve(
      Promise.resolve(42)
    );
    expect.toEqual(result, 42);
  }

  @AfterAll()
  async teardown() {
    // Очистка после всех тестов
  }
}
```

## Модули

### Assert (Утверждения)

Модуль `assert` предоставляет методы для проверки условий:

```typescript
import { assert } from './core/enhanced';

// Базовые проверки
assert.isTrue(value);
assert.isFalse(value);
assert.equal(actual, expected);
assert.notEqual(actual, expected);

// Проверки строк и массивов
assert.contains('Hello, world!', 'world');
assert.includes([1, 2, 3], 2);

// Проверки исключений
assert.throws(() => { throw new Error() });
assert.doesNotThrow(() => { /* code */ });

// Проверки промисов
await assert.resolves(promise);
await assert.rejects(promise, ErrorType);
```

### Mock (Мокирование)

Модуль `mock` предоставляет инструменты для мокирования объектов и функций:

```typescript
import { mock } from './core/enhanced';

// Мокирование метода объекта
const mockMethod = mock.method(obj, 'methodName', {
  returnValue: 42  // Устанавливаем возвращаемое значение
});

// Или с реализацией
mock.method(obj, 'methodName', {
  implementation: (arg1, arg2) => arg1 + arg2
});

// Проверка вызовов
console.log(mockMethod.called);         // Был ли вызван метод
console.log(mockMethod.callCount);      // Количество вызовов
console.log(mockMethod.callHistory);    // История вызовов с аргументами
console.log(mockMethod.calledWith(1, 2)); // Был ли вызван с указанными аргументами

// Восстановление оригинальных методов
mock.restore(obj);  // Восстанавливает все моки для объекта
mock.restore();     // Восстанавливает все моки
```

### Snapshot (Снапшоты)

Модуль `snapshot` предоставляет возможности снапшот-тестирования:

```typescript
import { snapshot } from './core/enhanced';

// Сравнение объекта со снапшотом
snapshot.toMatchSnapshot('snapshot-name', myObject);

// При первом запуске создаст снапшот
// При последующих запусках будет сравнивать с сохраненным снапшотом

// Для обновления снапшотов запустите тесты с переменной окружения:
// UPDATE_SNAPSHOTS=true npm test
```

### TestContext (Контекст тестов)
