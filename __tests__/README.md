# 🕉️ Руководство по Тестированию Проекта NeuroBlogger

**Дата:** 30.04.2025

Этот документ служит руководством для написания и поддержки автоматических тестов в проекте NeuroBlogger, помогая обеспечить качество кода, удобство обслуживания и сократить регрессии.

## 🎯 Цель

Наша основная цель – достичь **100% покрытия кода** тестами для директории `src`.

## 🛠️ Инструменты

*   **Тестовый фреймворк:** [Vitest](https://vitest.dev/)
*   **Мокирование:** `vi.mock`, `vi.fn()` (встроенные в Vitest), кастомные моки в `__tests__/mocks/setup.ts`.
*   **UI для тестов:** `@vitest/ui`

## 🚀 Запуск Тестов

*   **Запустить все тесты один раз с отчетом о покрытии:**
    ```bash
    pnpm vitest run --coverage
    ```
*   **Запустить тесты в интерактивном режиме (UI):**
    ```bash
    pnpm test:ui
    ```
    *(Откройте указанный URL в браузере)*

## 🧘‍♂️ Рабочий Процесс: TDD (Test-Driven Development)

Мы строго следуем принципам Разработки Через Тестирование (TDD). Подробное описание рабочего процесса находится в правиле: `.cursor/rules/tdd-workflow.mdc`.

**Кратко:**
1.  🔴 **Красный:** Напишите тест, описывающий новую функциональность или баг. Убедитесь, что он **падает**.
2.  ✅ **Зеленый:** Напишите **минимальный** код, чтобы тест прошел.
3.  ♻️ **Рефакторинг:** Улучшите код и тесты, сохраняя все тесты зелеными.

## 📁 Структура Тестов

*   **Расположение:** Все тестовые файлы должны находиться в директории `__tests__` в корне проекта.
*   **Зеркалирование:** Структура директорий внутри `__tests__` должна **зеркально отражать** структуру директории `src`.
    *   *Пример:* Тест для `src/scenes/startScene/index.ts` находится в `__tests__/scenes/startScene.test.ts`.
    *   *Пример:* Тест для `src/helpers/language.ts` находится в `__tests__/helpers/language.test.ts`.

## 🎭 Мокирование (Mocking)

*   **Глобальные моки:** Общие моки (например, для Supabase, логгера) настраиваются в `__tests__/mocks/setup.ts`. Этот файл автоматически загружается Vitest (см. `vitest.config.ts`).
*   **Локальные моки:** Для мокирования зависимостей конкретного модуля используйте `vi.mock('путь/к/модулю')` в начале тестового файла.

## 📊 Текущий Прогресс (User Flow)

### P0: Вход и Регистрация
*   ✅ Функция `isRussian` (`src/helpers/language.ts`) протестирована (`__tests__/helpers/language.test.ts`).
*   ✅ Сцена `/start` (`src/scenes/startScene/index.ts`) имеет базовые тесты для нового и существующего пользователя (`__tests__/scenes/startScene.test.ts`), тесты **проходят**.
    *   Покрытие для `startScene/index.ts`: **58.45%** (требуется улучшение).

### P1: Главное Меню
*   ✅ Сцена `menuScene` (`src/scenes/menuScene/index.ts`) полностью протестирована (`__tests__/scenes/menuScene.test.ts`), **все тесты проходят**.
    *   Покрытие для `menuScene/index.ts`: **100%**
    *   Тесты охватывают:
        * ✅ Получение данных пользователя (getUserDetailsSubscription)
        * ✅ Получение переводов (getTranslation)
        * ✅ Генерацию клавиатуры (mainMenu)
        * ✅ Определение русского языка (isRussian)
        * ✅ Обработку нажатий кнопок
        * ✅ Обработку текстовых команд
        * ✅ Обработку ошибок

### P2-P5: Другие Компоненты
*   ⏳ Остальные компоненты согласно плану (см. `.cursor/rules/current-task.mdc`) ожидают тестирования.

## 🙏 Как Помочь (Contribution Guide)

1.  **Выберите Задачу:** Найдите следующую приоритетную задачу по тестированию (обычно с меткой ⏳ или 📝) в `ROADMAP.md` или правиле `current-task.mdc`.
2.  **Создайте Тест (🔴):** Следуя структуре, создайте тестовый файл (если его нет) и напишите один или несколько тестов, описывающих ожидаемое поведение. Запустите тесты и убедитесь, что они падают.
3.  **Реализуйте Функционал (✅):** Если вы пишете тест для новой функции, реализуйте минимальный код в `src`, чтобы тест прошел. Если тест для существующей функции, убедитесь, что она работает как ожидается.
4.  **Рефакторинг (♻️):** Улучшите код и тесты.
5.  **Проверьте Покрытие:** Запустите `pnpm vitest run --coverage` и посмотрите, как увеличилось покрытие.
6.  **Обновите Документы:**
    *   Отметьте выполненную задачу в `ROADMAP.md`.
    *   Обновите статус и процент покрытия в этом `README.md` (если применимо).
    *   Если вы столкнулись с новой проблемой и решили ее, добавьте описание в раздел "Частые Проблемы и Решения" ниже.

## 🐛 Частые Проблемы и Решения (Common Testing Issues & Solutions)

*Этот раздел предназначен для обмена знаниями о решенных проблемах, чтобы другие не тратили время на их повторное решение.*

1.  **Проблема:** Ошибки типов `TS2345: Argument of type 'MyContext' is not assignable to parameter of type 'string'` (или наоборот) при вызове функции `isRussian`.
    *   **Контекст:** Изначально `isRussian` принимала `languageCode: string | undefined`. Было решено изменить ее сигнатуру на `isRussian(ctx: MyContext)` для единообразия вызовов по всему проекту.
    *   **Решение:**
        *   **Функция:** Сама функция `isRussian` в `src/helpers/language.ts` теперь должна принимать `ctx: MyContext` и извлекать `ctx.from?.language_code` внутри.
        *   **Вызовы:** Все вызовы в коде (`src/...`) должны использовать `isRussian(ctx)`.
        *   **Тесты:** Тесты для самой `isRussian` (`__tests__/helpers/language.test.ts`) должны создавать мок-контекст (`createMockContext`) и передавать его в `isRussian`. Тесты для других модулей, мокирующих `isRussian`, должны учитывать новую сигнатуру при проверке вызовов или предоставлении мок-реализации.

2.  **Проблема:** Тест на обработку гонки условий (`race condition`, ошибка `23505`) при создании пользователя (`createUser`) падает с различными ошибками (ожидался объект, а получен `null`, или `logger.warn is not a function`, или `AssertionError: expected "spy" to be called 1 times, but got 2 times`).
    *   **Контекст:** Логика `createUser` должна при возникновении ошибки уникальности (`23505`) при `.insert()` повторно найти пользователя через `.select()`. Тестирование этой ветки требует точного мокирования Supabase и логгера.
    *   **Решение (многоэтапное):**
        *   **Логика `createUser`:** Убедиться, что проверка `(error as any)?.code === '23505'` и последующий повторный поиск пользователя находятся внутри блока `catch` после вызова `await supabase.from('users').insert(...).single()`, так как `.single()` при ошибке БД отклоняет (rejects) промис.
        *   **Мок Логгера:** Убедиться, что мок для `logger` в `__tests__/mocks/setup.ts` включает все используемые методы, в частности `warn: vi.fn()`.
        *   **Мок Supabase (`user.test.ts`):**
            *   Мок для `.insert(...).select().single()` должен быть настроен так, чтобы *первый* вызов `.single()` (после insert) *отклонялся* (rejected) с ошибкой, имеющей `.code = '23505'`. (`mockSingle.mockRejectedValueOnce(createError)`).
            *   Мок для `.select().eq().single()` (для повторного поиска внутри `catch`) должен быть настроен так, чтобы *второй* вызов `.single()` *успешно разрешался* (resolved) с данными найденного пользователя. (`mockSingle.mockResolvedValueOnce({ data: raceFoundUser, error: null })`).
        *   **Проверка в Тесте:** Вместо проверки `expect(insertSingleMock).toHaveBeenCalledTimes(1)` (где `insertSingleMock` - это `.single()` после `insert().select()`), которая некорректна из-за переиспользования общего мока `single`, достаточно проверить, что `mockInsert` был вызван 1 раз, `select` после `insert` был вызван 1 раз, и общий мок `single` был вызван 2 раза (1 раз для неудавшегося insert, 1 раз для успешного re-find). Это подтверждает, что ветка обработки гонки условий была пройдена.

3.  **Проблема:** Ошибка "if using the vi.mock factory, there should be no top-level variables inside" при импорте модулей после `vi.mock`.
    *   **Контекст:** Происходит из-за неправильного порядка импортов и моков в тестах. 
    *   **Решение:**
        *   Все импорты модулей, которые будут мокированы, должны идти **перед** вызовами `vi.mock()`.
        *   После всех `vi.mock()` должны идти импорты тестируемых модулей.
        *   Порядок имеет значение, так как Vitest "поднимает" (hoists) вызовы `vi.mock()` в начало файла.

4.  **Проблема:** Ошибка "Cannot find module 'telegraf/typings/core/types/typegram' imported from '/path/to/src/file.ts'" при запуске тестов.
    *   **Контекст:** Эта ошибка возникает из-за несоответствия между ESM (используемым Vitest) и CommonJS (используемым некоторыми частями проекта или зависимостями).
    *   **Решение:**
        *   **Создать моки**: Для всех проблемных модулей создайте моки в директории `src/test/mocks/`. Например, `src/test/mocks/typegram.mock.ts` для имитации `telegraf/typings/core/types/typegram`.
        *   **Обновить алиасы в vitest.config.ts**: Добавьте алиасы для проблемных модулей:
            ```typescript
            resolve: {
              alias: [
                {
                  find: 'telegraf/typings/core/types/typegram',
                  replacement: path.resolve(__dirname, 'src/test/mocks/typegram.mock.ts'),
                }
              ]
            }
            ```
        *   **Установить vite-tsconfig-paths**: `pnpm add -D vite-tsconfig-paths` и добавить его в плагины:
            ```typescript
            import tsconfigPaths from 'vite-tsconfig-paths';
            
            export default defineConfig({
              plugins: [tsconfigPaths()],
              // ... остальная конфигурация
            });
            ```
        *   **Модификация тестов**: В случае продолжающихся проблем, рассмотрите создание минимальных тестов, которые избегают импорта проблемных модулей, используя вместо этого прямые моки тестируемого объекта:
            ```typescript
            // Вместо импорта
            // import { menuScene } from '../../src/scenes/menuScene';
            
            // Создаем мок для menuScene
            const mockMenuScene = {
              id: 'menuScene',
              enterHandler: vi.fn(),
              // ... остальные методы и свойства
            };
            
            // Мокируем импорт
            vi.mock('../../src/scenes/menuScene', () => {
              return {
                menuScene: mockMenuScene
              };
            });
            ```

---
*Ом Шанти. Пусть этот документ освещает путь к чистому и проверенному коду.*

## P1: Навигация - Главное Меню 🧭

- **Статус:** ✅ **Завершено**
- **Цель:** Проверить корректную работу главного меню и доступ к основным разделам.
- **User Flow:** `/menu` (или кнопка "Главное Меню") -> `menuScene` -> Отображение кнопок -> Нажатие кнопки -> Переход в другую сцену/команду.
- **Файл:** `src/scenes/menuScene/index.ts`
- **Тест:** `__tests__/scenes/menuScene.test.ts`

### Анализ Логики `menuScene`

1.  **Вход (`menuCommandStep`):**
    *   Срабатывает при входе в сцену.
    *   Вызывает `getUserDetailsSubscription` (только для `subscriptionType`).
    *   Вызывает `mainMenu` (передавая `isRu`, `subscriptionType`).
    *   Определяет ключ перевода (`menu` или `digitalAvatar`) по `subscriptionType`.
    *   Вызывает `getTranslation`.
    *   Отправляет сообщение (`reply` или `replyWithPhoto`) с текстом (из перевода или fallback) и клавиатурой (`mainMenu`).
    *   Переходит к `ctx.wizard.next()`.
2.  **Обработка Нажатий (`menuNextStep`):
    *   Ожидает `message` с текстом.
    *   Сначала проверяет навигационные кнопки (Главное меню, Справка, Техподдержка и т.д.) -> Переход в сцены / вызов обработчиков.
    *   Затем проверяет спец. кнопки (Сгенерировать новое видео?).
    *   Если текст не распознан как навигационная/спец. кнопка -> передает в `handleMenu`.

### Зависимости для Тестирования `menuScene`

*   `getUserDetailsSubscription`
*   `mainMenu` (и `levels` из `@/menu/mainMenu`)
*   `getTranslation`
*   `isRussian`
*   `ctx.reply`, `ctx.replyWithPhoto`, `ctx.telegram.sendMessage`
*   `ctx.scene.enter`, `ctx.scene.reenter`, `ctx.scene.leave`
*   `ctx.wizard.next`
*   `handleMenu`
*   `handleTechSupport`
*   `handleRestartVideoGeneration`
*   `logger`

### План Тестирования `menuScene` (TDD)

1.  ✅ Создать Файл: `__tests__/scenes/menuScene.test.ts` с базовым `describe`, `beforeEach`, моками.
2.  ✅ **Тест 1: Вход в меню (Подписка NEUROBASE/RU)** ✅
    *   *Arrange:* `getUserDetailsSubscription` -> `NEUROBASE`, `isRussian` -> `true`, `getTranslation(key='menu')` -> `RU текст + URL`, `mainMenu` -> `Клавиатура`.
    *   *Act:* Вызвать `menuCommandStep(mockCtx)` (или эквивалент через `scene.enterHandler`).
    *   *Assert:* `getUserDetailsSubscription`, `getTranslation('menu')`, `mainMenu(NEUROBASE, true)`, `replyWithPhoto(RU текст, URL, Клавиатура)`, `ctx.wizard.next()`.
3.  ✅ **Тест 2: Вход в меню (Подписка NEUROPHOTO/EN)** ✅
    *   *Arrange:* `getUserDetailsSubscription` -> `NEUROPHOTO`, `isRussian` -> `false`, `getTranslation(key='digitalAvatar')` -> `EN текст, null URL`, `mainMenu` -> `Клавиатура`.
    *   *Act:* Вызвать `menuCommandStep(mockCtx)`.
    *   *Assert:* `getTranslation('digitalAvatar')`, `mainMenu(NEUROPHOTO, false)`, `reply(EN текст, Клавиатура)`, `ctx.wizard.next()`.
4.  ✅ **Тест 3: Обработка кнопки "Справка"** ✅
    *   *Arrange:* `ctx.update` с текстом "Справка", `isRussian` -> `true`.
    *   *Act:* Вызвать `menuNextStep(mockCtx)` (или эквивалент).
    *   *Assert:* `ctx.scene.enter(ModeEnum.Help)`.
5.  ✅ **Тест 4: Обработка функциональной кнопки (передача в handleMenu)** ✅
    *   *Arrange:* `ctx.update` с текстом функц. кнопки (напр., "Нейрофото"), мок `handleMenu`.
    *   *Act:* Вызвать `menuNextStep(mockCtx)`.
    *   *Assert:* `handleMenu(mockCtx)`.
6.  ✅ **Тест 5: Обработка кнопки "Главное меню" (reenter)** ✅
7.  ✅ **Тест 6: Обработка кнопки "Техподдержка" (вызов handleTechSupport)** ✅
8.  ✅ **Тест 7: Обработка ошибок** ✅

<!-- END P1 -->

## P2: Основной Функционал - Генерация Контента ✨

# 🕉️ Тестовое Окружение (Vitest + Telegraf)

Этот документ описывает основные настройки и решения проблем, связанных с тестированием кода, использующего Telegraf, с помощью Vitest.

## ⚙️ Ключевые Настройки Конфигурации

Для стабильной работы тестов Telegraf с Vitest необходимо уделить внимание следующим файлам конфигурации:

1.  **`vitest.config.mts`:**
    *   **Алиас для `@`:** Должен быть настроен для удобства импортов из `src/`.
    *   **Алиас для `@telegraf/types`:** **ОБЯЗАТЕЛЬНО** должен присутствовать ручной алиас, указывающий на файл с моками типов (например, `__tests__/mocks/typegram.mock.ts`). Глобальный мок `telegraf` и плагин `vite-tsconfig-paths` не всегда корректно разрешают этот пакет типов самостоятельно.
        ```typescript
        // vitest.config.mts
        import path from 'path' // Не забудьте импорт!
        // ...
        resolve: {
          alias: [
            // Путь к src относительно корня проекта
            { find: '@', replacement: path.resolve(__dirname, 'src') }, 
            // Путь к мокам относительно корня проекта
            {
              find: '@telegraf/types',
              replacement: path.resolve(__dirname, '__tests__/mocks/typegram.mock.ts') 
            },
          ],
        },
        ```
    *   **`deps.optimizer`:** **КРАЙНЕ ВАЖНО** исключить `telegraf`, `@telegraf/types`, `telegraf/scenes` из секций `include` для `web` и `ssr`. Оптимизация Vite может конфликтовать с применением моков.
        ```typescript
        // vitest.config.mts
        deps: {
          optimizer: {
            web: { include: [] }, // Очистить от telegraf
            ssr: { include: [] }, // Очистить от telegraf
          },
        },
        ```
    *   **Плагин `vite-tsconfig-paths`:** Должен быть включен для поддержки алиасов из `tsconfig.json`.

2.  **`__tests__/setup.ts`:**
    *   **Глобальный Мок `telegraf`:** Здесь должен быть определен основной мок для `telegraf` (`vi.mock('telegraf', ...)`).
    *   **Мок `Markup`:** Внутри глобального мока `telegraf` нужно тщательно мокировать `Markup`, особенно цепочки вызовов вроде `Markup.keyboard(...).resize()`. Пример правильного мока см. в корневом `README.md` -> `Common Testing Issues & Solutions`.
    *   **Другие Глобальные Моки:** Здесь же мокаются другие зависимости (например, `fs`, `path`, `logger`, `@supabase/supabase-js`).

3.  **`tsconfig.json`:**
    *   Должны быть определены базовые пути (`baseUrl`, `paths`) для работы алиасов (например, `"@/*": ["src/*"]`).

**Соблюдение этих настроек поможет избежать распространенных проблем с мокированием и разрешением модулей при тестировании Telegraf с Vitest.**

**См. также:** Корневой `README.md` -> `Common Testing Issues & Solutions` для более детального разбора конкретных ошибок. 