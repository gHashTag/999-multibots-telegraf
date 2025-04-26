# 🚀 NeuroBlogger - Система на Telegraf.js

Система для управления несколькими Telegram-ботами через единый сервер.

## 🛠 Установка и запуск

### Установка

```bash
# Установка зависимостей
pnpm install
```

### Режимы запуска

```bash
# Стандартный режим разработки (с ESM и HMR)
pnpm dev

# Принудительный режим (игнорирует конфликты)
pnpm dev:force

# Сборка для продакшена
pnpm build:prod

# Запуск тестов
pnpm test
```

## 🔥 Оптимизированное окружение разработки (2025)

Проект использует современный стек технологий:

- **Vite 6+**: Сверхбыстрый сервер разработки и сборщик
- **ESM**: Нативная поддержка ES-модулей без transpile
- **HMR**: Горячая замена модулей без перезагрузки
- **Node.js 18+**: Современные возможности платформы

### Технические особенности

- Прямая поддержка `node:` модулей (fs, path и др.)
- Автоматическое разрешение зависимостей
- Улучшенная производительность сборки
- Полная поддержка TypeScript с алиасами
- Оптимизированные сорсмапы для отладки

## 📚 Структура проекта

```
src/
├── bot.ts                 # Основная точка входа
├── config.ts              # Конфигурация бота
├── scenes/                # Сцены для различных состояний бота
├── commands/              # Обработчики команд
├── core/                  # Ядро приложения
├── utils/                 # Вспомогательные функции
└── interfaces/            # TypeScript интерфейсы
```

## 📋 Переменные окружения

Создайте файл `.env`:

```
# Режим запуска
NODE_ENV=development      # development, production
POLLING=true              # true/false для переключения на long polling
WEBHOOK=false             # true/false для переключения на webhook

# Токены ботов (через запятую)
BOT_TOKENS=bot1_token,bot2_token

# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key

# Базовые настройки
PORT=3000
```

## 🧪 Тестирование

```bash
# Запуск всех тестов
pnpm test

# Запуск тестов с покрытием
pnpm test:coverage:open

# Запуск тестов в UI режиме
pnpm test:ui
```

## 🔨 Команды для разработки

```bash
# Проверка модулей Node.js
pnpm vite-node src/test-modules.ts

# Очистка кеша и временных файлов
pnpm clean

# Полная переустановка
pnpm reset
```

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

## 🛡️ Правила взаимодействия с Supabase (ЗОЛОТОЕ ПРАВИЛО!)

Чтобы обеспечить стабильность и предсказуемость при работе с базой данных, необходимо **строго** соблюдать следующие правила:

1.  **Типизация:** Всегда использовать TypeScript интерфейсы/типы для данных, получаемых из Supabase или отправляемых в него. Это помогает избегать ошибок типов на этапе компиляции.
2.  **Проверка аргументов:** Перед вызовом любой функции, взаимодействующей с Supabase, **обязательно** проверять наличие и корректность типов всех необходимых аргументов. Не передавать `undefined` или `null`, если функция их не ожидает.
3.  **Обработка ошибок:** Всегда проверять поле `error` в ответе от Supabase. Стандартизировать обработку: логировать саму ошибку (`error.message`, `error.details`, `error.code`), возвращать понятный результат (например, `null`, `false` или пустой массив) или пробрасывать исключение с информативным сообщением.
4.  **Подробное логирование:** Добавить логирование **до** и **после** каждого запроса к Supabase. Логировать:
    - Название вызываемой функции Supabase.
    - Ключевые параметры запроса (например, `telegram_id`, фильтры, обновляемые данные).
    - Результат операции (успех/ошибка).
    - Саму ошибку, если она произошла.
5.  **Использование `.maybeSingle()`:** При запросе одной записи, которая может отсутствовать, использовать `.maybeSingle()` вместо `.single()`. Это предотвращает ошибку, если запись не найдена, и возвращает `data: null`, что легче обработать.

**Ответственный за соблюдение правил:** Gemini (AI Ассистент)

## 🧠 База знаний проекта (ЗОЛОТОЕ ПРАВИЛО!)

**Цель:** Сохранять и структурировать знания, полученные в процессе разработки и отладки, чтобы ускорить решение будущих проблем и облегчить работу другим разработчикам (включая AI ассистентов).

**Правило:** После решения нетривиальной проблемы, исправления сложной ошибки или выявления полезного паттерна, **обязательно** документировать это в разделе `Common Testing Issues & Solutions` (или другом релевантном разделе) этого `README.md`.

**Формат:**

- **Проблема:** Краткое описание ошибки или трудности (например, конкретная ошибка TypeScript, проблема с моком).
- **Причина:** Объяснение, почему проблема возникала.
- **Решение:** Описание шагов, которые были предприняты для исправления, и/или правильный паттерн использования.
- **Пример:** (Опционально) Короткий фрагмент кода, иллюстрирующий решение.

**Ответственный:** Разработчик (или AI Ассистент), решивший проблему.

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

## 📚 Документация

Для дополнительной информации о разработке и деплое проекта смотрите:

- [ROADMAP.md](ROADMAP.md) - План развития проекта
- [DEPLOYMENT.md](DEPLOYMENT.md) - Инструкции по деплою

## 🧪 Тестирование

```bash
# Запуск тестов
pnpm vitest run --coverage

# Запуск тестов через Docker
docker-compose -f docker-compose.test.yml up
```

### 📝 Как мокать Supabase в тестах (Unit-тесты Jest)

Стабильное мокирование Supabase критически важно для юнит-тестов. Вот два рабочих подхода, которые мы использовали:

**1. Стандартный подход (`jest.mock` + `jest.fn`)**

Этот метод подходит для большинства случаев. Используется в `__tests__/core/supabase/updateUserBalance.test.ts`.

- **Мокаем цепочку вызовов:** В `describe` или `beforeEach` мокаем всю цепочку Supabase, которую использует тестируемая функция.

  ```typescript
  // Пример для функции, использующей supabase.from(...).select(...).eq(...).maybeSingle()
  const mockMaybeSingle = jest.fn<() => Promise<{ data: any; error: any }>>()
  const mockEq = jest.fn(() => ({ maybeSingle: mockMaybeSingle }))
  const mockSelect = jest.fn(() => ({ eq: mockEq }))
  jest.mock('@/core/supabase', () => ({
    supabase: {
      from: jest.fn(() => ({ select: mockSelect })), // Мокаем from и select
    },
  }))
  ```

- **Мокаем результат в тесте:** Внутри `it(...)` используем `mockResolvedValueOnce` на _последней функции в цепочке_, чтобы задать нужный ответ (`data` и `error`).

  ```typescript
  // Успешный ответ
  mockMaybeSingle.mockResolvedValueOnce({
    data: { id: 1, name: 'Test' },
    error: null,
  })

  // Ответ с ошибкой
  const dbError = new Error('DB error')
  mockMaybeSingle.mockResolvedValueOnce({ data: null, error: dbError })
  ```

- **❗Важно:** Убедитесь, что вы вызываете **оригинальную тестируемую функцию** (например, `updateUserBalance`) с **правильным количеством и типами аргументов**, как она ожидает. Ошибки часто возникают именно здесь, а не в самом моке!

**2. Альтернативный подход (`jest.spyOn`)**

Используйте этот метод, если возникают сложные проблемы с типами TypeScript при использовании `jest.mock` (как было в `__tests__/scenes/textToSpeechWizard.test.ts`).

- **Импортируем модуль:** Импортируйте весь модуль Supabase или модуль, содержащий нужную функцию.

  ```typescript
  import * as supabaseCore from '@/core/supabase'
  ```

- **Шпионим и мокаем в тесте:** Внутри `it(...)` используйте `jest.spyOn` для перехвата вызова конкретной функции и мокайте ее реализацию.

  ```typescript
  it('should get voice id', async () => {
    const getVoiceIdSpy = jest.spyOn(supabaseCore, 'getVoiceId').mockResolvedValueOnce('voice123');

    // ... остальной код теста ...

    expect(getVoiceIdSpy).toHaveBeenCalledWith(...);
  });
  ```

- **Очистка:** Не забывайте вызывать `jest.restoreAllMocks()` в `beforeEach` или `afterEach` при использовании `jest.spyOn`.

Следуя этим подходам, вы сможете надежно мокать Supabase и писать стабильные юнит-тесты.

### 🆘 Common Testing Issues & Solutions (Найденные проблемы и решения при тестировании)

Этот раздел содержит решения часто встречающихся проблем при написании тестов для этого проекта.

**1. Ошибка: `TS2540: Cannot assign to '...' because it is a read-only property.`**

- **Проблема:** Тест пытается напрямую присвоить значение свойству объекта контекста (`ctx.from = ...`, `ctx.message = ...`), которое создается как read-only.
- **Причина:** Утилита `makeMockContext` создает контекст с неизменяемыми свойствами после инициализации.
- **Решение:** **Не присваивать** значения напрямую `ctx.from`, `ctx.message`, `ctx.chat`, `ctx.botInfo` и т.д. Вместо этого, передавайте необходимые данные при вызове `makeMockContext`:
  - Данные обновления (`message`, `callback_query`) передаются в первом аргументе (`update`).
  - Данные сессии передаются во втором аргументе (`sessionData`).
  - Дополнительные свойства контекста (`botInfo`) передаются в третьем аргументе (`contextExtra`).
- **Пример:** Смотри секцию "Using `makeMockContext` Utility" выше.

**2. Ошибка: Неправильное мокирование Supabase (пример: `getUserBalance`)**

- **Проблема:** Тесты для `getUserBalance` падали или возвращали `0`, хотя моки `from().select().eq().single()` были настроены.
- **Причина:** Функция `getUserBalance` на самом деле использует `supabase.rpc('get_user_balance', ...)` для получения данных, а не цепочку `from/select`.
- **Решение:** Мокать нужно именно тот метод, который используется в тестируемом коде. В данном случае, мокать `supabase.rpc()`:
  ```typescript
  vi.mock('@/core/supabase/client', () => ({
    supabase: {
      rpc: vi.fn<
        (funcName: string, args: any) => Promise<{ data: any; error: any }>
      >(),
      // ... другие моки, если нужны ...
    },
  }))
  // ...
  const mockedRpc = supabase.rpc as vi.MockedFunction<typeof supabase.rpc>
  // ...
  // В тесте:
  mockedRpc.mockResolvedValue({
    data: 500,
    error: null,
    count: 1,
    status: 200,
    statusText: 'OK',
  })
  ```

**3. Ошибка: `TS2352: Conversion of type '...' to type 'Mock<...>' may be a mistake...` (Vitest)**

- **Проблема:** TypeScript не может сопоставить тип реальной функции с типом мока (`jest.Mock<...>`), особенно если возвращаемый тип сложный.
- **Причина:** Неточное указание типа в `as jest.Mock<...>` или несоответствие сигнатуры мока и реальной функции.
- **Решение:**
  - Убедиться, что тип, указанный в `jest.Mock<...>`, **точно** соответствует сигнатуре и возвращаемому типу **реальной** функции (включая все поля объекта, если функция возвращает объект).
  - Использовать `jest.MockedFunction<typeof myFunction>` вместо `jest.Mock<...>` для более строгой типизации.
  - Проверить, что мок-объект, передаваемый в `mockResolvedValueOnce`, имеет **все** поля, ожидаемые типом.

**4. Ошибка: `TypeError: Cannot read properties of undefined (reading 'reply')` (Vitest, beforeEach)**

- **Проблема:** Тесты падают с ошибкой `TypeError: Cannot read properties of undefined (reading 'X')` при попытке доступа к свойству мок-контекста (`mockCtx.X`) во время инициализации зависимостей (`mockDependencies`) внутри `beforeEach`.
- **Причина:** Неправильный порядок инициализации. Переменная `mockCtx` создается *после* того, как ее пытаются использовать для инициализации `mockDependencies`.
- **Решение:** Внутри `beforeEach` **сначала** создайте мок-контекст (`mockCtx = createMockTelegrafContext(...)`), а **затем** инициализируйте объект зависимостей (`mockDependencies = { ..., reply: mockCtx.reply, ... }`).
- **Пример:**
  ```typescript
  // В beforeEach:
  vi.clearAllMocks();

  // Сначала создаем mockCtx
  mockCtx = createMockTelegrafContext(...);

  // Затем инициализируем mockDependencies
  mockDependencies = {
    // ...
    reply: mockCtx.reply, // Теперь mockCtx определен
    // ...
  };

  // Настраиваем другие моки...
  mockGetUserDetailsSubscription.mockResolvedValue(...);
  ```

**5. Ошибка: `TypeError: mockXYZ.mockResolvedValue is not a function` (Vitest)**

- **Проблема:** Тест падает, сообщая, что переменная, которая должна быть моком (`mockXYZ`), не имеет метода `.mockResolvedValue` (или другого метода мока Vitest).
- **Причина:** Не замокирован модуль, из которого импортируется оригинальная функция `XYZ`. При импорте в тесте получается *оригинальная* функция, а не мок.
- **Решение:** Добавьте `vi.mock('path/to/module');` на верхнем уровне тестового файла, где `path/to/module` - это путь к файлу, который экспортирует функцию `XYZ`. Убедитесь, что в `beforeEach` или тесте вы импортируете функцию из *этого самого* модуля, чтобы получить мок.
- **Пример:**
  ```typescript
  // __tests__/myTest.test.ts
  import { myFunction } from '../src/myModule'; // Импортируем оригинальную функцию

  vi.mock('../src/myModule'); // Мокируем модуль

  describe('...', () => {
    let mockMyFunction: Mock;

    beforeEach(async () => {
      // Импортируем *замокированную* функцию
      const myModuleImport = await import('../src/myModule');
      mockMyFunction = myModuleImport.myFunction as Mock;
      // ...
      mockMyFunction.mockResolvedValue('mocked result'); // Теперь это работает
    });

    it('...', () => {
      // ...
    });
  });
  ```

**6. Ошибка: `TypeError: undefined is not a spy or a call to a spy!` (Vitest)**

- **Проблема:** Тест падает при проверке вызова мока (`expect(mockXYZ).toHaveBeenCalledWith(...)`), сообщая, что `undefined` не является шпионом.
- **Причина:** Переменная `mockXYZ`, используемая в `expect`, не является тем же экземпляром мока, который был фактически вызван тестируемым кодом. Часто это происходит, когда мок передается через объект зависимостей (`dependencies`), но в `expect` используется другой мок (например, импортированный глобально).
- **Решение:** Убедитесь, что в `expect` вы проверяете именно тот мок, который был передан в тестируемую функцию. Если функция принимает объект `dependencies`, проверяйте `expect(dependencies.mockXYZ).toHaveBeenCalledWith(...)`.
- **Пример:**
  ```typescript
  // В beforeEach:
  const mockSendMessage = vi.fn();
  const dependencies = {
    // ...
    sendMessage: mockSendMessage, // Передаем мок в зависимости
    // ...
  };

  // В тесте:
  await myFunction(data, dependencies);
  // Проверяем мок через объект зависимостей:
  expect(dependencies.sendMessage).toHaveBeenCalledWith(...);
  ```

## 🗂️ Устаревшие тесты (`__tests_deprecated__`)

В процессе рефакторинга и анализа покрытия кода тестами была создана директория `__tests_deprecated__`. В нее перемещены тесты, которые предположительно являются устаревшими или относятся к удаленному/измененному коду.

**Причина:** Некоторые тесты остались от предыдущих версий или были перенесены из других проектов и больше не соответствуют текущей структуре исходного кода. Чтобы избежать ложных срабатываний и сфокусироваться на актуальных тестах, они были изолированы.

**Содержимое:** В эту директорию были перемещены следующие файлы тестов:

- `__tests__/handlers/registerPaymentActions.test.ts`
- `__tests__/utils/configHelpers.test.ts`
- `__tests__/utils/menuHelpers.test.ts`
- `__tests__/handlers/handleSuccessfulPaymentFlow.test.ts`
- `__tests__/config/debugEnvLoading.test.ts`
- `__tests__/core/bot/moduleLoad.test.ts`
- `__tests__/core/bot/initEnv.test.ts`
- `__tests__/price/discount.test.ts`
- `__tests__/utils/setBotCommands.test.ts`
- `__tests__/core/bot/supportRequest.test.ts`
- `__tests__/core/openai/additionalOpenai.test.ts`
- `__tests__/menu/createGenerateImageKeyboard.test.ts`
- `__tests__/core/openaiHelpers.test.ts`
- `__tests__/utils/pureFunctions.test.ts`
- `__tests__/utils/configFile.test.ts`
- `__tests__/utils/getConfigEnv.test.ts`
- `__tests__/handlers/sample.test.ts`
- `__tests__/handlers/registerHearsActions.test.ts`
- `__tests__/handlers/paymentFlow.test.ts`
- `__tests__/menu/sendGenerationMessages.test.ts`
- `__tests__/price/sendMessages.test.ts`
- `__tests__/scenes/getEmailWizard.test.ts`
- `__tests__/scenes/generateImageWizard.test.ts`
- `__tests__/middlewares/subscriptionMiddleware.test.ts`
- `__tests__/config/debug.test.ts`
- `__tests__/core/bot/initialize.test.ts`

**Что делать:** Эти тесты не запускаются автоматически. При необходимости их можно проанализировать, обновить или удалить окончательно.

## 📄 Лицензия

Этот проект распространяется под лицензией MIT. Подробнее см. в файле LICENSE.

# NeuroBlogger Project

This is the main README for the NeuroBlogger project.

## Testing Strategy

We use Jest for unit and integration testing. Tests are located in the `__tests__` directory, mirroring the `src` structure.

### Using `makeMockContext` Utility

Many tests, especially for Telegraf scenes and middleware, require a mock context object. We use the `makeMockContext` utility found in `__tests__/utils/mockTelegrafContext.ts` for this purpose.

**Important:** Avoid `TS2540: Cannot assign to read-only property` errors!

The context object (`ctx`) created by `makeMockContext` has several properties (like `ctx.from`, `ctx.message`, `ctx.chat`, `ctx.botInfo`) that are intended to be read-only after creation. **Do not attempt to assign values directly to these properties in your tests.**

Instead, pass the necessary data **when calling** `makeMockContext`:

```typescript
import makeMockContext from '../utils/mockTelegrafContext'
import {
  User,
  Message,
  Chat,
  UserFromGetMe,
} from 'telegraf/typings/core/types/typegram'
import { MySession, MyContext } from '@/interfaces'

// Define your mock data
const mockFrom: User = {
  id: 123,
  is_bot: false,
  first_name: 'TestUser',
  language_code: 'en',
}
const mockChat: Chat.PrivateChat = {
  id: 123,
  type: 'private',
  first_name: 'TestUser',
}
const mockMessage: Partial<Message.TextMessage> = {
  text: 'Hello',
  from: mockFrom,
  chat: mockChat,
}
const mockSession: Partial<MySession> = { mode: 'test_mode' }
const mockBotInfo: Partial<UserFromGetMe> = {
  id: 1,
  is_bot: true,
  username: 'MyTestBot',
}

// Pass data correctly to makeMockContext
const ctx = makeMockContext(
  { message: mockMessage }, // Pass message/callback_query etc. in the first argument (update)
  mockSession, // Pass session data in the second argument
  { botInfo: mockBotInfo } // Pass extra context properties (like botInfo) in the third argument
)

// Now you can use ctx in your test, and ctx.from, ctx.message, etc. will have the correct values.
// For example:
expect(ctx.from.id).toBe(123)
expect(ctx.message?.text).toBe('Hello')
expect(ctx.botInfo?.username).toBe('MyTestBot')

// DO NOT DO THIS:
// ctx.from = { id: 456 }; // This will cause TS2540 error!
// ctx.message = { text: 'World' }; // This will cause TS2540 error!
```

By passing the data during creation, you ensure the mock context is set up correctly and avoid TypeScript errors.

_(This README will be updated as the project progresses)_

## 📊 Анализ Размера Бандла

Для анализа размера итогового бандла и выявления "тяжелых" зависимостей используется `rollup-plugin-visualizer`.

**Использование:**

1.  Запустите команду:
    ```bash
    pnpm run analyze:bundle
    ```
2.  Эта команда выполнит сборку проекта (`vite build`) с включенным плагином визуализатора.
3.  После завершения сборки в директории `dist/` будет создан файл `stats.html`.
4.  Откройте `dist/stats.html` в вашем браузере, чтобы увидеть интерактивную карту бандла.

Это поможет понять, какие модули вносят наибольший вклад в размер конечного файла `dist/bot.js`.
