# 📋 ЦЕНТРАЛИЗОВАННАЯ ДОКУМЕНТАЦИЯ: СИСТЕМА НАВИГАЦИИ И МЕНЮ

## 🎯 ОБЗОР СИСТЕМЫ

Система навигации бота состоит из нескольких компонентов, которые работают вместе для обработки пользовательских запросов и отображения меню.

## 📁 АРХИТЕКТУРА

```
┌─────────────────────────────────────────────┐
│                 MAIN MENU                   │
│         (src/menu/mainMenu.ts)              │
│      levels: { id: { title_ru, title_en } } │
└─────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────┐
│           HEARS HANDLERS                    │
│        (src/hearsHandlers.ts)               │
│     bot.hears([...], handler)               │
└─────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────┐
│              SCENES / WIZARDS               │
│      (src/scenes/*/)                        │
│    Переходы и обработка состояний          │
└─────────────────────────────────────────────┘
```

## 📂 ОСНОВНЫЕ КОМПОНЕНТЫ

### 1. **src/menu/mainMenu.ts** - Главное меню
**Назначение**: Определяет все кнопки меню
**Содержит**:
- `levels: Record<number, Level>` - объект с описанием кнопок
- Level: `{ title_ru: string, title_en: string, admin_only?: boolean }`

**Кнопки** (1-15 основные):
```
1: 🤖 Цифровое тело
2: 📸 Нейрофото
3: 🔍 Промпт из фото
4: 🧠 Мозг аватара
5: 💭 Чат с аватаром
6: 🤖 Выбор модели ИИ
7: 🎤 Голос аватара
8: 🎙️ Текст в голос
9: 🎥 Фото в видео
10: 🎥 Видео из текста
11: 🖼️ Текст в фото
12: 🎨 ИИ Фотошоп
13: 🌀 Infinity Морфинг
14: 🎤 Синхронизация губ
15: 🎭 Замена лица
```

**Сервисные кнопки** (100-111):
```
100: 💎 Пополнить баланс
101: ⚙️ Настройки
102: 📊 Статистика
103: 💬 Техподдержка
104: 🏷️ Промо
105: 💫 Оформить подписку
106: 💰 Анализ расходов
107: 🔍 Мониторинг конкурентов
108: 🦸‍♂️ ИИ Герои
109: 🎬 ИИ Рилс
110: ℹ️ Справка
111: 🎯 Улучшение промпта
```

### 2. **src/hearsHandlers.ts** - Глобальные обработчики
**Назначение**: Обрабатывает ВСЕ нажатия кнопок
**Принцип работы**:
- `bot.hears([text1, text2], handler)` - ловит нажатия кнопок
- Единая система после исправления дублирования (2025-11-02)
- 27 обработчиков для всех кнопок

**Основные функции**:
- Обработка inline callback_query
- Проверка подписок и прав доступа
- Переходы в сцены/визарды
- Генерация медиа контента

### 3. **src/menu/index.ts** - Экспорт меню
**Назначение**: Центральный экспорт всех компонентов меню
**❌ ПРОБЛЕМА**: Дублирует импорты:
```typescript
export * from './mainMenu'  // Строка 2
export * from './mainMenu'  // Строка 3 (ДУБЛИКАТ!)
export * from './imageModelMenu'  // Строка 4
export * from './imageModelMenu'  // Строка 5 (ДУБЛИКАТ!)
```

### 4. **src/handlers/handleMenu.ts** - Старый обработчик
**Назначение**: Обрабатывал кнопки в menuScene
**Статус**: Устарел, используется ограниченно
**Содержит**: Большое количество CASE операторов

### 5. **src/components/menu/** - Компоненты меню
**BotOrchestrator.ts** - Оркестратор ботов
**CommandRegistry.ts** - Регистрация команд
**MenuActionRegistry.ts** - Регистрация действий
**NavigationHandler.ts** - Навигационный обработчик
**PhotoHandler.ts** - Обработчик фото
**SubscriptionHandler.ts** - Обработчик подписок
**VideoGenerationHandler.ts** - Обработчик видео

## 🔧 СИСТЕМА КНОПОК ОТМЕНЫ

### Дублирующиеся реализации:

#### 1. **handleHelpCancel** (handlers/handleHelpCancel/)
```typescript
export const handleHelpCancel = async (ctx: MyContext) => {
  if (ctx.message?.text === 'Отмена' || ctx.message?.text === 'Cancel') {
    await ctx.scene.leave()
    return true
  }
  return false
}
```

#### 2. **handleCancelButton** (utils/cancelButton.ts)
```typescript
export const handleCancelButton = async (ctx: MyContext): Promise<boolean> => {
  if (ctx.message?.text?.toLowerCase() === 'отмена' || ctx.message?.text?.toLowerCase() === 'cancel') {
    await ctx.reply(isRu ? 'Операция отменена.' : 'Operation cancelled.')
    ctx.scene.enter(ModeEnum.MainMenu)
    return true
  }
  return false
}
```

#### 3. **cancelHelpArray** (menu/cancelHelpArray.ts)
```typescript
export const cancelHelpArray = (isRu: boolean) => [
  isRu ? 'Справка по команде' : 'Help for the command',
  isRu ? 'Отмена' : 'Cancel'
]
```

#### 4. **createCancelButton** (utils/cancelButton.ts)
```typescript
export function createCancelButton(isRu: boolean) {
  return [Markup.button.text(isRu ? 'Отмена' : 'Cancel')]
}
```

**Рекомендация**: Объединить в единую систему `CancelButtonService`

## 📈 ИСТОРИЯ ИЗМЕНЕНИЙ

### 2025-11-02: Исправление двойной системы
**Файл**: `DOUBLE_SYSTEM_FIX_REPORT.md`

**Проблема**: Две системы обработки кнопок
- Система 1: `menuScene` + `handleMenu`
- Система 2: Глобальные `hearsHandlers`

**Решение**:
- Убрали `handleMenu` из `menuScene`
- Сделали `menuScene` одношаговым
- Используют только глобальные обработчики

### 2025-11-02: Исправление кнопок отмены
**Файл**: `BUTTONS_CANCEL_FIX_REPORT.md`

**Проблема**: Отсутствие кнопок отмены в 7 сценах
- avatarTransformScene, balanceScene, voiceAvatarWizard
- imageToVideoWizard, textToVideoWizard, faceSwapWizard
- instagramParserWizard

**Решение**:
- Добавлены кнопки отмены во все сцены
- 8 кнопок добавлено, 10 обработчиков добавлено

## ❌ ТЕКУЩИЕ ПРОБЛЕМЫ

### 1. Дублирование импортов
**Файл**: `src/menu/index.ts`
**Решение**: Убрать дублирующие строки 3 и 5

### 2. Множественные системы отмены
**Файлы**:
- `handlers/handleHelpCancel/index.ts`
- `utils/cancelButton.ts`
- `menu/cancelHelpArray.ts`

**Решение**: Создать единый `CancelButtonService`

### 3. Неиспользуемые файлы
- `getStepSelectionMenu.ts` и `getStepSelectionMenuV2.ts` (две версии)
- Некоторые компоненты в `components/menu/`

**Решение**: Удалить неиспользуемые файлы

### 4. Отсутствие единой точки входа
**Проблема**: Логика навигации разбросана по разным файлам
**Решение**: Создать `NavigationService`

## 🔧 ПЛАН РЕФАКТОРИНГА

### Этап 1: Критические исправления (1-2 дня)
1. ✅ Убрать дублирующие импорты в `menu/index.ts`
2. ✅ Объединить системы отмены в единый сервис
3. ✅ Удалить неиспользуемые файлы

### Этап 2: Централизация (3-5 дней)
1. Создать `services/NavigationService.ts`
2. Перенести логику levels в центральное место
3. Создать единые интерфейсы

### Этап 3: Рефакторинг (5-7 дней)
1. Упростить `hearsHandlers.ts`
2. Убрать неиспользуемые компоненты
3. Добавить тесты

### Этап 4: Документация (1-2 дня)
1. Обновить комментарии в коде
2. Создать схему архитектуры
3. Написать гайд для разработчиков

## 🎯 ЛУЧШИЕ ПРАКТИКИ

### 1. Создание новых кнопок
```typescript
// 1. Добавить в mainMenu.ts
levels[16] = {
  title_ru: '🆕 Новая функция',
  title_en: '🆕 New Feature',
  admin_only: false
}

// 2. Добавить обработчик в hearsHandlers.ts
bot.hears([levels[16].title_ru, levels[16].title_en], async (ctx) => {
  // логика обработки
})

// 3. Добавить сцену если нужно
const newFeatureScene = new Scenes.WizardScene(...)
bot.scene.enter(ModeEnum.NewFeature)
```

### 2. Создание кнопки отмены
```typescript
// Использовать универсальную функцию
import { createCancelButton } from '@/utils/cancelButton'

await ctx.reply('Текст', {
  reply_markup: {
    keyboard: createCancelButton(isRu)
  }
})
```

### 3. Проверка подписки
```typescript
import { checkSubscriptionGuard } from '@/helpers/subscriptionGuard'

const hasSubscription = await checkSubscriptionGuard(ctx, 'Feature Name')
if (!hasSubscription) return
```

## 📊 ТЕКУЩИЙ СТАТУС

- ✅ **Основная система работает**: Все 27 кнопок обрабатываются
- ❌ **Есть дублирования**: В коде и в системах отмены
- ⚠️ **Требуется рефакторинг**: Для улучшения поддержки
- 📋 **Документация создана**: Этот файл

## 🆘 ПОДДЕРЖКА

### При возникновении проблем:
1. Проверить дублирования в `menu/index.ts`
2. Убедиться что обработчик добавлен в `hearsHandlers.ts`
3. Проверить правильность ключей в `levels`
4. Использовать единую систему отмены

### Контакты:
- Файл документации: `NAVIGATION_SYSTEM.md`
- Отчеты об исправлениях: `BUTTONS_CANCEL_FIX_REPORT.md`, `DOUBLE_SYSTEM_FIX_REPORT.md`

---

**Дата создания**: 2025-11-03  
**Последнее обновление**: 2025-11-03  
**Статус**: ✅ ГОТОВО К ИСПОЛЬЗОВАНИЮ
