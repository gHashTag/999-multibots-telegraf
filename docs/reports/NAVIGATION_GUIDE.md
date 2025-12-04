# 🧭 Руководство по навигации бота

## 📋 Обзор

Система навигации бота была полностью реорганизована для упрощения и централизации управления. Все функции навигации теперь находятся в едином месте и используют единый подход.

---

## 🏗️ Архитектура

### Основные компоненты:

1. **`NavigationService.ts`** - Главный сервис навигации
   - `showMainMenu(ctx)` - Показать главное меню с категориями
   - `showCategoryMenu(ctx, categoryKey)` - Показать меню категории
   - `handleCategoryButtonPress(ctx, buttonText)` - Обработка нажатий кнопок категорий
   - `initializeNavigation(bot)` - Инициализация обработчиков

2. **`CancelButtonService.ts`** - Централизованная обработка отмены
   - `executeCancel(ctx, message?)` - Выполнить отмену и вернуться в меню
   - `executeMainMenu(ctx, message?)` - Перейти в главное меню
   - `handleCancelButton(ctx)` - Обработка кнопки "Отмена"
   - `handleMainMenuButton(ctx)` - Обработка кнопки "Главное меню"

3. **`NavigationService.ts`** - ЕДИНСТВЕННЫЙ источник навигации
   - `CATEGORIES` - Категории меню (Photo, Video, Audio, Avatars, Tools, Profile)
   - `levels` - Обратная совместимость со старым кодом
   - `HAIM_GROUP_STAFF_IDS`, `METAMUSE_STAFF_IDS` - Права доступа
   - `getParsingAccess()` - Проверка доступа к парсингу

---

## 🎯 Структура меню

### Главное меню (showMainMenu):

```
🏠 Главное меню

[📸 Фото] [🎥 Видео]
[🎵 Аудио] [🤖 Аватары]
[🛠️ Инструменты] [👤 Профиль]

[💫 Оформить подписку] [💰 Баланс]
[💎 Пополнить баланс] [💬 Техподдержка]
```

### Категории:

1. **📸 Фото** (`photo`)
   - 📸 Нейрофото
   - 🖼️ Текст в фото
   - 🔍 Промпт из фото
   - И другие...

2. **🎥 Видео** (`video`)
   - 🎬 Нейровидео
   - 📺 Транскрибация Reels
   - И другие...

3. **🎵 Аудио** (`audio`)
   - 🎤 Голосовой клон
   - 🎵 Музыка
   - И другие...

4. **🤖 Аватары** (`avatars`)
   - 🤖 Цифровое тело
   - И другие...

5. **🛠️ Инструменты** (`tools`)
   - Различные инструменты

6. **👤 Профиль** (`profile`)
   - 💫 Оформить подписку
   - 💰 Баланс
   - 💎 Пополнить баланс
   - 💬 Техподдержка

---

## 📝 Использование

### Показать главное меню:

```typescript
import { showMainMenu } from '@/services/NavigationService'

// В любой сцене или обработчике
await showMainMenu(ctx)
```

### Показать меню категории:

```typescript
import { showCategoryMenu } from '@/services/NavigationService'

// Показать меню категории "Фото"
await showCategoryMenu(ctx, 'photo')
```

### Обработка отмены:

```typescript
import { CancelButtonService } from '@/services/CancelButtonService'

// В обработчике кнопки "Отмена"
await CancelButtonService.executeCancel(ctx, 'Отменено. Возвращаю в главное меню.')

// Или просто перейти в главное меню
await CancelButtonService.executeMainMenu(ctx)
```

### Обработка кнопки "Главное меню":

```typescript
import { CancelButtonService } from '@/services/CancelButtonService'

// В обработчике кнопки "Главное меню"
const handled = await CancelButtonService.handleMainMenuButton(ctx)
if (handled) {
  return // Кнопка обработана
}
```

---

## ⚠️ Устаревшие функции (DEPRECATED)

### ❌ НЕ ИСПОЛЬЗУЙТЕ:

```typescript
// ❌ СТАРЫЙ СПОСОБ (больше не работает правильно)
import { mainMenu } from '@/menu/simpleMenu'
await mainMenu({ isRu, subscription, ctx })
// или
await mainMenu(ctx)

// ❌ СТАРЫЙ СПОСОБ (только создает клавиатуру, не отправляет сообщение)
import { createMainMenuKeyboard } from '@/navigation/unified-navigation.config'
const keyboard = createMainMenuKeyboard(ctx)
```

### ✅ ИСПОЛЬЗУЙТЕ ВМЕСТО:

```typescript
// ✅ НОВЫЙ СПОСОБ (правильно показывает меню)
import { showMainMenu } from '@/services/NavigationService'
await showMainMenu(ctx)
```

---

## 🔧 Добавление новой кнопки

### 1. Добавить кнопку в конфигурацию:

Откройте `src/services/NavigationService.ts` и добавьте кнопку в соответствующую категорию в массиве `CATEGORIES`:

```typescript
{
  ru: '🆕 Новая функция',
  en: '🆕 New Feature',
  mode: ModeEnum.NewFeature,
  category: 'tools', // или 'photo', 'video', 'audio', 'avatars', 'profile'
  icon: '🆕',
  adminOnly: false, // true если только для админов
  requiresSubscription: false, // true если требуется подписка
}
```

### 2. Добавить обработчик:

В `NavigationService.ts` добавьте обработчик в функцию `handleCategoryButtonPress`:

```typescript
if (buttonText === (isRu ? '🆕 Новая функция' : '🆕 New Feature')) {
  await ctx.scene.enter(ModeEnum.NewFeature)
  return true
}
```

---

## 🐛 Отладка

### Логирование:

Все функции навигации логируют свои действия через `logger`:

```typescript
logger.info('🎯 [showMainMenu] Starting to show main menu', {
  telegramId: ctx.from?.id,
  currentScene: (ctx as any).scene?.current?.id,
})
```

### Проверка работы:

1. Проверьте логи на наличие сообщений `🎯 [showMainMenu]`
2. Убедитесь, что меню показывается после отмены
3. Проверьте, что кнопки категорий работают правильно

---

## 📚 Связанные файлы

- `src/services/NavigationService.ts` - **ЕДИНСТВЕННЫЙ** источник навигации
- `src/services/CancelButtonService.ts` - Обработка отмены
- `src/scenes/categoryScenes/index.ts` - Сцены категорий
- `src/scenes/menuScene/index.ts` - Сцена главного меню
- `src/scenes/startScene/index.ts` - Сцена старта

---

## ✅ Чек-лист при добавлении новой функции

- [ ] Добавлена кнопка в `NAVIGATION_BUTTONS`
- [ ] Указана правильная категория
- [ ] Указаны права доступа (admin_only, requires_subscription)
- [ ] Добавлен обработчик в `handleCategoryButtonPress`
- [ ] Создана сцена (если нужно)
- [ ] Добавлена обработка отмены через `CancelButtonService`
- [ ] Протестировано локально

---

**Последнее обновление:** 2025-01-12
**Версия:** 2.0 (Централизованная навигация)

