# 🗺 ROADMAP: NeuroBlogger Project 🚀

## 🎯 Текущие задачи

### ИСПРАВЛЕНИЕ ДВОЙНОГО СПИСАНИЯ СРЕДСТВ (ЗАВЕРШЕНО - 2025-01-27) ✅
- **Задача:** Исправить проблему двойного списания средств за генерацию видео
- **Статус:** ✅ Завершено успешно
- **Проблема:**
    - Пользователи жаловались на двойное списание средств за генерацию видео
    - В финансовых отчетах появлялись дублирующие записи:
        - "HeijaVideo generation (Seedance Pro)" - известная транзакция
        - "Payment operation" - неизвестная транзакция
- **Причина:** В функции `updateUserBalance.ts` было два места создания записей в таблице `payments_v2`:
    1. Первая запись (строки 380-440) - устаревший код
    2. Вторая запись (строки 523-542) - новый код с валидацией через Zod
- **Исправления:**
    - ✅ Удален дублирующий блок создания записи в `updateUserBalance.ts`
    - ✅ Оставлена только одна запись с валидацией через Zod
    - ✅ Удален неиспользуемый файл `src/price/processBalanceVideoOperation.ts`
    - ✅ Исправлены проблемы с "неизвестными транзакциями" в финансовых отчетах
- **Результат:** Теперь при генерации видео создается только одна корректная запись в базе данных

### АНАЛИЗ ПРОЕКТА PADEL WORLD CLUB (ЗАВЕРШЕНО - 2025-01-27) ✅
- **Задача:** Провести анализ проекта https://github.com/gHashTag/padle-world-club.git и предложить улучшения
- **Статус:** ✅ Завершено успешно
- **Результаты:**
    - ✅ Проведен комплексный анализ архитектуры, кода и инфраструктуры
    - ✅ Создан документ `padel-world-club-improvements.md` (17KB) с детальными рекомендациями
    - ✅ Создан документ `padel-quick-fixes.md` (5KB) с быстрыми исправлениями на 3 дня
    - ✅ Создан документ `padel-analysis-summary.md` с кратким резюме анализа
- **Основные находки:**
    - 8+ мест с подавлением TypeScript ошибок (@ts-ignore, @ts-expect-error)
    - Падающие E2E тесты бронирования (booking flow)
    - Отсутствие централизованной обработки ошибок
    - Недостаточная безопасность (нет rate limiting, чувствительные данные в логах)
    - Смешение архитектурных слоев
- **Рекомендации внедрены в 3 фазы:**
    - Фаза 1: Критические исправления (1-3 дня)
    - Фаза 2: Стабилизация (1-2 недели)
    - Фаза 3: Масштабирование (1-2 месяца)

### ЦЕНТРАЛИЗАЦИЯ ЯЗЫКОВОЙ СИСТЕМЫ (ЗАВЕРШЕНО - 2025-01-30) ✅
- **Цель:** Создать централизованную систему управления языками с единым источником истины и оптимизированной производительностью
- **Статус:** ✅ Основная работа завершена, осталось завершить централизацию 100+ мест
- **Проблемы, которые решались:**
    - Ошибка "message text is empty" в subscription scene из-за пустых переводов
    - Множественные источники истины для языка (БД, сессия, Telegram)
    - Проблема производительности: 4+ запросов к БД на каждое действие пользователя
    - Несогласованность между языком интерфейса и переводами текста
    - Дублирование кнопок языка в главном меню

- **Архитектурные изменения:**
    - ✅ Создана централизованная система middleware для языков
    - ✅ Добавлен `languageMiddleware.ts` - один запрос к БД в начале каждого запроса
    - ✅ Расширен `MyContext` интерфейс: добавлен `state: { userLanguage?: 'ru' | 'en' }`
    - ✅ Создан `centralizedLanguage.ts` с helper функциями без БД вызовов
    - ✅ Удалены все кеши сессий - только БД как источник истины
    - ✅ Оптимизация производительности: 4+ запросов → 1 запрос на действие

- **База данных:**
    - ✅ Созданы функции `updateUserLanguage.ts` и `getUserLanguageFromDB.ts`
    - ✅ Добавлен столбец `userLanguage` в таблицу users (опционально)
    - ✅ Интеграция с существующей системой Supabase

- **Полностью исправленные файлы (32+ места):**
    - ✅ `src/middlewares/languageMiddleware.ts` - создан middleware
    - ✅ `src/helpers/centralizedLanguage.ts` - создан централизованный помощник
    - ✅ `src/interfaces/session.interface.ts` - добавлен `state` в контекст
    - ✅ `src/core/supabase/updateUserLanguage.ts` - создан
    - ✅ `src/core/supabase/getUserLanguageFromDB.ts` - создан
    - ✅ `src/bot.ts` - подключен language middleware
    - ✅ `src/translation/getTranslation.ts` - использует `getUserLanguageFromState`
    - ✅ `src/menu/handleMenu.ts` - полностью переписан на централизованную систему
    - ✅ `src/menu/mainMenu.ts` - использует sync функции
    - ✅ `src/scenes/menuScene/index.ts` - обновлен
    - ✅ `src/scenes/checkBalanceScene.ts` - использует `isRussianFromState`
    - ✅ `src/scenes/neuroPhotoWizardV2/index.ts` - обновлен
    - ✅ `src/menu/sendPhotoDescriptionRequest.ts` - централизован
    - ✅ `src/scenes/neuroPhotoWizard/index.ts` - обновлен
    - ✅ `src/registerCommands.ts` - 19 мест исправлено
    - ✅ `src/handlers/hearsHandlers.ts` - 8 мест исправлено

- **Частично исправленные файлы:**
    - 🔄 `src/scenes/levelQuestWizard/handlers.ts` - 5+ из 40+ мест (файл 1072 строки)
    - ⏳ `src/scenes/imageToVideoWizard/index.ts` - не завершен
    - ⏳ Множество других сцен и компонентов

- **Производительность:**
    - **ДО:** Каждая функция делала отдельный запрос к БД (menuCommandStep, checkBalanceScene, getTranslation, etc.)
    - **ПОСЛЕ:** Один запрос в middleware → кеш в `ctx.state` → все последующие обращения без БД

- **Следующие шаги:**
    - ⏳ Завершить централизацию во всех остальных 100+ местах использования
    - ⏳ Полное тестирование языковой системы
    - ⏳ Проверка работы переключения языка во всех сценах

### ИСПРАВЛЕНИЕ ЦИКЛА ДИАЛОГА В ЧАТЕ С АВАТАРОМ (ЗАВЕРШЕНО - 2025-01-15) ✅
- **Проблема:** После активации команды "Чат с аватаром" бот отвечал только на первое сообщение, последующие игнорировались
- **Причина:** 
    - Сцена `chatWithAvatarWizard` не возвращалась к ожиданию новых сообщений после обработки первого
    - В `registerCommands.ts` отсутствовал обработчик `bot.on(message('text'), handleTextMessage)`
- **Решение:** 
    - ✅ Добавлен возврат на второй шаг сцены через `ctx.wizard.selectStep(1)`
    - ✅ Добавлен недостающий обработчик текстовых сообщений в `registerCommands.ts`
    - ✅ Теперь сцена остается активной и продолжает обрабатывать все сообщения в цикле
    - ✅ Пользователь может продолжать диалог до тех пор, пока не нажмет "Отмена"

### ИСПРАВЛЕНИЕ НЕРАБОТАЮЩИХ ФУНКЦИЙ (ПРИОРИТЕТ - ВЫСОКИЙ) 🐞
- **Цель:** Диагностировать и исправить основные неработающие функции бота, начиная с самых простых.
- **Статус:** ⏳ Проверка работоспособности "Фото в видео".
- **Проблемы (от простых к сложным):**
    *   ✅ Справка (Без ответа) - *Исправлено*
    *   ✅ Выбор модели ИИ (Нет ответа) - *Исправлено*
    *   ✅ Текст в фото (Сообщение о временной недоступности) - *Исправлено, требуется проверка.*
    *   ✅ Мозг аватара (Ошибка доступа) - *Исправлено*
    *   ✅ Чат с аватаром (Ошибка доступа) - *Исправлено*
    *   ✅ Голос аватара (Ошибка) - *Исправлено*
    *   ✅ Генерация аудио из текста (Нет ответа) - *Исправлено*
    *   ✅ Фото в видео (Стандарт/Морфинг) - *Рефакторинг завершен ({current_date}), требуется проверка.* 
    *   ✅ Видео из текста (Нет ответа, возможно связано с textToVideoWizard)
- **Следующие шаги:**
    - Протестировать работу функции "Фото в видео" (`imageToVideoWizard`) в обоих режимах (стандарт и морфинг).
    - Исследовать причину неработоспособности "Видео из текста".
    - Проверить логи во время вызова неработающих функций.

### РЕФАКТОРИНГ: Единый Источник Истины для Подписок (ПРИОРИТЕТ - ВЫСОКИЙ)
- **Цель:** Сделать `payments_v2` единственным источником статуса подписки и упростить типы операций.
- **Статус:** ✅ Завершен. (*Требуется финальная проверка SQL функций и данных*).
- **База Данных:**
  - ✅ Исправлены SQL функции `get_user_balance` и `get_user_balance_stats` для использования корректных Enum (`MONEY_INCOME`, `MONEY_OUTCOME`) (Предположительно, требуется ручная проверка).
  - ⚠️ **ТРЕБУЕТСЯ ДЕЙСТВИЕ (DB):** Проверить/Исправить SQL функции (`get_user_balance`, `get_user_balance_stats`) для корректной агрегации баланса ТОЛЬКО по типам `MONEY_INCOME` (+) и `MONEY_OUTCOME` (-).
  - ⚠️ **ТРЕБУЕТСЯ ДЕЙСТВИЕ (DB):** Проверить/Исправить функцию `create_system_payment`: должна использовать `type = 'MONEY_INCOME'` (или `SYSTEM` если SQL его обрабатывает как доход) и устанавливать `subscription_type`.
  - ✅ Удалить столбцы `subscription_type`, `is_active`, `subscription_start_date` из таблицы `users` (Предположительно, требуется ручная проверка).
- **Код:**
  - ✅ Проверить `getUserDetailsSubscription`, что чтение идет только из `payments_v2`.
  - ✅ Удалить использование удаленных полей `users` из интерфейсов TypeScript.
  - ✅ Упрощены типы операций в коде: используется только `PaymentType.MONEY_INCOME` для дохода и `PaymentType.MONEY_OUTCOME` для расхода. Остальные типы (SYSTEM, MONEY_OUTCOME) заменены.
  - ✅ Проверить функции списания (установка `service_type`, `subscription_type=null`).
  - ✅ Исправить установку `payment_method` в `updateUserBalanceRobokassa.ts`.
  - ✅ Реализовать безграничный срок действия для подписки `NEUROTESTER` (в `getUserDetailsSubscription.ts`).
  - ✅ Исправлена логика вычитания баланса в `processBalanceVideoOperation.ts` (убран минус).
  - ✅ Исправлен тип операции на `MONEY_OUTCOME` в `processBalanceVideoOperation.ts`.
  - ✅ Исправлен обработчик Telegram Payments (`handleSuccessfulPayment`) для корректной записи `type`, `subscription_type` и пополнения баланса (`incrementBalance`). ✅
  ✅ **{current_date}:** Завершен рефакторинг типов платежей в коде (используются `PaymentType.MONEY_INCOME`/`PaymentType.MONEY_OUTCOME`).
  ✅ **{current_date}:** Проверена SQL-функция `get_user_balance`, подтверждено использование `MONEY_INCOME`/`MONEY_OUTCOME`.

### Деплой и Инфраструктура 🏗️ (ПРИОРИТЕТ - ВЫСОКИЙ)
- **Статус:** ⏳ Требуется проверка работы `api-server` и обновление URL вебхуков.
- ✅ Создан скрипт deploy-prod.sh для автоматического деплоя
- ✅ Настройка Docker и CI/CD
- ✅ Интеграция с Docker и tmux для мониторинга
- ✅ Ветка main заменена на last-branch для актуализации кодовой базы
- ✅ Тестирование deploy-prod.sh в production
- ✅ Исправлены проблемы сборки в Docker (tsc-alias)
- ✅ Исправлена ошибка сборки Docker, связанная с husky в скрипте prepare
- ✅ Решена проблема с отсутствием файла bot.js в Docker-контейнере
- ✅ Исключены тестовые файлы из сборки в Docker
- ✅ Добавлен скрипт автоматического создания .env файла в Docker
- ✅ Удалены ненужные зависимости Ansible и Nginx из основного Docker-контейнера
- ✅ Восстановлена конфигурация Nginx (bot-proxy) для маршрутизации по именам ботов (`location /<bot_name>`)
- ✅ Исправлен `src/bot.ts` для установки вебхуков с путем `/<имя_бота>`
- ✅ Удален неиспользуемый скрипт `scripts/get-token-hashes.js`
- ✅ Создан отдельный сервис `api-server` в Docker для обработки API-запросов (начинаем с Robokassa)
- ✅ Логика обработки Robokassa перенесена в `api-server` и адаптирована под Express.
- ✅ Nginx настроен на проксирование `/api/*` на новый сервис `api-server`.
- ✅ Локальный запуск Docker (`docker-compose up --build`) успешен после смены базового образа на `node:20-slim`.
- ❗ **ТРЕБУЕТСЯ ДЕЙСТВИЕ:** Обновить URL вебхуков в Telegram на формат `https://<домен>/<имя_бота>` (КРИТИЧНО)
- ✅ Исправлен URL вебхука для Replicate в `generateImageToVideo.ts` (используется `WEBHOOK_DOMAIN`).
- ✅ Удален прямой вызов Replicate из `generateImageToVideo.ts`, заменен на вызов `api-server` (передается `modelIdentifier`).
- ❗ **ТРЕБУЕТСЯ ДЕЙСТВИЕ (API-SERVER):** Реализовать/проверить эндпоинт `/api/replicate-webhook` в `api-server` для приема результатов Replicate.
- ❗ **ТРЕБУЕТСЯ ДЕЙСТВИЕ (API-SERVER):** Убедиться, что эндпоинт `/api/generate/image-to-video` в `api-server` корректно обрабатывает запросы (валидация, вызов Replicate с ВЕБХУКОМ, ответ 202).
- ⏳ Проверка валидности всех токенов ботов
- ⏳ Настройка автоматического логирования
- ⏳ Мониторинг состояния ботов в production
- ⚠️ **ТРЕБУЕТСЯ ДЕЙСТВИЕ (DB):** Привести enum `payment_type` и данные в `payments_v2` к UPPERCASE значениям (`MONEY_INCOME` и т.д.), удалить старые/неиспользуемые значения enum. (Статус: НЕ КРИТИЧНО для расчета баланса, т.к. `get_user_balance` игнорирует `MONEY_EXPENSE`)

### Типизация и рефакторинг ✍️ (ПРИОРИТЕТ - СРЕДНИЙ)
- **Статус:** ✅ Большинство задач завершено.
- ✅ Исправлены типы в `robokassa.handler.ts`
- ✅ Исправлены типы в `getUserByTelegramId.ts`
- ✅ Исправлены типы в `core/bot/index.ts`
- ✅ Исправлены типы в `notifyBotOwners.ts`
- ✅ Исправлены типы в `broadcast.service.ts`
- ✅ Обновлен скрипт сборки в package.json
- ✅ Исправлены типы и обработчик webhookCallback в `launch.ts`
- ✅ Внедрен Fastify вместо Express для улучшения типизации и производительности
- ✅ Удалена неиспользуемая функция `production` и заглушка `launch` из `src/utils/launch.ts`
- ✅ Исправлены ошибки типов Express (TS2339) в обработчике Robokassa (теперь в `api-server`).
- ⏳ Скопировать актуальные интерфейсы (`db.interface.ts`, `payments.interface.ts`) в `api-server`.
- ⏳ Реализовать заглушки `updateUserBalance`, `updateUserSubscription` в `api-server`.
- ⏳ Продолжаем исправление типов в других файлах
- ⏳ Рефакторинг обработчиков вебхуков
- ⏳ Проверка и обновление импортов во всех файлах
- ⏳ Проверка типов в generateTextToVideo.ts
- ✅ {current_date}: Упрощены типы операций (`PaymentType`) в коде до `MONEY_INCOME` и `MONEY_OUTCOME`.
- ✅ {current_date}: Рефакторинг расчета стоимости видео (`processBalanceVideoOperation.ts`): используется `VIDEO_MODELS_CONFIG` и `calculateFinalPrice`.
- ✅ {current_date}: Консолидированы константы (`starCost`, `interestRate`, `SYSTEM_CONFIG`) в `@/price/constants/index.ts`, удалены дубликаты.
- ✅ {current_date}: Уточнена логика обработки видеомоделей в `processBalanceVideoOperation.ts` с явным маппингом `VideoModel` на ключи `VIDEO_MODELS_CONFIG`.
- ✅ {current_date}: Удален устаревший тип `VideoModel` из `src/interfaces/models.interface.ts`.
- ✅ {current_date}: Рефакторинг кода (`processBalanceVideoOperation`, `imageToVideoWizard`, `videoModelMenu`, `generateImageToVideo`, `videoModelPrices`, `validateAndCalculateVideoModelPrice`) для использования `keyof typeof VIDEO_MODELS_CONFIG` вместо `VideoModel`.
- ✅ {current_date}: Заменен тип `string` на `VideoModelConfigKey` в `BalanceOperationProps` в `processBalanceVideoOperation.ts`.
- ✅ {current_date}: Исправлена ошибка импорта `VideoModel` и вызова `processBalanceVideoOperation` в `src/services/plan_b/generateTextToVideo.ts` после рефакторинга.
- ✅ {current_date}: Исправлены ошибки компиляции TypeScript в `src/registerCommands.ts` и `src/handlers/handleBuy/index.ts` (ошибки TS2339 и TS2345).
- ✅ {current_date}: Исправлены ошибки типов в `src/core/supabase/getUserDetailsSubscription.ts` (удален импорт `UserRole`).
- ✅ {current_date}: Исправлены ошибки типов в `src/scenes/imageToVideoWizard/index.ts` (исправлен импорт `updateUserModel`, добавлены `await` для `getTranslation`).
- ✅ {current_date}: Исправлена логика цены морфинга в `imageToVideoWizard` (используется цена выбранной Kling-модели).
- ✅ {current_date}: Добавлена проверка флага `is_morphing` в шагах `imageToVideoWizard` для предотвращения ошибок состояния.
- ✅ {current_date}: Удалены вызовы `getTranslation` из `imageToVideoWizard`, тексты локализованы (Ru/En) и добавлены эмодзи ✨ непосредственно в код.
- ✅ {current_date}: Удалены ошибочные вызовы `ctx.scene.saveSession()` из `imageToVideoWizard`.
- ✅ {current_date}: Исправлена логика цены морфинга в `imageToVideoWizard` (используется цена выбранной Kling-модели).
- ✅ {current_date}: Добавлена проверка флага `is_morphing` в шагах `imageToVideoWizard` для предотвращения ошибок состояния.
- ✅ {current_date}: Локализованы тексты (Ru/En) и добавлены эмодзи ✨ в `imageToVideoWizard`.
- ✅ {current_date}: Удалены ошибочные вызовы `ctx.scene.saveSession()` и вызовы `getTranslation` из `imageToVideoWizard`.
- ✅ {current_date}: Исправлена логика цены морфинга и проверка состояния (`is_morphing`) в `imageToVideoWizard`.
- ✅ {current_date}: Исправлен переход между шагами и удалена лишняя клавиатура в `imageToVideoWizard` (морфинг).
- ✅ {current_date}: Исправлены ошибки типов в `src/services/generateImageToVideo.ts` после возврата логики в бота (и улучшено логирование ошибок).
- ✅ {current_date}: Исправлены вызовы `generateImageToVideo` в `imageToVideoWizard`.
- ✅ {current_date}: Добавлен запрос промпта для морфинга в `imageToVideoWizard`.
- ✅ {current_date}: Восстановлена логика выбора режима (Стандарт/Морфинг) для Kling в `imageToVideoWizard`.
- ✅ {current_date}: Сделана попытка исправить вызов API Replicate для морфинга Kling.

### Правила и Консистентность 📜 (НОВЫЙ РАЗДЕЛ)
- **Статус:** ✅ Задачи выполнены.
- ✅ {current_date}: Создано правило Cursor `price-calculation-consistency.mdc` для обеспечения единообразия расчета и отображения цен.
- ✅ {current_date}: Исправлено значение `interestRate` в `constants/index.ts` с 50 на 0.5.
- ✅ {current_date}: Создано правило Cursor `backend-delegation.mdc` о делегировании вызовов внешних API бэкенду.
- ✅ {current_date}: Дополнено правило Cursor `backend-delegation.mdc` информацией об определении URL API сервера.
- ✅ {current_date}: Создано правило Cursor `follow-existing-patterns.mdc` о необходимости следовать существующим паттернам.
- ✅ {current_date}: Создано правило Cursor `local-type-check.mdc` об обязательной локальной проверке типов перед деплоем.
- ✅ 2025-04-23: Удален лишний обработчик `action(/top_up_(\d+)/)` из `starPaymentScene.ts`, чтобы позволить глобальному обработчику в `registerCommands.ts`
- ✅ {current_date}: Исправлены ошибки типов в `src/core/supabase/getUserDetailsSubscription.ts` (удален импорт `UserRole`).
- ✅ {current_date}: Исправлены ошибки типов в `src/scenes/imageToVideoWizard/index.ts` (исправлен импорт `updateUserModel`, добавлены `await` для `getTranslation`).
- ✅ {current_date}: Исправлена логика цены морфинга в `imageToVideoWizard` (используется цена выбранной Kling-модели).
- ✅ {current_date}: Добавлена проверка флага `is_morphing` в шагах `imageToVideoWizard` для предотвращения ошибок состояния.
- ✅ {current_date}: Удалены вызовы `getTranslation` из `imageToVideoWizard`, тексты локализованы (Ru/En) и добавлены эмодзи ✨ непосредственно в код.
- ✅ {current_date}: Удалены ошибочные вызовы `ctx.scene.saveSession()` из `imageToVideoWizard`.
- ✅ {current_date}: Исправлена логика цены морфинга в `imageToVideoWizard` (используется цена выбранной Kling-модели).
- ✅ {current_date}: Добавлена проверка флага `is_morphing` в шагах `imageToVideoWizard` для предотвращения ошибок состояния.
- ✅ {current_date}: Локализованы тексты (Ru/En) и добавлены эмодзи ✨ в `imageToVideoWizard`.
- ✅ {current_date}: Удалены ошибочные вызовы `ctx.scene.saveSession()` и вызовы `getTranslation` из `imageToVideoWizard`.
- ✅ {current_date}: Исправлена логика цены морфинга и проверка состояния (`is_morphing`) в `