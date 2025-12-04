# 🎯 Как использовать NavigationService

## ✅ Что изменилось

Вместо разрозненной логики в `hearsHandlers.ts`, `menuScene`, `startScene` теперь **ВСЯ** навигация управляется через один модуль: `NavigationService.ts`

## 📝 Интеграция в registerCommands.ts

### 1. Импортируем NavigationService

```typescript
// В начале файла registerCommands.ts
import { initializeNavigation } from '@/services/NavigationService'
import { categoryScenes } from '@/scenes/categoryScenes'
```

### 2. Добавляем сцены категорий в список регистрируемых сцен

```typescript
// В массиве scenesToRegister (около строки 111)
const scenesToRegister = [
  startScene,
  menuScene,
  helpScene,
  // ... остальные сцены ...
  
  // ✅ ДОБАВЛЯЕМ СЦЕНЫ КАТЕГОРИЙ
  ...categoryScenes,
]
```

### 3. Заменяем setupHearsHandlers на initializeNavigation

```typescript
// В функции registerCommands, вместо:
// setupHearsHandlers(bot)

// Используем:
initializeNavigation(bot)
```

### 4. Обновляем startScene и menuScene

В `startScene/index.ts` и `menuScene/index.ts` используем функцию `showMainMenu`:

```typescript
import { showMainMenu } from '@/services/NavigationService'

// В startScene:
await showMainMenu(ctx)

// В menuScene:
await showMainMenu(ctx)
```

## 🚀 Что получаем

### ✅ Преимущества:

1. **Единый источник правды** - вся навигация в одном файле
2. **Автоматическая регистрация** - все обработчики регистрируются автоматически
3. **Простое добавление** - добавил функцию в CATEGORIES, всё работает
4. **Нет дублирования** - одна функция = одно место определения
5. **Типобезопасность** - TypeScript интерфейсы для всего

### ❌ Что убираем:

1. ❌ Все обработчики из `hearsHandlers.ts` (кроме специальных случаев)
2. ❌ Логику навигации из `menuScene/index.ts`
3. ❌ Логику навигации из `startScene/index.ts`
4. ❌ Дублирующиеся обработчики в разных местах

## 📋 Структура NavigationService

```typescript
// Структура навигации
CATEGORIES = [
  {
    id: 'photo',
    ru: '📸 Фото',
    en: '📸 Photo',
    items: [
      { ru: '📸 Нейрофото', mode: ModeEnum.NeuroPhoto, ... },
      { ru: '🖼️ Текст в фото', mode: ModeEnum.TextToImage, ... },
      // ...
    ]
  },
  // ...
]

// Функции
initializeNavigation(bot)  // Регистрирует все обработчики
showMainMenu(ctx)          // Показывает главное меню
showCategoryMenu(ctx, id)  // Показывает меню категории
```

## 🔧 Добавление новой функции

### Шаг 1: Добавить в CATEGORIES

```typescript
// В NavigationService.ts, в нужную категорию:
{
  ru: '🆕 Новая функция',
  en: '🆕 New Feature',
  mode: ModeEnum.NewFeature,
  category: 'photo',  // или другая категория
  icon: '🆕',
  requiresSubscription: true  // если требуется подписка
}
```

### Шаг 2: Готово! ✅

Всё! Обработчик регистрируется автоматически при вызове `initializeNavigation(bot)`

## 🎯 Миграция существующих обработчиков

### Что делать со старым кодом:

1. **hearsHandlers.ts** - удалить все обработчики кнопок меню, оставить только специальные случаи
2. **menuScene/index.ts** - использовать `showMainMenu` вместо своей логики
3. **startScene/index.ts** - использовать `showMainMenu` вместо своей логики
4. **unified-navigation.config.ts** - можно оставить для обратной совместимости, но постепенно мигрировать

## ⚠️ Важно

- **НЕ создавайте обработчики** для кнопок меню в других местах!
- **ВСЯ навигация** должна идти через NavigationService
- Если нужна специальная логика - добавьте её в NavigationService, а не создавайте отдельный обработчик

