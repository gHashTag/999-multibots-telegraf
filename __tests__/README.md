# Руководство по написанию тестов для сцен

## 🧪 Запуск тестов

```bash
# Запуск всех тестов
npm test

# Запуск тестов через Docker
docker-compose -f docker-compose.test.yml up
```

В каталоге `__tests__/scenes` содержатся тесты для WizardScene, определенных в `src/scenes`.
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

## 🎬 Покрытие тестами сцен

**Покрытые тестами сцены**:

- ✅ avatarBrainWizard
- ✅ balanceScene
- ✅ cancelPredictionsWizard
- ✅ chatWithAvatarWizard
- ✅ checkBalanceScene
- ✅ createUserScene
- ✅ digitalAvatarBodyWizard
- ✅ digitalAvatarBodyWizardV2
- ✅ emailWizard
- ✅ generateImageWizard
- ✅ getEmailWizard
- ✅ getRuBillWizard
- ✅ helpScene
- ✅ imageToPromptWizard
- ✅ imageToVideoWizard
- ✅ improvePromptWizard
- ✅ inviteScene
- ✅ menuScene
- ✅ neuroPhotoWizard
- ✅ paymentScene
- ✅ selectModelWizard
- ✅ sizeWizard
- ✅ startScene
- ✅ subscriptionCheckScene
- ✅ subscriptionScene
- ✅ textToImageWizard
- ✅ textToSpeechWizard

**Сцены, требующие покрытия тестами**:

- ❌ levelQuestWizard
- ❌ lipSyncWizard
- ❌ neuroCoderScene
- ❌ neuroPhotoWizardV2
- ❌ paymentWizard
- ❌ textToVideoWizard
- ❌ trainFluxModelWizard
- ❌ uploadTrainFluxModelScene
- ❌ uploadVideoScene
- ❌ voiceAvatarWizard
