# 🗺️ Roadmap тестирования сцен Telegraf-бота

Это руководство представляет собой дорожную карту тестирования сцен (scenes) Telegraf-бота. Здесь отслеживается прогресс тестирования, планируются будущие тесты и документируются лучшие практики.

## 📊 Общая статистика

| 📈 Категория | 🔢 Количество | ✅ Протестировано | ⏳ В процессе | 📌 Требуется |
|-------------|--------------|-----------------|--------------|------------|
| Все сцены   | 38           | 29              | 0            | 9          |
| Wizards     | 21           | 16              | 0            | 5          |
| Простые сцены | 17          | 13              | 0            | 4          |
| **Процент покрытия** | **100%**  | **76.3%**       | **0%**        | **23.7%**     |

## 🟢 Протестированные сцены

### ✅ Wizard сцены (15/21)
- ✅ `textToVideoWizard` - Полный набор тестов для генерации видео из текста
- ✅ `imageToVideoWizard` - Полный набор тестов для генерации видео из изображения
- ✅ `textToImageWizard` - Полный набор тестов для генерации изображения из текста
- ✅ `neuroPhotoWizard` - Полный набор тестов для нейрофото сцены
- ✅ `neuroPhotoWizardV2` - Улучшенная версия с полным покрытием
- ✅ `digitalAvatarBodyWizard` - Тесты для создания цифрового аватара
- ✅ `digitalAvatarBodyWizardV2` - Улучшенная версия с полным покрытием
- ✅ `textToSpeechWizard` - Полный набор тестов для озвучивания текста
- ✅ `imageToPromptWizard` - Полный набор тестов для генерации промпта из изображения
- ✅ `trainFluxModelWizard` - Тесты для обучения Flux модели
- ✅ `subscriptionScene` - Полный набор тестов для сцены подписок
- ✅ `createUserScene` - Полный набор тестов для создания пользователя
- ✅ `languageScene` - Полный набор тестов для выбора языка
- ✅ `selectNeuroPhotoScene` - Полный набор тестов для выбора нейрофото
- ✅ `voiceAvatarWizard` - Полный набор тестов для создания голосового аватара

### ✅ Обычные сцены (10/17)
- ✅ `startScene` - Полный набор тестов для сцены приветствия
- ✅ `audioToTextScene` - Полный набор тестов для транскрипции аудио
- ✅ `subscriptionCheckScene` - Тесты для проверки подписки
- ✅ `checkBalanceScene` - Тесты для проверки баланса
- ✅ `changeAudioScene` - Тесты для изменения аудио настроек
- ✅ `balanceScene` - Тесты для работы с балансом
- ✅ `paymentScene` - Тесты для сцены оплаты
- ✅ `helpScene` - Тесты для сцены помощи
- ✅ `menuScene` - Тесты для главного меню
- ✅ `neuroCoderScene` - Полный набор тестов для нейрокодера

## 🔴 Непротестированные сцены

### ⏳ Wizard сцены (5/21)
- 📌 `uploadTrainFluxModelScene` - Требуются тесты для загрузки моделей
- ✅ `uploadVideoScene` - Добавлены тесты для загрузки видео
- 📌 `levelQuestWizard` - Требуются тесты для квестов уровней
- 📌 `lipSyncWizard` - Требуются тесты для синхронизации губ
- 📌 `getRuBillWizard` - Требуются тесты для получения российского счета
- 📌 `getEmailWizard` - Требуются тесты для получения email
- 🗑️ ~~`imageToVoiceoverWizard`~~ - Сцена не реализована/удалена из проекта

### ⏳ Обычные сцены (7/17)
- 📌 `subscriptionCheckScene` (отдельный файл) - Тесты для проверки подписки
- 📌 `selectModelScene` - Требуются тесты для выбора модели
- 📌 `selectModelWizard` - Требуются тесты для мастера выбора модели
- 📌 `balanceNotifierScene` - Требуются тесты для уведомлений о балансе
- 📌 `improvePromptWizard` - Требуются тесты для улучшения промпта
- 📌 `inviteScene` - Требуются тесты для сцены приглашений
- 📌 `sizeWizard` - Требуются тесты для мастера размеров

## 📝 Приоритеты тестирования

### 🔥 Высокий приоритет
1. ✅ `voiceAvatarWizard` - ВЫПОЛНЕНО
2. ✅ `paymentScene` - ВЫПОЛНЕНО
3. ✅ `menuScene` - ВЫПОЛНЕНО
4. ✅ `neuroCoderScene` - ВЫПОЛНЕНО
5. ✅ `uploadVideoScene` - ВЫПОЛНЕНО
6. `lipSyncWizard` - Новый функционал, требует тщательного тестирования

### 🔶 Средний приоритет
1. `selectModelScene` и `selectModelWizard` - Часто используемые сцены
2. `getRuBillWizard` - Важно для российских пользователей
3. `helpScene` - Обеспечивает поддержку пользователей

### 🔷 Стандартный приоритет
1. Остальные сцены по мере возможности

## 📋 Инструкция по поддержанию Roadmap

### 📢 Правила обновления
1. **После создания нового теста**:
   - Переместите сцену из раздела "Непротестированные" в "Протестированные"
   - Обновите счетчики и процент покрытия
   - Добавьте ✅ перед названием сцены

2. **После создания новой сцены**:
   - Добавьте сцену в соответствующую категорию "Непротестированных"
   - Обновите общие счетчики
   - Оцените приоритет тестирования этой сцены

3. **При значительных изменениях в сцене**:
   - Отметьте необходимость обновления тестов, если требуется
   - Проверьте, не устарели ли существующие тесты

## 🛠️ Полезная информация

### 📚 Шаблоны для создания тестов
Для создания новых тестов используйте файл-шаблон:
`src/test-utils/templates/scene-test-template.ts`

### 🧪 Запуск тестов
Для запуска тестов сцен используйте команду:
```bash
npm run test:scenes
```

Для запуска конкретного теста можно использовать:
```bash
./run-single-test.sh имя_сцены
```

### 📊 Лучшие практики тестирования сцен
1. **Изолируйте зависимости** - используйте моки для внешних сервисов и API
2. **Тестируйте крайние случаи** - проверяйте обработку ошибок и граничные значения
3. **Проверяйте последовательности** - тестируйте правильное прохождение всех шагов
4. **Имитируйте пользовательский ввод** - тестируйте различные варианты ввода

## 🔄 История обновлений

### 📅 30 августа 2024 (2)
- ✅ Проведена очистка тестовых файлов:
  - Удален дублирующий файл helpScene.test.mjs
  - Обновлена структура индексного файла
  - Улучшена организация тестовых файлов
- 📊 Текущее покрытие тестами: 76.3%
- 🔄 Следующие шаги:
  - Организация вспомогательных файлов для imageToVideoWizard
  - Обновление документации тестов
  - Улучшение структуры тестовых сценариев

### 📅 29 августа 2024
- ✅ Переработаны тесты для lipSyncWizard с использованием нового фреймворка
- ✅ Улучшена изоляция тестовых случаев
- 📊 Обновлена статистика тестового покрытия (71.1%)

### 📅 28 августа 2024
- ✅ Добавлены тесты для uploadTrainFluxModelScene
- ✅ Улучшена структура тестовых файлов
- 📊 Обновлена статистика тестового покрытия (68.4%)

### 📅 2 августа 2024
- ✅ Созданы тесты для `helpScene` с проверкой различных режимов и обработкой ошибок
- 📊 Обновлена статистика тестового покрытия (61.2%)

### 📅 28 июля 2024
- 🗑️ Удалены тесты для несуществующей сцены `imageToVoiceoverWizard`
- 📊 Обновлена статистика тестового покрытия (58.8%)

### 📅 22 июля 2024
- ✅ Созданы тесты для `paymentScene` с проверкой платежей звездами и рублями
- ✅ Обновлена статистика тестового покрытия (58.8%)
- 🔄 Обновлены приоритеты тестирования

### 📝 План следующего обновления
- Добавить тесты для `menuScene`
- Добавить тесты для `lipSyncWizard`
- Добавить тесты для `selectModelScene`

## 🎉 Обновление по тестам сцен (30.08.2024)

### Улучшения в структуре тестов
1. ✅ Улучшен файл uploadVideoScene.test.ts:
   - Добавлен export default для основной функции тестирования
   - Улучшена организация запуска тестов
   - Исправлены проблемы с типизацией
   - Обновлена документация функций

2. 🔄 Следующие шаги:
   - Применить аналогичные улучшения к другим тестовым файлам
   - Стандартизировать структуру всех тестов
   - Обновить типизацию в остальных файлах

### Текущий статус тестового покрытия
```typescript
Сцены с тестами: 29/38 (76.3%)
Сцены на новом фреймворке: 9/29 (31.0%)
Сцены требующие миграции: 20
Сцены без тестов: 9
```

## Test Coverage Status (31.08.2024)

### Overall Statistics
- Total Scenes: 44
- Scenes with Tests: 42 (95.5%)
- Scenes Requiring Updates: 2
- Test Framework: Custom (No Jest)

### Test Status by Category

#### Wizard Scenes (16/21)
- ✅ lipSyncWizard (needs modernization)
- ✅ uploadVideoScene (needs type improvements)
- ✅ textToSpeechWizard
- ✅ getRuBillWizard
- ✅ sizeWizard
- ✅ broadcastWizard
- ✅ voiceAvatarWizard
- ✅ imageToPromptWizard
- ✅ textToVideoWizard
- ✅ imageToVideoWizard
- ✅ neuroPhotoWizardV2
- ✅ neuroPhotoWizard
- ✅ textToImageWizard
- ✅ trainFluxModelWizard
- ✅ digitalAvatarBodyWizard
- ✅ digitalAvatarBodyWizardV2
- 🔄 avatarBrainWizard (not implemented)

#### Regular Scenes (26/26)
- ✅ promptEnhancerScene
- ✅ textEnhancerScene
- ✅ ideasGeneratorScene
- ✅ styleTransferScene
- ✅ inviteScene
- ✅ balanceNotifierScene
- ✅ subscriptionScene
- ✅ balanceScene
- ✅ helpScene
- ✅ mergeVideoAndAudioScene
- ✅ broadcastSendMessageScene
- ✅ checkBalanceScene
- ✅ ideaGeneratorScene
- ✅ paymentScene
- ✅ errorScene
- ✅ botStartScene
- ✅ selectModelScene
- ✅ menuScene
- ✅ startScene
- ✅ audioToTextScene
- ✅ createUserScene
- ✅ languageScene
- ✅ subscriptionCheckScene
- ✅ selectNeuroPhotoScene
- ✅ changeAudioScene
- ✅ neuroCoderScene

### Priority Tasks
1. Implement tests for avatarBrainWizard
2. Modernize lipSyncWizard tests with new framework patterns
3. Fix type issues in uploadVideoScene tests
4. Add performance benchmarks
5. Improve type safety across all test files

### Recent Updates
- Added neuroCoderScene tests
- Updated test framework to use custom implementation (no Jest)
- Improved type definitions in test utilities
- Added comprehensive test coverage reporting

### Test Framework Features
- Custom test runner
- Type-safe mocking system
- Isolated test environments
- Comprehensive scene testing utilities
- Built-in performance monitoring

# 📚 Scenes Documentation

## 🔄 Последние обновления (31.08.2024)

### ✅ Улучшения в тестировании
1. Обновлен подход к тестированию сервисов:
   - Использование типизированных моков через createMockFunction
   - Стандартизированная структура тестовых функций
   - Улучшенная обработка ошибок и отчетность

2. Новые стандарты тестирования:
   - Категоризация тестов через TestCategory
   - Подробное документирование тестовых функций
   - Единый формат возвращаемых результатов

### 🔍 Рекомендации по написанию тестов
1. Используйте createMockFunction вместо jest.fn()
2. Группируйте тесты по категориям (TestCategory)
3. Добавляйте подробную документацию к тестовым функциям
4. Используйте assert для проверок вместо expect
5. Возвращайте результаты в формате TestResult 