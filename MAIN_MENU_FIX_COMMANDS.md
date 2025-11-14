# Команды для исправления кнопок "Главное меню"

## Быстрые команды для поиска и замены

### 1. Найти все несоответствия

```bash
# Найти все "Main Menu" (с заглавной M)
grep -rn "🏠 Main Menu" src/ --include="*.ts"

# Найти все "🚪 Главное меню" (иконка двери)
grep -rn "🚪 Главное меню\|🚪 Main menu" src/ --include="*.ts"

# Найти "В главное меню"
grep -rn "В главное меню" src/ --include="*.ts"

# Найти все обработчики главного меню
grep -rn "hears.*Главное меню\|action.*go_main_menu" src/ --include="*.ts"
```

---

## 2. Исправить регистр (Main Menu → Main menu)

### Автоматическая замена во всех файлах:

```bash
# macOS/BSD sed
find src/ -name "*.ts" -exec sed -i '' 's/🏠 Main Menu/🏠 Main menu/g' {} +

# Linux sed
find src/ -name "*.ts" -exec sed -i 's/🏠 Main Menu/🏠 Main menu/g' {} +
```

### Или вручную для каждого файла:

```bash
# scenes/aiPhotoshopScene/index.ts:3103
sed -i '' 's/🏠 Main Menu/🏠 Main menu/g' src/scenes/aiPhotoshopScene/index.ts

# scenes/textToVideoWizard/index.ts:267
sed -i '' 's/🏠 Main Menu/🏠 Main menu/g' src/scenes/textToVideoWizard/index.ts

# scenes/menuScene/index.ts
sed -i '' 's/🏠 Main Menu/🏠 Main menu/g' src/scenes/menuScene/index.ts

# utils/errorHandler.ts:129
sed -i '' 's/🏠 Main Menu/🏠 Main menu/g' src/utils/errorHandler.ts

# components/menu/MenuActionRegistry.ts:193
sed -i '' 's/🏠 Main Menu/🏠 Main menu/g' src/components/menu/MenuActionRegistry.ts

# components/menu/VideoGenerationHandler.ts:292
sed -i '' 's/🏠 Main Menu/🏠 Main menu/g' src/components/menu/VideoGenerationHandler.ts

# modules/videoGenerator/generateImageToVideo.ts
sed -i '' 's/🏠 Main Menu/🏠 Main menu/g' src/modules/videoGenerator/generateImageToVideo.ts

# handlers/handleTextToVideoDirect.ts:536
sed -i '' 's/🏠 Main Menu/🏠 Main menu/g' src/handlers/handleTextToVideoDirect.ts

# services/CancelButtonService.ts
sed -i '' 's/🏠 Main Menu/🏠 Main menu/g' src/services/CancelButtonService.ts

# services/generateMorphing.ts
sed -i '' 's/🏠 Main Menu/🏠 Main menu/g' src/services/generateMorphing.ts

# services/generateFluxKontext.ts:1019
sed -i '' 's/🏠 Main Menu/🏠 Main menu/g' src/services/generateFluxKontext.ts
```

---

## 3. Исправить формулировку

```bash
# instagramParserScene/index.ts:332
# Заменить '🏠 В главное меню' на '🏠 Главное меню'
sed -i '' "s/'🏠 В главное меню'/'🏠 Главное меню'/g" src/scenes/instagramParserScene/index.ts
```

---

## 4. Проверить результат

```bash
# Проверить, что больше нет "Main Menu" с заглавной M
grep -rn "🏠 Main Menu" src/ --include="*.ts"

# Должен вернуть "No matches found"
```

---

## 5. Рекомендуемые изменения кода

### Использовать константу вместо хардкода

**До:**
```typescript
isRu ? '🏠 Главное меню' : '🏠 Main menu'
```

**После:**
```typescript
import { SERVICE_BUTTONS } from '@/navigation/unified-navigation.config'

isRu ? SERVICE_BUTTONS.main_menu.ru : SERVICE_BUTTONS.main_menu.en
```

---

## 6. Удалить дублирующиеся обработчики

### Option A: Удалить из hearsHandlers.ts

```typescript
// УДАЛИТЬ эти строки из src/hearsHandlers.ts:179-192
bot.hears(['🏠 Главное меню', '🏠 Main menu'], async ctx => {
  logger.info('GLOBAL HEARS: Главное меню', {
    telegramId: ctx.from?.id,
  })
  try {
    await ctx.scene.leave()
    await ctx.scene.enter(ModeEnum.MainMenu)
  } catch (error) {
    logger.error('Error in Главное меню hears:', {
      error,
      telegramId: ctx.from?.id,
    })
  }
})
```

**Причина**: Уже есть обработчик в `registerCommands.ts:252`

### Option B: Удалить локальные обработчики из Payment Scenes

```typescript
// УДАЛИТЬ из src/scenes/paymentScene/index.ts:148
paymentScene.hears(['🏠 Главное меню', '🏠 Main menu'], async ctx => { ... })

// УДАЛИТЬ из src/scenes/rublePaymentScene.ts:536
rublePaymentScene.hears(['🏠 Главное меню', '🏠 Main menu'], async ctx => { ... })

// УДАЛИТЬ из src/scenes/starPaymentScene.ts:53
starPaymentScene.hears(['🏠 Главное меню', '🏠 Main menu'], async ctx => { ... })
```

**Причина**: Глобальный обработчик работает во всех сценах

---

## 7. AI Photoshop - специальный случай

**Вариант 1**: Изменить на стандартную кнопку

```typescript
// В src/scenes/aiPhotoshopScene/index.ts
// Заменить все:
isRu ? '🚪 Главное меню' : '🚪 Main menu'

// На:
isRu ? '🏠 Главное меню' : '🏠 Main menu'

// И заменить callback:
'ai_photoshop_exit_to_menu' → 'go_main_menu'
```

**Вариант 2**: Оставить как есть, но документировать

Добавить комментарий:
```typescript
// ⚠️ ИСКЛЮЧЕНИЕ: AI Photoshop использует иконку 🚪 для визуального отличия
// и собственный обработчик 'ai_photoshop_exit_to_menu'
```

---

## 8. Проверка после изменений

```bash
# 1. Убедиться, что все "Main Menu" в нижнем регистре
grep -rn "Main Menu" src/ --include="*.ts"

# 2. Убедиться, что нет "В главное меню"
grep -rn "В главное меню" src/ --include="*.ts"

# 3. Найти все обработчики главного меню
grep -rn "hears.*главное меню\|Main menu" src/ --include="*.ts" -i

# 4. Проверить использование SERVICE_BUTTONS
grep -rn "SERVICE_BUTTONS.main_menu" src/ --include="*.ts"
```

---

## 9. Git commit после исправлений

```bash
git add .
git commit -m "🔧 FIX: Унифицировать кнопки 'Главное меню'

- Исправлен регистр: 'Main Menu' → 'Main menu' (18 файлов)
- Исправлена формулировка в instagramParserScene
- Документированы исключения (AI Photoshop)
- Удалены дублирующиеся обработчики

См. MAIN_MENU_BUTTONS_ANALYSIS.md для деталей"
```

---

## 10. Создать хелпер для единообразия

**Новый файл**: `src/helpers/mainMenuButton.ts`

```typescript
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { SERVICE_BUTTONS } from '@/navigation/unified-navigation.config'
import { Markup } from 'telegraf'

/**
 * Возвращает текст кнопки "Главное меню" в зависимости от языка
 */
export function getMainMenuText(ctx: MyContext): string {
  const isRu = isRussianFromState(ctx)
  return isRu ? SERVICE_BUTTONS.main_menu.ru : SERVICE_BUTTONS.main_menu.en
}

/**
 * Создает ReplyKeyboard кнопку "Главное меню"
 */
export function createMainMenuButton(ctx: MyContext) {
  return Markup.button.text(getMainMenuText(ctx))
}

/**
 * Создает InlineKeyboard кнопку "Главное меню"
 */
export function createMainMenuInlineButton(ctx: MyContext) {
  const isRu = isRussianFromState(ctx)
  return Markup.button.callback(
    isRu ? SERVICE_BUTTONS.main_menu.ru : SERVICE_BUTTONS.main_menu.en,
    'go_main_menu'
  )
}
```

**Использование:**

```typescript
import { createMainMenuButton, createMainMenuInlineButton } from '@/helpers/mainMenuButton'

// ReplyKeyboard
await ctx.reply('Выберите действие:', {
  reply_markup: {
    keyboard: [
      [createMainMenuButton(ctx)]
    ]
  }
})

// InlineKeyboard
await ctx.reply('Выберите действие:', {
  reply_markup: {
    inline_keyboard: [
      [createMainMenuInlineButton(ctx)]
    ]
  }
})
```

---

## Итого команд для выполнения:

```bash
# 1. Backup текущего состояния
git stash

# 2. Исправить регистр (автоматически)
find src/ -name "*.ts" -exec sed -i '' 's/🏠 Main Menu/🏠 Main menu/g' {} +

# 3. Исправить формулировку
sed -i '' "s/'🏠 В главное меню'/'🏠 Главное меню'/g" src/scenes/instagramParserScene/index.ts

# 4. Проверка
grep -rn "Main Menu\|В главное меню" src/ --include="*.ts"

# 5. Commit
git add .
git commit -m "🔧 FIX: Унифицировать кнопки 'Главное меню'"
```
