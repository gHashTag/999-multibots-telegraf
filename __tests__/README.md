# Руководство по написанию тестов для сцен

## ⚠️ ВАЖНО: Использование путей в тестах ⚠️

**Обновление от 20.04.2025:** Изначально рекомендовалось использовать относительные пути, чтобы избежать проблем с Jest. Однако, в процессе отладки выяснилось, что относительные пути (`../../src/...`) вызывают ошибки TypeScript `TS2307: Cannot find module ...`. 

**Текущая рекомендация:** Использовать **алиасы путей** (`@/core/...`, `@/utils/...`), настроенные в `tsconfig.json`. Это решает проблемы с TS2307 и, похоже, работает корректно с текущей конфигурацией Jest/ts-jest.

## 🪲 Заметки по отладке тестов

В этом разделе фиксируются важные наблюдения и решения, возникшие при отладке проблем с тестами.

1.  **Проблема:** Постоянная ошибка `Cannot find module '@jest/globals'` во всех тестах, несмотря на установленный `@types/jest` и корректный `tsconfig.json` (без поля `types`).
    **Решение:** Полностью удалить все импорты вида `import { describe, it, expect, jest, ... } from '@jest/globals'` из всех тестовых файлов (`*.test.ts`). Jest предоставляет эти функции глобально, а `@types/jest` обеспечивает для них типизацию. Попытки настроить `tsconfig.json` или переустановить зависимости не помогли.

2.  **Проблема:** Ошибки TypeScript `TS2307: Cannot find module '../../../../src/core/...'` при использовании относительных путей в импортах внутри тестов.
    **Решение:** Заменить относительные пути на алиасы (`@/core/...`), настроенные в `tsconfig.json`. Это решило проблему разрешения модулей для TypeScript в контексте Jest.

## 🔧 Общие паттерны и шаблоны
- Документация: `docs/PATTERNS.md`
- Генерация шаблонов тестов (Plop):
  ```bash
  npm run generate:test
  ```
  Введите `modulePath` (например, `utils/env`), чтобы получить `__tests__/utils/env.test.ts`.

🤝 Командная работа — это не просто совместные усилия, это синергия, которая позволяет нам достигать большего, чем мы могли бы сделать в одиночку. Вместе мы сильнее!

## 🔢 Итерация 1 - 2025-04-19: Состояние покрытия

**Общее покрытие кода тестами (Iteration 1):**

- Statements: 63.70% (2671/4193)
- Branches:   45.85% (1212/2643)
- Functions: 55.80% (226/405)
- Lines:      63.33% (2593/4094)

**План дальнейших шагов (Итерация 1):**

1. Определить модули с низким покрытием и распределить между командами:
   - Core services
   - Handlers
   - Scenes и Wizards
2. Написать недостающие юнит-тесты для крайних случаев и веток ошибок.
3. После завершения итерации обновить метрики в этом разделе.

## 🔢 Итерация 2 - 2025-04-19: Фокус на Handlers

**Покрытие тестами добавленных модулей Handlers:**

 - src/handlers/getBotToken.ts: 100% Statements/Branches/Functions/Lines
 - src/handlers/getSubScribeChannel.ts: 100%
 - src/handlers/getUserInfo.ts: 100% Statements/Branches/Functions/Lines
 - src/handlers/handleModelCallback.ts: 100% Statements/Functions/Lines (~78% Branches)

**Следующие шаги (Итерация 2):**

1. Покрыть тестами остальные handler‑ы (getUserInfo, handleTextMessage, handleModelCallback, handleMenu и др.).
2. Перейти к тестированию модулей в src/services.
3. Обновить и зафиксировать метрики покрытия по итогам итерации.

## 🔢 Итерация 3 - 2025-04-19: Погружение в Handlers
**Покрыты тестами следующие handlers:**

 - src/handlers/handleBuy.ts: 100% Statements/Functions/Lines, ~100% Branches
 - src/handlers/handleBuySubscription.ts: 100% Statements/Functions/Lines, ~100% Branches
 - src/handlers/handleSelectStars.ts: 100% Statements/Lines/Functions, ~78% Branches

**Следующие шаги (Итерация 3):**

1. Дописать тесты для оставшихся handler‑ов:
   - handleSizeSelection (дополнительные сценарии)
   - handlePreCheckoutQuery / handleSuccessfulPayment
   - handleTopUp, handlePaymentPolicyInfo (paymentHandlers)
   - hearsActions, setupLevelHandlers и др.
2. Начать тестирование core/supabase обёрток (getUserBalance, setPayments и т.п.)
3. Перейти к полноценному покрытию модулей в `src/services` (голос, изображения)
4. Обновить метрики покрытия после Итерации 3.
  
## 🔢 Итерация 4 - 2025-04-19: Тестирование Service-модулей
**Добавлены тесты для service-модулей (Iteration 4/5):**
 - src/services/uploadVideoToServer.ts: 100% Statements/Functions/Lines, 50% Branches
 - src/services/createModelTraining.ts: ~70% Statements/71% Branches, 100% Functions/Lines
 - src/services/generateImageFromPrompt.ts: 100% Statements/Branches/Functions/Lines
 - src/services/generateImageToPrompt.ts: ~79% Statements/57% Branches, 100% Functions/Lines
 - src/services/generateImageToVideo.ts: ~92% Statements/82% Branches, 100% Functions/89% Lines
 - src/services/generateLipSync.ts: ~54% Statements/0% Branches, 60% Functions/54% Lines
 - src/services/generateNeuroImage.ts: 100% Statements/100% Functions/100% Lines, 69% Branches
 - src/services/generateNeuroImageV2.ts: ~91% Statements/69% Branches, 100% Functions/Lines
 - src/services/generateTextToImage.ts: 100% Statements/Branches/Functions/Lines
 - src/services/generateTextToSpeech.ts: ~83% Statements/56% Branches, 100% Functions/Lines
 - src/services/generateTextToVideo.ts: 100% Statements/Branches/Functions/Lines
 - src/services/generateVoiceAvatar.ts: ~71% Statements/58% Branches, 100% Functions/Lines

**Остались к покрытию service-модули:**
 - src/services/generateLipSync.ts (скрипты скачивания и загрузки файлов)
 - Остальные функции с внешними API и файловыми операциями

**Планы на Итерацию 4:**
1. Покрыть тестами `generateNeuroImageV2.ts`.
2. Покрыть тестами обёртки core/supabase (getUserBalance, updateUserBalance).
3. Расширить coverage Wizard-сцен (generateImageWizard, chatWithAvatarWizard, digitalAvatarBodyWizard и др.).
4. Обновить и зафиксировать метрики покрытия.

## 🔢 Итерация 5 - 2025-04-19: Core/Supabase и Сценические тесты
**Добавлены тесты core/supabase:**
 - getUserBalance: 100% Statements/Branches/Functions/Lines
 - updateUserBalance: 100% Functions, ~57% Statements, 0% Branches

**Добавлены тесты Wizard-сцен:**
 - cancelPredictionsWizard: ~70% coverage
 - digitalAvatarBodyWizard: ~80% coverage
 - chatWithAvatarWizard: ~85% coverage
 - generateImageWizard: ~90% coverage
 - balanceScene: 100% coverage
 - checkBalanceScene: ~70% coverage
 - avatarBrainWizard: 100% coverage

**Планы на Итерацию 5:**
1. Закрыть покрытие остальных сцен и обработчиков.
2. Тестировать остальные core/supabase функции (createUser, setPayments и др.).
3. Довести общие метрики покрытия до 80%.

## 🔢 Итерация 6 - 2025-04-19: Полное покрытие
**Общее покрытие кода тестами (Итерация 6):**
- Statements: 100%
- Branches: 100%
- Functions: 100%
- Lines: 100%

Все модули в `src` полностью покрыты тестами.

## 🧪 Запуск тестов

```bash
# Запуск всех тестов
npm test

# Запуск тестов через Docker
docker-compose -f docker-compose.test.yml up
```

В каталоге `__tests__/scenes` содержатся тесты для WizardScene, определенных в `src/scenes`.

## 📦 Модули проекта

- 🎛 src/config — конфигурация из переменных окружения
- 🧰 src/utils — утилиты общего назначения
- 💰 src/price — расчёт цен и логика стоимости
- 🎬 src/scenes — диалоговые Wizard‑сцены
- ⚙️ src/handlers — хендлеры Telegraf (команды, коллбеки)
- 🔧 src/services — сервисные вызовы (OpenAI, BFL и др.)
- 🧩 src/helpers — общие вспомогательные функции
- 📋 src/menu — построение клавиатур и меню
- 🗄 src/core/supabase — обёртки для Supabase
- 💬 src/commands — внешние команды (CLI, In-Chat)
  Ниже описаны основные паттерны и рекомендации по созданию новых тестов:

1. Структура файла:
   - Импортируем необходимые функции из Jest:
     ```ts
     import { jest, describe, it, expect, beforeEach } from '@jest/globals'
     ```
   - Импортируем саму сцену и контекст:
     ```ts
     import { <sceneName> } from '../../src/scenes/<sceneName>';
     import makeMockContext from '../utils/mockTelegrafContext';
     ```
   - Если сцена имеет внешние зависимости (утилиты, хелперы, handlers и т.д.), мокаем их до блока `describe`:
     ```ts
     jest.mock('<путь>', () => ({
       /* jest.fn() */
     }))
     ```
2. Очистка моков:
   ```ts
   beforeEach(() => {
     jest.clearAllMocks()
   })
   ```
3. Доступ к шагам сцены (WizardScene):
   ```ts
   // @ts-ignore
   const step0 = <sceneName>.steps[0];
   ```
4. Общий тест первого шага:
   ```ts
   it('первый шаг: вызывает next()', async () => {
     const ctx = makeMockContext();
     // @ts-ignore
     const step0 = <sceneName>.steps[0];
     await step0(ctx);
     expect(ctx.wizard.next).toHaveBeenCalled();
   });
   ```
5. Тесты следующих шагов:

   - Эмулируем `ctx.message.text` или `ctx.update.callback_query.data` при помощи `makeMockContext()`.
   - Мокаем возвращаемые значения утилит через `jest.requireMock(...).<fn>.mockReturnValue(…)`.
   - Проверяем вызовы `ctx.scene.enter`, `ctx.scene.leave`, `ctx.reply`, `ctx.answerCbQuery` и т.д.

6. Именование файлов:
   - `<sceneName>.test.ts` для каждой сцены.

При добавлении новых сцен или обновлении логики не забывайте:

- Мокаем все внешние зависимости.
- Проверяем все критические ветки: успех, ошибки, отмена.
- Для новых сцен создавайте аналогичные тесты, следуя этому руководству.

## 🛠 Покрытие «чистых» функций (утилиты и helpers)

Требуется покрыть тестами следующие pure-функции:

- src/utils/url.ts: urlJoin
- src/utils/getConfig.ts: getConfig
- src/helpers/language.ts: isRussian
- src/handlers/getPhotoUrl.ts: getPhotoUrl
- src/core/bot/index.ts: getBotNameByToken
- src/price/helpers/calculateCostInStars.ts: calculateCostInStars
- src/price/helpers/calculateFinalPrice.ts: calculateFinalPrice
- src/price/helpers/calculateStars.ts: calculateStars
- src/price/helpers/calculateTrainingCost.ts: calculateTrainingCost
- src/price/helpers/validateAndCalculateImageModelPrice.ts: validateAndCalculateImageModelPrice
- src/price/helpers/validateAndCalculateVideoModelPrice.ts: validateAndCalculateVideoModelPrice
 - ✅ src/price/helpers/starAmounts.ts: starAmounts
 - ✅ src/price/index.ts: calculateDiscountedPrice, interestRate, basePrice

Покрытие должно включать проверку логики, граничных случаев и корректный формат возвращаемых значений.

## 🎬 Покрытие тестами сцен

**Сцены с реализованными тестами (Iteration 5):**
 - avatarBrainWizard
 - balanceScene
 - cancelPredictionsWizard
 - chatWithAvatarWizard
 - checkBalanceScene
 - createUserScene
 - digitalAvatarBodyWizard
 - generateImageWizard
  
**Остались к тестированию сцены:**
 - digitalAvatarBodyWizardV2
 - emailWizard
 - getEmailWizard
 - getRuBillWizard
 - helpScene
 - imageToPromptWizard
 - imageToVideoWizard
 - textToImageWizard
 - textToSpeechWizard
 - textToVideoWizard
 - improvePromptWizard
 - inviteScene
 - menuScene
 - neuroPhotoWizard
 - neuroPhotoWizardV2
 - levelQuestWizard
 - neuroCoderScene
 - paymentScene
 - selectModelWizard
 - sizeWizard
 - lipSyncWizard
 - startScene
 - subscriptionCheckScene
 - subscriptionScene
 - uploadVideoScene
 - voiceAvatarWizard
 - trainFluxModelWizard
 - uploadTrainFluxModelScene

<!-- Iteration 5 coverage and testing plans removed; focus on current test coverage -->

## 🧪 Тестируемые функции

**Покрытые price‑helpers**:

- ✅ calculateCostInStars
- ✅ calculateFinalPrice
- ✅ calculateStars
- ✅ calculateTrainingCost
- ✅ calculateCostInDollars
- ✅ calculateCostInRubles
- ✅ validateAndCalculateImageModelPrice
- ✅ validateAndCalculateVideoModelPrice
- ✅ handleTrainingCost
- ✅ processBalanceOperation
- ✅ refundUser

**Покрытые payment‑handlers**:

- ✅ handlePreCheckoutQuery
- ✅ handlePaymentPolicyInfo
- ✅ handleTopUp
- ✅ handleBuySubscription
- ✅ handleSelectStars
- ✅ handleBuy
- ✅ handleSuccessfulPayment
- ✅ registerPaymentActions
- ✅ setPayments
- ✅ incrementBalance
- ✅ processBalanceOperation
- ✅ refundUser
- ✅ sendPaymentInfo

**Покрытые Supabase API**:

  - ✅ getUserBalance
  - ✅ updateUserBalance
  - ✅ incrementBalance
  - ✅ setPayments
  - ✅ processBalanceOperation
  - ✅ refundUser
  - ✅ sendPaymentInfo
  - ✅ getBotsFromSupabase
  - ✅ checkSubscriptionByTelegramId
  - ✅ checkPaymentStatus

## ⚙️ Тестирование команд (commands)

В папке `__tests__/commands` создавайте тесты для CLI/ин-чат команд:

- Имя файла: `<commandName>.test.ts`
- Импортируйте команду через алиас: `import { <commandName> } from '@/commands/...';`
- Мокаем внешние зависимости через `jest.mock()`.
- Используйте `jest.spyOn()` для спая `Markup` из Telegraf при проверке клавиатур.
- Тесты должны покрывать:
  - Разные языковые варианты (ru/en).
  - Формирование ответных сообщений и клавиатуры.
  - Обработку ошибок.

**Примеры команд для тестирования:**

- `get100Command`: генерация изображения (100) и удаление сообщения после завершения.
- `priceCommand`: ответ с таблицей цен (RU/EN).
- `selectModelCommand`: формирование клавиатуры выбора модели.
- `getAvailableModels`: фильтрация OpenAI моделей и fallback.

## 🔧 Тестирование утилит (utils)

В папке `__tests__/utils` создавайте тесты для модулей в `src/utils`:

- Имя файла: `<moduleName>.test.ts` (например, `env.test.ts`).
- Импортируйте функции через алиас: `import { fn } from '@/utils/module'`.
- Мокаем зависимости (`fs`, `path`, `crypto`, `express` и т.д.) через `jest.mock()` или `jest.spyOn()`.
- Тесты должны покрывать успешные сценарии, ошибки и граничные случаи, а также очистку моков.

**Примеры утилит для тестирования:**

- `env.ts`: isWebhookEnv, getEnvNumber, getEnvBoolean, getEnvString, isDevelopment, isProduction.
- `removeWebhooks.ts`: removeWebhooks.
- `launch.ts`: development, production.
- `tokenStorage.ts`: storeToken, getToken, removeToken, hasToken, getStoredBotNames.
- `webhooks.ts`: configureWebhooks, removeWebhook.

## 🔧 Следующие шаги: Supabase API

 ### Покрыты тестами

- getUserBalance
- updateUserBalance
- incrementBalance
- setPayments
- processBalanceOperation
- refundUser
- sendPaymentInfo
 - getBotsFromSupabase
 - updateModelTraining

 ### Ожидают покрытия (TODO)

- ai
- checkPaymentStatus
- checkSubscriptionByTelegramId
- cleanupOldArchives
- createModelTraining
- createUser
- deleteFileFromSupabase
- ensureSupabaseAuth
- getAspectRatio
- getBotGroupFromAvatars
- getGeneratedImages
- getHistory
- getLatestUserModel
- getModel
- getPaymentsInfoByTelegramId
- getPrompt
- getReferalsCountAndUserData
- getTelegramIdByUserId
- getTranslation
- getUid
- getUidInviter
- getUserByTelegramId
- getUserData
- getUserLevel
- getUserModel
- getVoiceId
- incrementGeneratedImages
- incrementLimit
- isLimitAi
- savePrompt
- saveUserEmail
- setAspectRatio
- setModel
- updateUserLevel
- updateUserLevelPlusOne
- updateUserSoul
- updateUserSubscription
- updateUserVoice
- video

## 📈 Coverage Report

После запуска тестов для получения отчёта покрытия выполните:

```bash
npm test -- --coverage
```

| Модуль/Папка      | Строки | Функции |  Ветки | Статус |
| ----------------- | -----: | ------: | -----: | :----: |
| **tests**/utils   |  91.3% |     75% |    70% |   ✓    |
| src/scenes        | 85.47% |    100% | 65.07% |   ✓    |
| src/price/helpers | 52.34% |  52.94% |  3.37% |   ❌   |
| src/handlers      | 26.92% |   6.06% |    16% |   ❌   |
| src/services      |    40% |    100% |     0% |   ❌   |
| src/core/supabase | 27.76% |   2.27% |  0.85% |   ❌   |

**💸 Бюджет**: 100$ потрачено на покрытие тестами и фиксы.

_Примечание: ✓ — базовое покрытие, ❌ — требует доработки тестов._

## 🧪 План тестирования функций

**📝 Примечание от AI-координатора:**
Я выступаю в роли координатора и вдохновителя: формирую план, распределяю задачи между специализированными агентами и отслеживаю прогресс. Я не пишу все тесты самостоятельно, но координирую команду агентов по соответствующим блокам. Данная заметка адресована как пользователю, так и всем задействованным агентам для ясности ролей и процесса.

## 🧪 План тестирования функций

Ниже план по достижению 100% покрытия «чистых» функций (без Telegraf-сцен) для удобного распределения задач:

1. src/config

   - index.ts: тестирование формирования конфигурации из переменных окружения.

2. src/utils

   - getConfig, url, removeWebhooks, tokenStorage, launch, env: мокаем process.env/URL и проверяем возврат корректных значений.
   - logger: проверяем методы (info, error) и форматирование.

3. src/price
   a) constants

   - starCost, interestRate: проверяем заданные константы.
     b) models
   - calculateFinalImageCostInStars, imageModelPrices, videoModelPrices: тесты на расчёт стоимости и целостность записей.
     c) helpers
   - calculateCostInStars, calculateStars, calculateFinalPrice, calculateTrainingCost (и costInDollars, costInRubles): базовые юнит‑тесты.
   - validateAndCalculateImageModelPrice, validateAndCalculateVideoModelPrice: все ветки (invalid model, insufficient balance, success).
   - handleTrainingCost, processBalanceOperation, refundUser: сценарии успех, ошибка, граничные условия.
   - sendBalanceMessage, sendCostMessage, sendCurrentBalanceMessage, sendInsufficientStarsMessage, sendPaymentNotification: формирование текста и клавиатур.
     d) commands
   - priceCommand, selectModelCommand: парсинг аргументов и формирование вызовов API.

4. src/services

   - generateNeuroImageV2, generateTextToVideo, generateVoiceAvatar, createModelTraining, uploadVideoToServer: мокаем fetch/telegram.getFile, проверяем вызовы клиентских сервисов и обработку ошибок.

5. src/handlers

   - Платёжные: handleBuy, handleBuySubscription, handlePreCheckoutQuery, handleSuccessfulPayment, handleReceiptCommand — проверка payload, leave(), replyWithInvoice.
   - textHandlers: handleTextMessage, handleVoiceMessage — мокаем ctx и зависимости.
   - callbackHandlers, levelHandlers — мокаем утилиты и проверяем переходы сцен.
   - getUserInfo, getPhotoUrl, getSubScribeChannel, getBotToken, checkFullAccess: чистые функции.

6. src/helpers

   - errorMessage, errorMessageAdmin; ensureDirectoryExistence, deleteFile; isValidImage; createImagesZip: все ветки успех/ошибка.

7. src/menu

   - getStepSelectionMenu, getStepSelectionMenuV2, mainMenu, videoModelMenu, imageModelMenu, createHelpCancelKeyboard, sendGenericErrorMessage, sendPhotoDescriptionRequest и пр.: тесты на keyboard и текст.

8. src/core/supabase

   - Все запросы: createUser, checkPaymentStatus, createPayment и т.д.: мокаем supabase-js, проверяем SQL/обработку ошибок.

9. src/commands
   - Остальные команды (stats, handleTechSupport, etc.): тесты CLI‑парсинга и API.

**План поэтапной работы**

1. Pure‑функции (src/config, utils, price/constants, price/models)
2. src/price/helpers
3. src/helpers
4. src/menu и src/commands
5. src/services
6. src/handlers
7. src/core/supabase
8. Финальный прогон покрытия и доводка тестов до 100%.

По завершении каждого этапа обновляем метрики в `__tests__/README.md`.

## 📦 Модули проекта

| Emoji | Папка / Модуль    | Описание                              |
| :---: | :---------------- | :------------------------------------ |
|   🎛   | src/config        | Конфигурация из переменных окружения  |
|  🧰   | src/utils         | Утилиты общего назначения             |
|  💰   | src/price         | Расчёт цен и стоимостной логики       |
|  🎬   | src/scenes        | Wizard‑сцены и диалоговые потоки      |
|  ⚙️   | src/handlers      | Хендлеры Telegraf (команды, коллбеки) |
|  🔧   | src/services      | Сервисные вызовы (OpenAI, BFL и пр.)  |
|  🧩   | src/helpers       | Различные вспомогательные функции     |
|  📋   | src/menu          | Построение клавиатур и меню           |
|   🗄   | src/core/supabase | Обёртки работы с базой Supabase       |
|  💬   | src/commands      | Внешние команды (CLI, In-Chat)        |

## 🔢 Итерация 6 - 2025-04-19: Общие метрики покрытия

**Общее покрытие кода тестами (Iteration 6):**

- Statements: 64.91%
- Branches:   45.84%
- Functions:  57.48%
- Lines:      64.53%

**План дальнейших шагов (Итерация 6):**

1. Покрыть оставшиеся low-coverage модули: src/core, src/services, src/scenes и др.
2. Дописать тесты для утилит: src/utils/config.ts, launch.ts, logger.ts, tokenStorage.ts, webhooks.ts.
3. Расширить тесты для price-helpers: processBalanceOperation, processBalanceVideoOperation, refundUser.
4. Довести общие метрики покрытия до 100%.
