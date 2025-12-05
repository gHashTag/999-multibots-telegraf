# 🚀 БЫСТРЫЙ СТАРТ - НАВИГАЦИОННАЯ СИСТЕМА

## Что это?

Централизованная система навигации для Telegram бота. Обеспечивает:
- ✅ Безопасные переходы между сценами
- ✅ Валидацию разрешений
- ✅ Автоматическое логирование
- ✅ Аналитику и метрики
- ✅ Историю навигации ("Назад")
- ✅ Типобезопасность

---

## 📦 ИМПОРТ

```typescript
// Основной роутер
import { navigationRouter, navigateToScene, navigateToMode, goBack } from '@/navigation'

// Реестр сцен
import { SCENE_REGISTRY, getSceneById, isSceneAccessible } from '@/navigation'

// Аналитика
import { navigationAnalytics, createAnalyticsMiddleware } from '@/navigation/middleware/analyticsMiddleware'

// Безопасные переходы
import { safeEnterScene, canGoBack } from '@/navigation/helpers/sceneTransition'
```

---

## 🎯 БАЗОВОЕ ИСПОЛЬЗОВАНИЕ

### 1. Переход в сцену по ID

```typescript
import { navigateToScene } from '@/navigation'

// Простой переход
await navigateToScene(ctx, 'helpScene')

// С опциями
await navigateToScene(ctx, 'neuroPhotoWizard', {
  leaveCurrent: true,        // Выйти из текущей сцены
  saveToHistory: true,       // Сохранить в историю (для кнопки "Назад")
  mode: ModeEnum.NeuroPhoto, // Установить режим в сессии
  sceneState: {              // Данные для новой сцены
    customData: 'value'
  }
})
```

### 2. Переход по ModeEnum

```typescript
import { navigateToMode, ModeEnum } from '@/navigation'

// Используя ModeEnum
await navigateToMode(ctx, ModeEnum.SubscriptionScene, {
  leaveCurrent: true
})
```

### 3. Кнопка "Назад"

```typescript
import { goBack } from '@/navigation'

// Автоматический возврат к предыдущей сцене
await goBack(ctx)

// Проверка возможности возврата
import { canGoBack } from '@/navigation/helpers/sceneTransition'

if (canGoBack(ctx)) {
  await goBack(ctx)
} else {
  // Нет истории, идем в главное меню
  await navigateToScene(ctx, 'menuScene')
}
```

### 4. Отмена (возврат в меню)

```typescript
import { cancel } from '@/navigation'

// Очистить историю и вернуться в главное меню
await cancel(ctx)
```

---

## 🔒 ПРОВЕРКА ДОСТУПА

### Проверка доступности сцены

```typescript
import { getSceneById, isSceneAccessible } from '@/navigation'

const scene = getSceneById('neuroPhotoWizard')
if (!scene) {
  ctx.reply('Сцена не найдена')
  return
}

// Проверяем доступ
const isAccessible = isSceneAccessible(
  scene,
  userAccessLevel,     // AccessLevel.PUBLIC | SUBSCRIBER | ADMIN и т.д.
  hasSubscription      // boolean
)

if (!isAccessible) {
  ctx.reply('❌ Доступно только подписчикам')
  return
}
```

### Проверка разрешенности перехода

```typescript
import { isTransitionAllowed } from '@/navigation'

const currentSceneId = ctx.scene.current?.id
const targetSceneId = 'helpScene'

if (!isTransitionAllowed(currentSceneId, targetSceneId)) {
  ctx.reply('❌ Нельзя перейти из этой сцены')
  return
}

await navigateToScene(ctx, targetSceneId)
```

---

## 📊 АНАЛИТИКА

### Автоматический сбор

```typescript
import { createAnalyticsMiddleware } from '@/navigation/middleware/analyticsMiddleware'

// Добавить в бот (в index.ts)
bot.use(createAnalyticsMiddleware())
```

### Ручной сбор метрик

```typescript
import { navigationAnalytics } from '@/navigation/middleware/analyticsMiddleware'

// Записать событие
navigationAnalytics.recordSceneEnter(ctx, 'menuScene', SceneCategory.SYSTEM)
navigationAnalytics.recordSceneLeave(ctx, 'menuScene', SceneCategory.SYSTEM)

// Получить статистику
const topScenes = navigationAnalytics.getTopScenes(10)
const topTransitions = navigationAnalytics.getTopTransitions(20)

// Экспорт данных
const stats = navigationAnalytics.exportStats()
console.log(stats)
```

### Подписка на события

```typescript
import { navigationRouter, NavigationEvent } from '@/navigation'

navigationRouter.on(NavigationEvent.SCENE_ENTER, (event, context) => {
  console.log(`Пользователь ${context.userId} вошел в сцену ${context.scene?.name}`)
})

navigationRouter.on(NavigationEvent.ACCESS_DENIED, (event, context, error) => {
  console.log(`Отказ в доступе: ${error?.message}`)
})

navigationRouter.on(NavigationEvent.SCENE_ERROR, (event, context, error) => {
  console.log(`Ошибка навигации: ${error?.message}`)
})
```

---

## 🏗️ ДОБАВЛЕНИЕ НОВОЙ СЦЕНЫ

### 1. Добавить в SceneRegistry

```typescript
// /src/navigation/SceneRegistry.ts

export const SCENE_REGISTRY = {
  // ... существующие сцены

  myNewScene: {
    id: 'myNewScene',
    name: 'Моя новая сцена',
    description: 'Описание функциональности',
    category: SceneCategory.GENERATION,
    accessLevel: AccessLevel.SUBSCRIBER,
    status: SceneStatus.ACTIVE,
    modeEnum: ModeEnum.MyNewScene,
    requiresSubscription: true,
    cost: 10,
    supportedLanguages: ['ru', 'en'],
    tags: ['new', 'feature'],
    version: '1.0.0'
  }
}
```

### 2. Использовать в коде

```typescript
// В обработчике кнопки
import { navigateToScene } from '@/navigation'

button.action('my_new_feature', async (ctx) => {
  await ctx.answerCbQuery()
  await navigateToScene(ctx, 'myNewScene')
})

// В команде
import { navigateToMode } from '@/navigation'

bot.command('myfeature', async (ctx) => {
  await navigateToMode(ctx, ModeEnum.MyNewScene)
})
```

---

## 🔄 МИГРАЦИЯ СУЩЕСТВУЮЩЕГО КОДА

### Замена ctx.scene.enter

```typescript
// БЫЛО (старый код)
await ctx.scene.leave()
ctx.session.mode = ModeEnum.Help
await ctx.scene.enter('helpScene')

// СТАНОВИТСЯ (новый код)
import { navigateToScene } from '@/navigation'

await navigateToScene(ctx, 'helpScene', {
  leaveCurrent: true,
  mode: ModeEnum.Help,
  saveToHistory: true
})
```

### Миграция с проверкой баланса

```typescript
// БЫЛО
const user = await getUserByTelegramId(ctx.from.id)
if (user.balance < cost) {
  await ctx.reply('Недостаточно средств')
  return
}
await ctx.scene.enter('neuroPhotoWizard')

// СТАНОВИТСЯ
import { getSceneById, isSceneAccessible } from '@/navigation'

const scene = getSceneById('neuroPhotoWizard')
const user = await getUserByTelegramId(ctx.from.id)

if (!isSceneAccessible(scene, AccessLevel.PUBLIC, user.subscription_active)) {
  await ctx.reply('❌ Недостаточно средств или подписки')
  return
}

await navigateToScene(ctx, 'neuroPhotoWizard')
```

---

## 🛠️ ЛУЧШИЕ ПРАКТИКИ

### ✅ ДЕЛАЙТЕ

```typescript
// 1. Всегда используйте navigateToScene/navigateToMode
await navigateToScene(ctx, 'targetScene')

// 2. Устанавливайте leaveCurrent для очистки стека
await navigateToScene(ctx, 'targetScene', { leaveCurrent: true })

// 3. Сохраняйте историю для кнопки "Назад"
await navigateToScene(ctx, 'targetScene', { saveToHistory: true })

// 4. Устанавливайте mode для консистентности
await navigateToScene(ctx, 'targetScene', { mode: ModeEnum.Target })

// 5. Проверяйте доступ перед переходом
const scene = getSceneById('targetScene')
if (!isSceneAccessible(scene, userAccessLevel, hasSubscription)) {
  return
}
```

### ❌ НЕ ДЕЛАЙТЕ

```typescript
// 1. НЕ используйте прямые ctx.scene.enter
await ctx.scene.enter('targetScene') // ❌

// 2. НЕ забывайте leaveCurrent при глубокой навигации
// Может привести к переполнению стека сцен

// 3. НЕ игнорируйте ошибки навигации
try {
  await navigateToScene(ctx, 'targetScene')
} catch (error) {
  console.error('Navigation failed:', error) // ✅ Логируйте
}

// 4. НЕ используйте хардкод переходов
const TARGET_SCENES = ['scene1', 'scene2'] // ❌
// Вместо этого используйте SceneRegistry

// 5. НЕ забывайте про аналитику
// Подписывайтесь на события для мониторинга
```

---

## 📋 ГОТОВЫЕ ПАТТЕРНЫ

### Паттерн 1: Переход с проверкой подписки

```typescript
async function navigateWithSubscriptionCheck(
  ctx: MyContext,
  sceneId: string,
  modeEnum: ModeEnum | string
) {
  const scene = getSceneById(sceneId)
  if (!scene) {
    await ctx.reply('Сцена не найдена')
    return
  }

  if (scene.requiresSubscription && !ctx.session.subscription) {
    await navigateToScene(ctx, 'subscriptionScene')
    return
  }

  await navigateToScene(ctx, sceneId, {
    leaveCurrent: true,
    saveToHistory: true,
    mode: modeEnum
  })
}
```

### Паттерн 2: Защищенный переход с fallback

```typescript
async function safeNavigate(
  ctx: MyContext,
  sceneId: string,
  fallbackScene: string = 'menuScene'
) {
  try {
    await navigateToScene(ctx, sceneId, {
      leaveCurrent: true,
      saveToHistory: true
    })
  } catch (error) {
    console.error(`Navigation to ${sceneId} failed:`, error)
    await navigateToScene(ctx, fallbackScene)
  }
}
```

### Паттерн 3: Условная навигация

```typescript
async function conditionalNavigate(ctx: MyContext) {
  const user = await getUserByTelegramId(ctx.from.id)

  // Новичок - показать онбординг
  if (!user.is_onboarded) {
    return navigateToScene(ctx, 'onboardingScene')
  }

  // Подписчик - показать премиум функции
  if (user.subscription_active) {
    return navigateToScene(ctx, 'premiumMenu')
  }

  // Обычный пользователь - главное меню
  return navigateToScene(ctx, 'menuScene')
}
```

### Паттерн 4: Мультиязычная навигация

```typescript
import { isRussianFromState } from '@/helpers/centralizedLanguage'

async function navigateLocalized(ctx: MyContext, sceneId: string) {
  const isRu = isRussianFromState(ctx)
  const scene = getSceneById(sceneId)

  if (!scene) {
    const message = isRu
      ? 'Сцена не найдена'
      : 'Scene not found'
    await ctx.reply(message)
    return
  }

  await navigateToScene(ctx, sceneId)
}
```

---

## 🔍 ОТЛАДКА

### Включение детального логирования

```typescript
import { logger } from '@/utils/logger'

// Включить DEBUG уровень для навигации
logger.level = 'debug'

// Или для конкретной операции
logger.debug('[Navigation] Entering scene', {
  sceneId,
  userId: ctx.from?.id,
  options
})
```

### Проверка состояния навигации

```typescript
import { getNavigationInfo } from '@/navigation'

const info = getNavigationInfo(ctx)
console.log('Current scene:', info.currentScene?.name)
console.log('Can go back:', info.canGoBack)
console.log('History depth:', info.historyDepth)
console.log('Available transitions:', info.availableTransitions)
```

### Сброс навигации при проблемах

```typescript
import { clearNavigationHistory } from '@/navigation/helpers/sceneTransition'

// В случае зависания
if (isStuckInDeepScene(ctx)) {
  clearNavigationHistory(ctx)
  await navigateToScene(ctx, 'menuScene')
}
```

---

## 📚 ПРИМЕРЫ КОДА

Полные примеры смотрите в `/src/navigation/examples/`:
- `basic-navigation.ts` - базовая навигация
- `advanced-navigation.ts` - продвинутые паттерны
- `with-analytics.ts` - с аналитикой
- `custom-handlers.ts` - кастомные обработчики

---

## 🆘 ЧАСТЫЕ ПРОБЛЕМЫ

### Проблема: "Scene not found"
**Решение**: Добавьте сцену в SceneRegistry

### Проблема: "Access denied"
**Решение**: Проверьте accessLevel в SceneRegistry

### Проблема: "Transition blocked"
**Решение**: Настройте allowedChildren в SceneRegistry

### Проблема: "Can't go back"
**Решение**: Убедитесь, что saveToHistory: true при переходах

---

## 📞 ПОДДЕРЖКА

- **Документация**: `/src/navigation/README.md`
- **План рефакторинга**: `/NAVIGATION_REFACTOR_PLAN.md`
- **SceneRegistry**: `/src/navigation/SceneRegistry.ts`
- **NavigationRouter**: `/src/navigation/NavigationRouter.ts`

---

**Удачной разработки! 🎉**
