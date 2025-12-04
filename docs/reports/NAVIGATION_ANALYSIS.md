# 📊 Анализ системы навигации бота

## ✅ Текущее состояние (После рефакторинга - 2025-01-12)

### 🎯 Единый источник истины

**`src/services/NavigationService.ts`** - ЕДИНСТВЕННЫЙ файл навигации:
- ✅ Структура меню (CATEGORIES)
- ✅ Функции показа меню (showMainMenu, showCategoryMenu)
- ✅ Обработчики навигации
- ✅ Обратная совместимость (levels[])
- ✅ Права доступа (HAIM_GROUP_STAFF_IDS, METAMUSE_STAFF_IDS, getParsingAccess)

### 🗑️ Удалено

- ❌ `src/navigation/unified-navigation.config.ts` - УДАЛЕН (дублирование)
- ❌ Старые функции `mainMenu()`, `createMainMenuKeyboard()` - DEPRECATED

---

## 🔍 История (До рефакторинга)

### Проблемы найденные в коде:

#### 1. **Дублирование определений меню** (КРИТИЧЕСКАЯ ПРОБЛЕМА!)

Кнопки меню определяются в **3 разных местах**:

```
📁 src/menu/
├── simpleMenu.ts          ✅ Основной файл (MAIN_MENU_BUTTONS + levels)
├── mainMenu.ts.deprecated ❌ Устаревший файл (не удалён)
├── videoModelMenu.ts      ⚠️  Отдельная логика для видео-моделей
├── imageModelMenu.ts      ⚠️  Отдельная логика для image-моделей
├── buttons.ts             ⚠️  Дополнительные кнопки
└── navigationMenu.ts      ⚠️  Ещё одна навигация
```

#### 2. **Множественные импорты из разных источников**

Файлы импортируют меню из разных мест:

```typescript
// ❌ ПРОБЛЕМА: Разные файлы импортируют из разных источников

// hearsHandlers.ts
import { levels, mainMenu } from './menu'

// menuScene/index.ts
import { levels, mainMenu } from '../../menu/simpleMenu'

// videoModelMenu.ts
import { UNIFIED_VIDEO_MODELS as VIDEO_MODELS_CONFIG } from '@/config/unified-video-models.config'
import { levels } from './simpleMenu'

// getTranslation.ts (ОШИБКА!)
const { levels } = await import('@/menu/mainMenu') // ← Импорт из deprecated файла!
```

#### 3. **Несогласованность уровней доступа**

```typescript
// simpleMenu.ts - levels генерируются динамически
MAIN_MENU_BUTTONS.forEach((btn, index) => {
  levels[index + 1] = { title_ru: btn.ru, title_en: btn.en }
})

// Затем добавляются вручную:
levels[100] = { title_ru: '💎 Пополнить баланс', ... }
levels[107] = { title_ru: '⬆️ Увеличить качество фото', ... }
// ❌ ПРОБЛЕМА: levels[107] дублирует MAIN_MENU_BUTTONS[16]
```

#### 4. **Разрозненная логика обработки кнопок**

Кнопки обрабатываются в **4 местах**:

1. `hearsHandlers.ts` - Основные обработчики (bot.hears)
2. `menuScene/index.ts` - Обработка в сцене меню
3. `simpleMenu.ts` - Функция handleMenuButtonPress
4. `registerCommands.ts` - Обработка команд

### 5. **Отсутствие единой точки входа**

```
/menu/index.ts экспортирует:
├── simpleMenu (✅ основной)
├── mainMenu (❌ deprecated, но экспорт закомментирован)
├── videoModelMenu
├── imageModelMenu
├── cancelMenu
└── ещё 10+ разных модулей
```

---

## 🎯 Алгоритм текущей навигации

### Шаг 1: Пользователь нажимает кнопку

```
Пользователь → Telegram → Bot
                          ↓
                    hearsHandlers.ts
                          ↓
                  bot.hears([текст кнопки])
```

### Шаг 2: Определение кнопки

```typescript
// hearsHandlers.ts использует levels[]
bot.hears([levels[1].title_ru, levels[1].title_en], async ctx => {
  // ...
})
```

### Шаг 3: Проверка прав и подписки

```typescript
// Проверка подписки (если требуется)
const hasSubscription = await checkSubscriptionGuard(ctx, ...)
if (!hasSubscription) return // Редирект в subscriptionScene

// Проверка админских прав
if (ADMIN_IDS_ARRAY.includes(userId)) { ... }
```

### Шаг 4: Установка режима и переход в сцену

```typescript
ctx.session.mode = ModeEnum.DigitalAvatarBody
await ctx.scene.enter(ModeEnum.CheckBalanceScene)
```

### Шаг 5: CheckBalanceScene проверяет баланс

```typescript
// CheckBalanceScene → Проверка баланса
if (balance >= cost) {
  // Переход в целевую сцену (например, digitalAvatarBodyWizard)
  await ctx.scene.enter(ctx.session.mode)
} else {
  // Показ сообщения о недостаточных средствах
  await sendInsufficientStarsMessage(ctx, ...)
}
```

---

## 📋 Полная карта навигации

### A. Основные кнопки меню (MAIN_MENU_BUTTONS)

| Кнопка | Mode | Сцена | Проверка подписки |
|--------|------|-------|-------------------|
| 🤖 Цифровое тело | DigitalAvatarBody | digitalAvatarBodyWizard | ✅ Да |
| 📸 Нейрофото | NeuroPhoto | neuroPhotoWizard | ✅ Да |
| 🔍 Промпт из фото | ImageToPrompt | imageToPromptWizard | ✅ Да |
| 🧠 Мозг аватара | Avatar | avatarBrainWizard | ✅ Да |
| 💭 Чат с аватаром | ChatWithAvatar | chatWithAvatarWizard | ✅ Да |
| 🤖 Выбор модели ИИ | SelectModel | selectModelWizard | ✅ Да |
| 🎤 Голос аватара | Voice | voiceAvatarWizard | ✅ Да |
| 🎙️ Текст в голос | TextToSpeech | textToSpeechWizard | ✅ Да |
| 🎥 Фото в видео | ImageToVideo | imageToVideoWizard | ✅ Да |
| 🎥 Видео из текста | TextToVideo | textToVideoWizard | ✅ Да |
| 🖼️ Текст в фото | TextToImage | textToImageWizard | ✅ Да |
| 🎨 ИИ Фотошоп | ai_photoshop | ai_photoshop_scene | ✅ Да |
| 🌀 Infinity Морфинг | morphing | morphing_wizard | ✅ Да (требует подписку) |
| 🎤 Синхронизация губ | lip_sync | lipSyncWizard | 🔒 Только админы |
| 🎭 Замена лица | face_swap | faceSwapWizard | ✅ Да |
| ⬆️ Увеличить качество фото | ImageUpscaler | imageUpscalerWizard | ✅ Да |
| 🔍 Мониторинг конкурентов | competitor_monitoring | competitorMonitoringScene | 🔒 Только админы |
| 🦸‍♂️ ИИ Герои | ai_heroes | aiHeroesScene | ✅ Да (требует подписку) |
| 🎬 ИИ Рилс | ai_reels | ai_reels_entry | 🔒 Только админы |

### B. Навигационные кнопки

| Кнопка | Mode | Действие |
|--------|------|----------|
| 👥 Пригласить друга | Invite | inviteScene |
| 💬 Техподдержка | Help | helpScene |
| 🌐 EN/RU | language | Переключение языка |
| 🏠 Главное меню | MainMenu | menuScene (глобально работает везде!) |

### C. Платежные кнопки

| Кнопка | Mode | Сцена | Требует подписку |
|--------|------|-------|------------------|
| 💫 Оформить подписку | SubscriptionScene | subscriptionScene | ❌ Нет |
| 💎 Пополнить баланс | TopUpBalance | paymentScene | ✅ Да (только для подписчиков) |
| 💰 Баланс | Balance | balanceScene | ✅ Да (только для подписчиков) |

---

## 🔧 Архитектура обработки

```
┌─────────────────┐
│  Пользователь   │
└────────┬────────┘
         │ Нажимает кнопку
         ↓
┌─────────────────────────────────────────────────────┐
│  hearsHandlers.ts (Глобальные обработчики)          │
│  - bot.hears([levels[X].title_ru, levels[X].title_en]) │
└────────┬────────────────────────────────────────────┘
         │
         ↓
┌──────────────────────────────────────────────┐
│  Проверка прав и подписки                    │
│  - checkSubscriptionGuard(ctx, ...)          │
│  - ADMIN_IDS_ARRAY.includes(userId)          │
└────────┬─────────────────────────────────────┘
         │
         ↓
┌──────────────────────────────────────────────┐
│  Установка режима                            │
│  ctx.session.mode = ModeEnum.XXX             │
└────────┬─────────────────────────────────────┘
         │
         ↓
┌──────────────────────────────────────────────┐
│  CheckBalanceScene                           │
│  - Проверка баланса                          │
│  - Списание средств (если требуется)         │
└────────┬─────────────────────────────────────┘
         │
         ↓
┌──────────────────────────────────────────────┐
│  Целевая сцена (XXXWizard)                   │
│  - Выполнение основной логики                │
│  - Генерация контента                        │
│  - Отправка результата                       │
└──────────────────────────────────────────────┘
```

---

## 🚀 План рефакторинга (Что нужно сделать)

### ✅ ШАГ 1: Создать единый конфигурационный файл

**Файл**: `src/navigation/unified-navigation.config.ts`

**Содержимое**:
- ✅ Все кнопки меню (NAVIGATION_BUTTONS)
- ✅ Типы и интерфейсы
- ✅ Функции создания клавиатур
- ✅ Права доступа
- ✅ Обратная совместимость (levels[])

### 🔧 ШАГ 2: Обновить импорты во всех файлах

Заменить:
```typescript
// ❌ СТАРОЕ
import { levels, mainMenu } from './menu'
import { levels } from './menu/simpleMenu'

// ✅ НОВОЕ
import { levels, mainMenu } from '@/navigation/unified-navigation.config'
```

**Файлы для обновления** (25+ файлов):
- hearsHandlers.ts
- menuScene/index.ts
- videoModelMenu.ts
- getTranslation.ts
- И все остальные...

### 🗑️ ШАГ 3: Удалить устаревшие файлы

```bash
rm src/menu/mainMenu.ts.deprecated
rm src/menu/buttons.ts           # Если не используется
rm src/menu/navigationMenu.ts    # Если не используется
```

### 🧹 ШАГ 4: Упростить /menu/index.ts

```typescript
// Новый index.ts
export * from './simpleMenu'  // Временно, для обратной совместимости
export * from '../navigation/unified-navigation.config' // Главный экспорт

// В будущем заменить все импорты на:
// import { ... } from '@/navigation/unified-navigation.config'
```

### ✅ ШАГ 5: Обновить simpleMenu.ts

Сделать его просто реэкспортом из unified-navigation.config.ts:

```typescript
// src/menu/simpleMenu.ts
// Временный файл для обратной совместимости
// TODO: Удалить после миграции всех импортов
export * from '@/navigation/unified-navigation.config'
```

---

## 📊 Статистика

### Файлы, использующие навигацию: **120+ файлов**

- `hearsHandlers.ts` - Главный обработчик кнопок
- `menuScene/index.ts` - Сцена главного меню
- `scenes/*.ts` - 40+ сцен (wizards)
- `handlers/*.ts` - 20+ обработчиков
- `commands/*.ts` - 10+ команд

### Импорты из menu/* : **86 файлов**

Все эти файлы нужно будет обновить для импорта из единого источника.

---

## 🎯 Преимущества единого конфига

### ✅ Что получим:

1. **Единственный источник правды** - Все кнопки в одном месте
2. **Типизация** - TypeScript интерфейсы для всех кнопок
3. **Категоризация** - Кнопки разбиты по категориям (ai, tools, admin, payment)
4. **Централизованная логика** - Права доступа, проверки подписки
5. **Легкость поддержки** - Добавить/удалить кнопку в одном месте
6. **Обратная совместимость** - levels[] генерируется автоматически
7. **Нет дублирования** - Одна кнопка = одно определение

### ❌ Что было раньше:

1. ❌ Кнопки в 3+ разных файлах
2. ❌ Дублирование определений
3. ❌ Несогласованность номеров levels[]
4. ❌ Сложно найти где определена кнопка
5. ❌ Риск ошибок при добавлении новых кнопок
6. ❌ Импорты из deprecated файлов

---

## 📝 Итоговый алгоритм (После рефакторинга)

### Добавление новой кнопки:

```typescript
// 1. Открываем unified-navigation.config.ts
// 2. Добавляем кнопку в NAVIGATION_BUTTONS:
{
  ru: '🆕 Новая функция',
  en: '🆕 New Feature',
  mode: ModeEnum.NewFeature,
  category: 'ai',
  icon: '🆕',
  requires_subscription: true
}

// 3. Создаем сцену newFeatureWizard
// 4. Добавляем обработчик в hearsHandlers.ts
// 5. Готово! ✅
```

### Изменение прав доступа:

```typescript
// 1. Открываем unified-navigation.config.ts
// 2. Меняем флаги:
{
  ru: '🎬 ИИ Рилс',
  en: '🎬 AI Reels',
  mode: 'ai_reels',
  admin_only: false,  // Было true
  requires_subscription: true  // Добавляем
}
// 3. Готово! ✅
```

---

## 🔗 Связанные файлы

### Критически важные:
- `src/navigation/unified-navigation.config.ts` - **ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ**
- `src/hearsHandlers.ts` - Обработка нажатий кнопок
- `src/menu/simpleMenu.ts` - Временный мост для обратной совместимости
- `src/scenes/menuScene/index.ts` - Сцена главного меню

### Требуют обновления:
- `src/core/supabase/getTranslation.ts` - ❌ Импортирует из deprecated!
- `src/menu/videoModelMenu.ts` - Отдельная логика видео
- `src/menu/imageModelMenu.ts` - Отдельная логика изображений
- И ещё 80+ файлов...

---

## ⚠️ Критические места

### 1. getTranslation.ts (СЛОМАНО!)
```typescript
// ❌ ПРОБЛЕМА:
const { levels } = await import('@/menu/mainMenu')
// Импортирует из mainMenu.ts.deprecated!

// ✅ ИСПРАВЛЕНИЕ:
const { levels } = await import('@/navigation/unified-navigation.config')
```

### 2. levels[] дублирование
```typescript
// ❌ ПРОБЛЕМА: levels[107] определён дважды
// В MAIN_MENU_BUTTONS[16] и в levels[107] = {...}

// ✅ РЕШЕНИЕ: levels[] генерируется автоматически из NAVIGATION_BUTTONS
```

### 3. Разрозненные обработчики
```typescript
// ❌ ПРОБЛЕМА: Кнопки обрабатываются в 4 местах

// ✅ РЕШЕНИЕ: Централизовать через handleMenuButtonPress()
```

---

## 📦 Миграционный план (По приоритетам)

### ПРИОРИТЕТ 1 (Критично): Исправить getTranslation.ts
```bash
# Файл сломан и вызывает ошибки!
src/core/supabase/getTranslation.ts:256
```

### ПРИОРИТЕТ 2 (Высокий): Обновить основные файлы
```bash
src/hearsHandlers.ts
src/scenes/menuScene/index.ts
src/menu/index.ts
```

### ПРИОРИТЕТ 3 (Средний): Обновить сцены
```bash
src/scenes/**/*Wizard/index.ts (40+ файлов)
```

### ПРИОРИТЕТ 4 (Низкий): Обновить хелперы
```bash
src/handlers/*.ts
src/helpers/*.ts
src/commands/*.ts
```

### ПРИОРИТЕТ 5 (Очистка): Удалить устаревшее
```bash
src/menu/mainMenu.ts.deprecated
src/menu/buttons.ts (если не используется)
```

---

## 🎉 Результат

После рефакторинга получим:
- ✅ **1 файл** вместо 10+ для навигации
- ✅ **Единый источник правды** для всех кнопок
- ✅ **Типобезопасность** с TypeScript
- ✅ **Простота добавления** новых кнопок
- ✅ **Централизованные права доступа**
- ✅ **Обратная совместимость** со старым кодом
- ✅ **Нет дублирования** определений

---

**Дата анализа**: 2025-11-08
**Версия**: 1.0
**Статус**: ✅ Единый конфиг создан, требуется миграция импортов
