# Тестовый Модуль: Прейскурант и Диагностика Цен ⭐

Этот документ содержит актуальный прейскурант цен, рассчитанный с использованием `calculateFinalStarPrice`, и статус покрытия тестами для модуля ценообразования.

## 💰 Прейскурант (Стоимость в звездах ⭐)

Цены рассчитаны с учетом текущих конфигураций (`STAR_COST_USD=0.016`, `MARKUP_MULTIPLIER=1.5`) и могут изменяться.

| Режим (ModeEnum)                      | Пример Параметров        | Стоимость ⭐ |
| :------------------------------------ | :----------------------- | :----------- |
| `ModeEnum.NeuroPhoto`                 | `numImages: 1`           | 9            |
| `ModeEnum.NeuroPhoto`                 | `numImages: 3`           | 28           |
| `ModeEnum.NeuroPhotoV2`               | `numImages: 1`           | 14           |
| `ModeEnum.VoiceToText`                | -                        | 4            |
| `ModeEnum.TextToSpeech`               | -                        | 1            |
| `ModeEnum.LipSync`                    | -                        | 2            |
| `ModeEnum.DigitalAvatarBody`          | `steps: 10`              | 93           |
| `ModeEnum.DigitalAvatarBodyV2`        | `steps: 10`              | 187          |
| `ModeEnum.TextToVideo`                | `modelId: 'ray-v2'`      | 16           |
| `ModeEnum.TextToVideo`                | `modelId: 'minimax'`     | 46           |
| `ModeEnum.ImageToVideo`               | `modelId: 'ray-v2'`      | 16           |
| `ModeEnum.ImageToVideo`               | `modelId: 'minimax'`     | 46           |
| `ModeEnum.TextToImage`                | `modelId: 'flux-pro'`    | 5            |
| `ModeEnum.TextToImage`                | `modelId: 'no-exist'`    | 0            |
| `ModeEnum.MainMenu`                   | -                        | 0            |
| `ModeEnum.ImageToPrompt`              | -                        | 0            |
| `ModeEnum.Subscribe`                  | -                        | 0            |
| `ModeEnum.Avatar`                     | -                        | 0            |
| `ModeEnum.ChatWithAvatar`             | -                        | 0            |
| `ModeEnum.SelectModel`                | -                        | 0            |
| `ModeEnum.SelectAiTextModel`          | -                        | 0            |
| `ModeEnum.SelectModelWizard`          | -                        | 0            |
| `ModeEnum.Voice`                      | -                        | 0            |
| `ModeEnum.SelectNeuroPhoto`           | -                        | 0            |
| `ModeEnum.ChangeSize`                 | -                        | 0            |
| `ModeEnum.Invite`                     | -                        | 0            |
| `ModeEnum.Help`                       | -                        | 0            |
| `ModeEnum.Balance`                    | -                        | 0            |
| `ModeEnum.ImprovePrompt`              | -                        | 0            |
| `ModeEnum.TopUpBalance`               | -                        | 0            |
| `ModeEnum.VideoInUrl`                 | -                        | 0            |
| `ModeEnum.Support`                    | -                        | 0            |
| `ModeEnum.Stats`                      | -                        | 0            |
| `ModeEnum.BroadcastWizard`            | -                        | 0            |
| `ModeEnum.SubscriptionCheckScene`     | -                        | 0            |
| `ModeEnum.ImprovePromptWizard`        | -                        | 0            |
| `ModeEnum.SizeWizard`                 | -                        | 0            |
| `ModeEnum.PaymentScene`               | -                        | 0            |
| `ModeEnum.InviteScene`                | -                        | 0            |
| `ModeEnum.BalanceScene`               | -                        | 0            |
| `ModeEnum.Step0`                      | -                        | 0            |
| `ModeEnum.NeuroCoderScene`            | -                        | 0            |
| `ModeEnum.CheckBalanceScene`          | -                        | 0            |
| `ModeEnum.CancelPredictionsWizard`    | -                        | 0            |
| `ModeEnum.EmailWizard`                | -                        | 0            |
| `ModeEnum.GetRuBillWizard`            | -                        | 0            |
| `ModeEnum.SubscriptionScene`          | -                        | 0            |
| `ModeEnum.CreateUserScene`            | -                        | 0            |
| `ModeEnum.StartScene`                 | -                        | 0            |
| `ModeEnum.Price`                      | -                        | 0            |
| `ModeEnum.RublePaymentScene`          | -                        | 0            |
| `ModeEnum.StarPaymentScene`           | -                        | 0            |
| `ModeEnum.MenuScene`                  | -                        | 0            |

*Примечание: Для режимов, зависящих от модели или шагов, приведены примеры с конкретными параметрами. Стоимость для других моделей/количества шагов будет отличаться.* 
*Режимы, не указанные явно как платные, считаются бесплатными (0 ⭐).*

## 📊 Диагностика Тестирования

*   **`src/price/calculator.ts`:**
    *   **Статус:** ✅ Покрыт юнит-тестами (`src/__tests__/price/calculator.test.ts`).
    *   **Покрытые аспекты:**
        *   Расчет для фиксированных цен.
        *   Расчет для цен по шагам (`steps`).
        *   Расчет для цен по моделям (`modelId` для видео и изображений).
        *   Обработка параметра `numImages`.
        *   Обработка бесплатных/неизвестных режимов.
        *   Обработка отсутствующих `modelId` / `steps`.
    *   **Пропущенные тесты:** 1 тест на округление (`vi.doMock` нестабилен).
*   **`src/scenes/checkBalanceScene.ts`:**
    *   **Статус:** ⚠️ Интеграционные тесты (`src/__tests__/scenes/checkBalanceScene.integration.test.ts`) временно **не запускаются** из-за ошибки инициализации `BOT_TOKEN_1` при импорте зависимостей.
    *   **Требуется:** Рефакторинг `src/core/bot/index.ts` для отложенной инициализации Telegraf или иное решение проблемы с `.env` переменными в тестах.
*   **Списание средств (`updateUserBalance`):**
    *   **Статус:** ✅ Логика вызова `updateUserBalance` с правильными параметрами (отрицательная стоимость, тип `MONEY_OUTCOME`) проверена в интеграционных тестах (когда они работали).
*   **Возвраты (Refund):**
    *   **Статус:** ❓ Не исследовано. Текущие тесты не покрывают логику возвратов. Необходимо проверить код на наличие такой функциональности и добавить тесты при необходимости. 

## 🔬 Себестоимость и Ценообразование (Оценка)

Эта таблица сравнивает примерную себестоимость операций, использующих Replicate, с нашей текущей ценой для пользователя.

**Параметры Расчета:**
*   `STAR_COST_USD` (Стоимость 1 ⭐ для нас): $0.016
*   Цены Replicate взяты с [https://replicate.com/pricing](https://replicate.com/pricing) (могут меняться).
*   Время выполнения моделей на Replicate - это **оценка**, реальная стоимость может отличаться.
*   Наша Цена (USD) = Наша Цена (⭐) * `STAR_COST_USD`
*   Маржа (USD) = Наша Цена (USD) - Себестоимость (USD)
*   Маржа (%) = (Маржа (USD) / Наша Цена (USD)) * 100

| Услуга (Режим)         | Модель Replicate (Пример)        | Оборудование (Replicate) | Себестоимость (USD, прибл.) | Наша Цена (⭐) | Наша Цена (USD) | Маржа (USD, прибл.) | Маржа (%, прибл.) |
| :--------------------- | :------------------------------- | :----------------------- | :-------------------------- | :------------- | :--------------- | :------------------- | :----------------- |
| `TextToImage`          | `flux-1.1-pro`                   | L40S (?)                 | $0.0039 (4s @ $0.000975/s)  | 5              | $0.080           | $0.076              | 95.1%              |
| `TextToVideo`          | `ray-v2` (Luma)                  | A100 (80GB) (?)          | $0.021 (15s @ $0.001400/s) | 16             | $0.256           | $0.235              | 91.8%              |
| `TextToVideo`          | `minimax`                        | A100 (80GB) (?)          | $0.021 (15s @ $0.001400/s) | 46             | $0.736           | $0.715              | 97.1%              |
| `DigitalAvatarBodyV2`  | *Custom Cog Model?*              | T4 (?)                   | $0.0225 (100s @ $0.000225/s)| 187            | $2.992           | $2.969              | 99.2%              |
| `VoiceToText`          | *Whisper/AssemblyAI?*            | CPU / T4 (?)             | $0.001 (10s @ $0.000100/s)  | 4              | $0.064           | $0.063              | 98.4%              |
| `TextToSpeech`         | *ElevenLabs/OpenAI TTS?*         | CPU (?)                  | $0.0001 (1s @ $0.000100/s)   | 1              | $0.016           | $0.016              | ~100%              |
| `LipSync`              | *Wav2Lip/SadTalker?*             | T4 (?)                   | $0.0045 (20s @ $0.000225/s)  | 2              | $0.032           | $0.028              | 87.5%              |

**Важные Замечания:**
*   Тип оборудования Replicate для некоторых моделей - это **предположение**. Реальные затраты могут отличаться.
*   Время выполнения взято **приблизительно**. Сложность запроса сильно влияет на время и, соответственно, на себестоимость.
*   Для `VoiceToText`, `TextToSpeech`, `LipSync` используются *другие* API (не Replicate напрямую), их себестоимость оценена очень грубо.
*   Высокий процент маржи может указывать на то, что `STAR_COST_USD` ($0.016) уже включает значительную наценку сверх прямых затрат на API, либо наши оценки себестоимости занижены. 