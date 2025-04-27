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

### 📚 Тестовая экосистема

Проект использует современную экосистему тестирования на базе **Vitest 1.4+**. Подробная документация по тестированию доступна в [__tests__/README.md](./__tests__/README.md).

#### 🧰 Ключевые компоненты тестовой экосистемы:
- **Vitest** - Быстрый и гибкий фреймворк для тестирования
- **@vitest/ui** - Интерактивный интерфейс для анализа и отладки тестов
- **vitest-mock-extended** - Расширенные возможности моков
- **@vitest/coverage-v8** - Анализ покрытия кода тестами
- **vite-tsconfig-paths** - Поддержка алиасов путей из tsconfig

#### 🚀 Типы тестов:
- **Unit тесты** - Тестирование отдельных функций и компонентов
- **Integration тесты** - Тестирование взаимодействия компонентов
- **Scenario тесты** - Тестирование бизнес-сценариев пользователя
- **Snapshot тесты** - Проверка стабильности API и интерфейсов

#### 🧩 Структура тестов:
Тесты организованы по принципу зеркалирования структуры исходного кода, с дополнительными директориями для моков и утилит настройки.

#### 🔍 Решение распространенных проблем:
В тестовой документации собраны типичные проблемы и их решения, например, корректное использование enum-типов, настройка моков Telegraf и Supabase, создание тестовых контекстов и многое другое.

```bash
# Запуск всех тестов
pnpm vitest run

# Запуск с UI
pnpm vitest --ui

# Запуск с покрытием
pnpm vitest run --coverage
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

## Структура тестов

Тесты находятся в директории `__tests__` в корне проекта:

```
__tests__/
├── mocks/                  # Моки для внешних модулей
│   ├── telegraf.mock.ts    # Мок для API Telegraf
│   └── telegraf.jest.mock.ts  # Устаревший мок для Jest
├── scenes/                 # Тесты для сцен бота
│   └── menuScene.test.ts   # Тест для menuScene
├── core/                   # Тесты для core функционала
├── helpers/                # Тесты для вспомогательных функций
├── commands/               # Тесты для команд бота
├── setup.ts                # Общая настройка тестов
└── helper.ts               # Вспомогательные функции для тестов
```

### Конфигурация

Основная конфигурация для тестов находится в `vitest.config.ts`. Существуют также дополнительные файлы конфигурации для специфических случаев:

- `vitest.config.e2e.ts` - конфигурация для E2E тестов
- `vitest.config.js/mjs/mts` - альтернативные форматы конфигурации

### Запуск тестов

```bash
# Запуск всех тестов
pnpm vitest run

# Запуск конкретного теста
pnpm vitest run __tests__/scenes/menuScene.test.ts

# Запуск с покрытием кода
pnpm vitest run --coverage
```

## Правила написания тестов

1. **Структура тестов должна соответствовать структуре исходного кода**
   - Тесты для файла `src/scenes/menuScene.ts` должны быть в `__tests__/scenes/menuScene.test.ts`

2. **Моки должны быть в директории `__tests__/mocks`**
   - Используйте существующие моки где это возможно

3. **Порядок импортов и объявления моков**:
   ```typescript
   // Сначала объявляются моки
   vi.mock('telegraf', () => ({
     // мок для модуля
   }));
   
   // Затем импортируются мокированные модули
   import { Markup } from 'telegraf';
   ```

4. **TDD подход**:
   - Сначала напишите тест (красный) 🔴
   - Затем напишите код для прохождения теста (зеленый) ✅
   - Отрефакторьте код и тесты (рефакторинг) ♻️

Дополнительная информация о тестах находится в документе `.cursor/rules/tdd-workflow.mdc`.

## Common Testing Issues & Solutions

### 1. Проблема с порядком моков и импортов в Vitest

**Проблема:** При использовании `vi.mock()` для мокирования модуля Telegraf или других модулей в сочетании с переменными, определенными вне мока, возникает ошибка "Cannot access variable before initialization" из-за механизма hoisting (поднятия) vi.mock.

**Причина:** Вызовы `vi.mock()` "поднимаются" (hoisting) наверх файла и выполняются до импортов и других объявлений, даже если в коде они расположены после них. Это означает, что переменные, определенные в файле и используемые внутри `vi.mock()`, недоступны на момент выполнения мока.

**Решение:**

1. **Правильный порядок в тестах**:
   ```typescript
   // 1. Импорты тестовых библиотек
   import { describe, it, expect, vi, beforeEach } from 'vitest'
   
   // 2. Определение переменных и констант ДО моков
   const mockData = { id: 1, name: 'test' }
   
   // 3. Мокирование зависимостей
   vi.mock('telegraf', () => ({
     Markup: {
       keyboard: vi.fn().mockReturnThis(),
       // ...остальные методы
     },
     Scenes: {
       BaseScene: vi.fn().mockImplementation(function(sceneId) {
         // Реализация mock BaseScene
         return this
       }),
     },
   }))
   
   // 4. Мокирование внутренних модулей
   vi.mock('../../src/utils/logger', () => ({
     logger: {
       info: vi.fn(),
       error: vi.fn(),
     },
   }))
   
   // 5. Импорты тестируемых модулей (ПОСЛЕ всех моков)
   import { yourModule } from '../../src/yourModule'
   ```

2. **Альтернативный подход - использование `factory functions`**:
   ```typescript
   // Если нужно использовать переменную внутри мока:
   vi.mock('telegraf', () => {
     // Функция-фабрика, которая создает мок
     return {
       Markup: {
         keyboard: vi.fn().mockReturnThis(),
         // ...остальные методы
       },
     }
   })
   ```

3. **Для тестов с Telegraf создавать мок объекты напрямую**:
   ```typescript
   // Вместо импорта mocked menu scene, создаем свою мок-версию
   const mockMenuScene = {
     id: 'menuScene',
     enter: vi.fn(),
     leave: vi.fn(),
     // ...остальные методы
   }
   
   // И используем её в тестах напрямую
   describe('menuScene', () => {
     it('should handle enter', () => {
       mockMenuScene.enter(mockCtx)
       // assertions...
     })
   })
   ```

**Пример:** Смотрите полное решение в `__tests__/scenes/menuScene.test.ts`.

### 2. ESModule и CommonJS конфликты в тестах

**Проблема:** При импорте модулей в тестах возникают ошибки вроде "Cannot find module ... imported from ... " или "SyntaxError: Unexpected token 'export'", особенно если тестируются модули, использующие ESM синтаксис, а некоторые зависимости используют CommonJS.

**Причина:** Конфликт между ESM (import/export) и CommonJS (require/module.exports), который возникает из-за несоответствия в настройках TypeScript, Vite и Vitest.

**Решение:**

1. **Обновление конфигурации Vitest**:
   ```typescript
   // vitest.config.ts
   export default defineConfig({
     test: {
       // ...
       deps: {
         // Указывает, какие модули нужно трансформировать
         inline: ['telegraf'],
       },
     },
     resolve: {
       alias: {
         // Алиасы для проблемных модулей
         'telegraf/typings/scenes': path.resolve(__dirname, './__tests__/mocks/telegraf/typings/scenes'),
       },
     },
   })
   ```

2. **Создание моков для проблемных модулей**:
   ```typescript
   // __tests__/mocks/telegraf/typings/scenes/index.js
   module.exports = {
     BaseScene: class BaseScene {
       constructor(id) {
         this.id = id;
       }
       // ... методы
     },
     // ... другие классы
   }
   ```

3. **Использование моков напрямую вместо импорта**:
   ```typescript
   // Вместо импорта из модуля
   // import { Markup } from 'telegraf'
   
   // Создаем мок напрямую
   const Markup = {
     keyboard: vi.fn().mockReturnThis(),
     // ... другие методы
   }
   ```

**Пример:** Для полного решения смотрите `vitest.config.ts` и директорию `__tests__/mocks/`.
