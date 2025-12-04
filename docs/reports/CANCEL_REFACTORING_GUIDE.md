# 🔄 Руководство по Рефакторингу Обработки Отмены

## ✅ Что исправлено

1. **CancelButtonService** теперь использует `showMainMenu()` из NavigationService
2. Единое сообщение: "Отменено. Возвращаю в главное меню." / "Cancelled. Returning to main menu."
3. Правильный возврат в главное меню с показом меню

## 🎯 Стандарт обработки отмены

### ✅ ПРАВИЛЬНО: Использовать CancelButtonService

```typescript
import { CancelButtonService } from '@/services/CancelButtonService'

// В начале шага wizard'а
const handled = await CancelButtonService.handleCancelAndMenu(ctx)
if (handled) return

// Или для inline кнопок
scene.action('cancel', async ctx => {
  await ctx.answerCbQuery()
  await CancelButtonService.executeCancel(ctx)
})

// Или с кастомным сообщением
await CancelButtonService.executeMainMenu(
  ctx,
  isRu ? 'Отменено. Возвращаю в главное меню.' : 'Cancelled. Returning to main menu.'
)
```

### ❌ НЕПРАВИЛЬНО: Прямой вызов scene.enter

```typescript
// ❌ НЕ ДЕЛАТЬ ТАК
await ctx.scene.leave()
await ctx.scene.enter(ModeEnum.MainMenu)

// ❌ НЕ ДЕЛАТЬ ТАК
await ctx.reply('Отменено')
await ctx.scene.enter('main_menu')
```

## 📋 Список сцен для рефакторинга

### Высокий приоритет (часто используемые):

1. ✅ `checkBalanceScene.ts` - уже использует CancelButtonService
2. ❌ `textToImageWizard/index.ts` - нужно проверить
3. ❌ `neuroPhotoWizard/index.ts` - нужно проверить
4. ❌ `selectModelWizard/index.ts` - нужно проверить
5. ❌ `balanceScene/index.ts` - нужно заменить на CancelButtonService

### Средний приоритет:

6. ❌ `morphingWizard/index.ts` - использует прямой вызов
7. ❌ `fluxKontextScene/index.ts` - использует прямой вызов
8. ❌ `aiPhotoshopScene/index.ts` - использует прямой вызов
9. ❌ `avatarTransformScene/index.ts` - много прямых вызовов
10. ❌ `improvePromptWizard/index.ts` - много прямых вызовов

### Низкий приоритет:

11. ❌ `voiceAvatarWizard/index.ts`
12. ❌ `textToSpeechWizard/index.ts`
13. ❌ `subscriptionScene/index.ts`
14. ❌ `lipSyncWizard/*` - все файлы
15. ❌ Остальные сцены

## 🔧 Пример рефакторинга

### До:

```typescript
// ❌ Старый код
if (text === (isRu ? 'Отмена' : 'Cancel')) {
  await ctx.reply(
    isRu ? '❌ Процесс отменён. Возвращаюсь в главное меню.' : '❌ Process cancelled. Returning to main menu.',
    { reply_markup: { remove_keyboard: true } }
  )
  await ctx.scene.leave()
  return ctx.scene.enter(ModeEnum.MainMenu)
}
```

### После:

```typescript
// ✅ Новый код
import { CancelButtonService } from '@/services/CancelButtonService'

// В начале шага
const handled = await CancelButtonService.handleCancelAndMenu(ctx)
if (handled) return

// Или для action handlers
scene.action('cancel', async ctx => {
  await ctx.answerCbQuery()
  await CancelButtonService.executeCancel(ctx)
})
```

## 📝 Единое сообщение об отмене

**Русский:** "Отменено. Возвращаю в главное меню."
**Английский:** "Cancelled. Returning to main menu."

Это сообщение уже используется в `CancelButtonService.executeCancel()`.

## ⚠️ Важно

1. **Всегда** используйте `CancelButtonService` для обработки отмены
2. **Никогда** не вызывайте `ctx.scene.enter(ModeEnum.MainMenu)` напрямую
3. **Всегда** используйте единое сообщение об отмене
4. **Проверяйте** что меню показывается после отмены

## 🚀 Следующие шаги

1. Рефакторить критические сцены (высокий приоритет)
2. Рефакторить остальные сцены постепенно
3. Удалить все прямые вызовы `ctx.scene.enter(ModeEnum.MainMenu)`
4. Обновить тесты

