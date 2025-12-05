# 🎯 ПЛАН КОМПЛЕКСНОГО РЕФАКТОРИНГА СИСТЕМЫ НАВИГАЦИИ

## 📊 РЕЗУЛЬТАТЫ АУДИТА

### Текущее состояние
- **Всего файлов в проекте**: 692 TypeScript файла
- **Вызовов `ctx.scene.enter` вне модуля навигации**: 134
- **Файлов с навигационной логикой**: 52+ файлов
- **Основные навигационные компоненты**:
  - `/src/services/NavigationService.ts` (2500+ строк)
  - `/src/components/menu/` (8 компонентов)
  - `/src/scenes/*` (52 сцены)
  - Разрозненные обработчики в handlers/

### Топ-10 самых частых переходов
```
1. SubscriptionScene - 16 раз
2. CheckBalanceScene - 8 раз
3. ImageToVideo - 4 раза
4. TextToVideo - 3 раза
5. Help - 3 раза
6. SizeWizard - 3 раза
7. InstagramScrapingWizard - 3 раза
8. ImprovePromptWizard - 2 раза
9. PaymentScene - 2 раза
10. NeuroPhoto - 2 раза
```

### Проблемы текущей архитектуры
1. **Дублирование кода** - навигационная логика разбросана по 50+ файлам
2. **Отсутствие единой типизации** - нет строгих типов для маршрутов
3. **Хардкод переходов** - сцены ссылаются друг на друга напрямую
4. **Сложность отладки** - нет центрального логирования
5. **Отсутствие аналитики** - не отслеживаются пути пользователей
6. **Нет истории навигации** - нет унифицированной системы "Назад"
7. **Слабая валидация** - нет проверки разрешенности переходов

---

## 🏗️ НОВАЯ АРХИТЕКТУРА НАВИГАЦИИ

### Созданные компоненты

#### 1. `/src/navigation/SceneRegistry.ts` ✅
**Назначение**: Единый реестр всех сцен с метаданными

**Возможности**:
- Метаданные каждой сцены (id, name, description, category, accessLevel, cost)
- Категоризация сцен (SYSTEM, GENERATION, PAYMENT, WIZARD, TOOLS, AVATAR, ADMIN, UTILITY)
- Уровни доступа (PUBLIC, SUBSCRIBER, PREMIUM, ADMIN, STAFF)
- Правила переходов (allowedParents, allowedChildren, blockedTransitions)
- Проверка доступности сцены для пользователя
- Валидация разрешенности переходов

**Ключевые функции**:
```typescript
- getSceneById(id: string)
- getSceneByModeEnum(modeEnum)
- isSceneAccessible(scene, userAccessLevel, hasSubscription)
- isTransitionAllowed(fromSceneId, toSceneId)
- getAllowedTransitions(sceneId)
```

#### 2. `/src/navigation/NavigationRouter.ts` ✅
**Назначение**: Центральная точка для всех навигационных операций

**Возможности**:
- Безопасные переходы с обработкой ошибок
- Валидация разрешений и доступности
- Автоматическое логирование всех операций
- Система событий для интеграции с аналитикой
- Поддержка истории навигации
- Отмена операций

**Ключевые методы**:
```typescript
- navigateToScene(ctx, sceneId, options)
- navigateToMode(ctx, modeEnum, options)
- navigateToMainMenu(ctx)
- goBack(ctx)
- cancel(ctx)
- getNavigationInfo(ctx)
```

**События**:
- `SCENE_ENTER` - вход в сцену
- `SCENE_LEAVE` - выход из сцены
- `SCENE_ERROR` - ошибка навигации
- `ACCESS_DENIED` - нет доступа
- `TRANSITION_BLOCKED` - переход заблокирован

#### 3. `/src/navigation/middleware/analyticsMiddleware.ts` ✅
**Назначение**: Сбор и анализ навигационной аналитики

**Возможности**:
- Отслеживание входов/выходов в сцены
- Измерение времени в сценах
- Статистика популярности сцен
- Анализ переходов между сценами
- Дневная статистика
- Экспорт данных в JSON

**Метрики**:
- SceneStats: enters, leaves, errors, averageDuration, popularityScore
- TransitionStats: count, lastTransition
- Топ популярных сцен
- Топ переходов

---

## 📋 ПЛАН МИГРАЦИИ

### ЭТАП 1: Подготовка (1-2 дня)

#### 1.1 Расширение SceneRegistry
**Задача**: Добавить все 52 сцены в реестр

**Файлы для изменения**:
- `/src/navigation/SceneRegistry.ts` - добавить все сцены

**Приоритетные сцены** (добавить в первую очередь):
1. menuScene, helpScene, checkBalanceScene
2. subscriptionScene, paymentScene, rublePaymentScene, starPaymentScene
3. neuroPhotoWizard, neuroPhotoWizardV2
4. textToImageWizard, textToVideoWizard, imageToVideoWizard
5. selectModelWizard, improvePromptWizard, sizeWizard
6. instagramScrapingWizard, instagramParserWizard
7. avatarTransformScene, digitalAvatarBodyWizard, lipSyncWizard

#### 1.2 Создание типов навигации
**Файлы для создания**:
- `/src/navigation/types/navigation.types.ts`

**Содержимое**:
```typescript
export type SceneId = string
export type ModeEnum = string
export type NavigationAction = 'navigate' | 'goBack' | 'cancel' | 'reset'
export interface NavigationContext {
  fromScene?: SceneId
  toScene: SceneId
  action: NavigationAction
  metadata?: Record<string, unknown>
}
```

#### 1.3 Создание утилит валидации
**Файлы для создания**:
- `/src/navigation/utils/navigationValidators.ts`

**Функции**:
- validateSceneTransition(from, to)
- validateUserAccess(user, scene)
- validateSubscriptionAccess(user, scene)

### ЭТАП 2: Миграция сервисов (2-3 дня)

#### 2.1 Миграция NavigationService.ts
**Приоритет**: 🔴 КРИТИЧЕСКИЙ

**План**:
1. Создать адаптер `/src/navigation/adapters/legacyNavigationAdapter.ts`
2. Перенести глобальные обработчики в `/src/navigation/handlers/globalHandlers.ts`
3. Мигрировать по частям:
   - Global navigation middleware → `globalHandlers`
   - Button handlers → `buttonHandlers`
   - Command handlers → `commandHandlers`
   - Scene guards → `sceneGuards`

**Файлы для изменения**:
- `/src/services/NavigationService.ts` - рефакторинг
- `/src/navigation/adapters/legacyNavigationAdapter.ts` - создать
- `/src/navigation/handlers/globalHandlers.ts` - создать

#### 2.2 Миграция компонентов меню
**Файлы для изменения**:
- `/src/components/menu/NavigationHandler.ts` - заменить `ctx.scene.enter` на `navigateToScene`
- `/src/components/menu/MenuActionRegistry.ts` - использовать SceneRegistry
- `/src/components/menu/SubscriptionHandler.ts` - добавить валидацию доступа
- `/src/components/menu/PhotoHandler.ts` - централизовать навигацию
- `/src/components/menu/VideoGenerationHandler.ts` - использовать NavigationRouter
- `/src/components/menu/CommandRegistry.ts` - мигрировать команды

**Пример миграции**:
```typescript
// БЫЛО
await ctx.scene.enter('helpScene')

// СТАЛО
import { navigateToScene } from '@/navigation'
await navigateToScene(ctx, 'helpScene')
```

### ЭТАП 3: Миграция сцен (3-4 дня)

#### 3.1 Топ-10 самых используемых сцен
**Приоритет**: 🔴 КРИТИЧЕСКИЙ

**Сцены для миграции**:
1. `subscriptionScene/index.ts` (16 вызовов)
2. `checkBalanceScene.ts` (8 вызовов)
3. `menuScene/index.ts` (6 вызовов)
4. `imageToVideoWizard/index.ts` (4 вызова)
5. `textToVideoWizard/index.ts` (3 вызова)
6. `helpScene/index.ts` (3 вызова)
7. `sizeWizard/index.ts` (3 вызова)
8. `instagramScrapingWizard/index.ts` (3 вызова)
9. `improvePromptWizard/index.ts` (2 вызова)
10. `paymentScene/index.ts` (2 вызова)

**Процесс миграции сцены**:
1. Заменить `ctx.scene.enter(mode)` на `navigateToMode(ctx, mode)`
2. Добавить импорт `import { navigateToScene, navigateToMode, goBack } from '@/navigation'`
3. Использовать `safeEnterScene` вместо прямых вызовов
4. Добавить валидацию доступа
5. Логировать навигационные операции

**Пример миграции**:
```typescript
// БЫЛО
await ctx.scene.leave()
ctx.session.mode = ModeEnum.SubscriptionScene
await ctx.scene.enter(ModeEnum.SubscriptionScene)

// СТАЛО
import { navigateToMode } from '@/navigation'
await navigateToMode(ctx, ModeEnum.SubscriptionScene, {
  leaveCurrent: true,
  saveToHistory: true,
  mode: ModeEnum.SubscriptionScene
})
```

#### 3.2 Миграция остальных сцен
**Приоритет**: 🟡 ВЫСОКИЙ

**Процесс**:
- Группами по 5-10 сцен
- Использовать поиск: `grep -r "ctx\.scene\.enter" /src/scenes/`
- Автоматизировать замену с помощью скриптов

**Скрипт для автоматизации**:
```bash
#!/bin/bash
# migrate_scene_navigation.sh

find src/scenes -name "*.ts" -exec grep -l "ctx\.scene\.enter" {} \; | while read file; do
  echo "Migrating: $file"
  # Заменить паттерны навигации
  sed -i 's/ctx\.scene\.enter(\([^)]*\))/navigateToScene(ctx, \1)/g' "$file"
  sed -i 's/ctx\.scene\.leave()/ctx.scene.leave()/g' "$file"
done
```

### ЭТАП 4: Middleware и интеграция (1-2 дня)

#### 4.1 Создание middleware для автоматической миграции
**Файлы для создания**:
- `/src/navigation/middleware/autoNavigationMiddleware.ts`

**Назначение**:
- Автоматический перехват всех `ctx.scene.enter` вызовов
- Логирование и аналитика
- Валидация переходов
- Поддержка legacy кода

#### 4.2 Интеграция с главным ботом
**Файлы для изменения**:
- `/src/index.ts` - добавить новые middleware
- `/src/services/NavigationService.ts` - зарегистрировать глобальные обработчики

**Добавить**:
```typescript
import { navigationRouter, createAnalyticsMiddleware } from '@/navigation'

// Аналитический middleware
bot.use(createAnalyticsMiddleware())

// Глобальные обработчики навигации
bot.use(registerGlobalNavigationHandlers(bot))
```

#### 4.3 Обновление scene guards
**Файлы для изменения**:
- `/src/navigation/middleware/sceneGuard.ts`

**Добавить**:
- Валидацию через SceneRegistry
- Автоматическое логирование
- Обработку ошибок

### ЭТАП 5: Тестирование (2-3 дня)

#### 5.1 Создание тестов
**Файлы для создания**:
- `/src/__tests__/navigation/NavigationRouter.test.ts`
- `/src/__tests__/navigation/SceneRegistry.test.ts`
- `/src/__tests__/navigation/analytics.test.ts`

**Тест-кейсы**:
- Навигация между сценами
- Проверка разрешений
- История навигации
- Обработка ошибок
- Аналитика

#### 5.2 Интеграционные тесты
**Файлы для создания**:
- `/src/__tests__/integration/navigation-integration.test.ts`

**Сценарии**:
- Полный путь пользователя: меню → подписка → генерация
- Навигация из разных сцен
- Обработка ошибок доступа
- Работа кнопки "Назад"

#### 5.3 Нагрузочное тестирование
**Проверить**:
- Производительность при 1000+ пользователях
- Память (утечки?)
- Время отклика (< 100ms)

### ЭТАП 6: Документация и обучение (1 день)

#### 6.1 Обновить документацию
**Файлы для изменения**:
- `/src/navigation/README.md` - создать
- `/src/navigation/INTEGRATION.md` - создать
- `/src/navigation/examples/` - создать примеры

**Разделы**:
- Как использовать NavigationRouter
- Добавление новых сцен
- Настройка прав доступа
- Аналитика и метрики
- Troubleshooting

#### 6.2 Создать примеры кода
**Файлы**:
- `/src/navigation/examples/basic-navigation.ts`
- `/src/navigation/examples/advanced-navigation.ts`
- `/src/navigation/examples/with-analytics.ts`
- `/src/navigation/examples/custom-handlers.ts`

### ЭТАП 7: Деплой и мониторинг (1 день)

#### 7.1 Поэтапный деплой
1. **День 1**: Деплой в staging
   - Миграция 50% сцен
   - A/B тестирование
   - Сбор метрик

2. **День 2**: Миграция оставшихся сцен
   - 100% миграция
   - Мониторинг ошибок
   - Сравнение с baseline

3. **День 3**: Полный деплой в production
   - Удаление legacy кода
   - Обновление документации

#### 7.2 Мониторинг
**Метрики для отслеживания**:
- Количество ошибок навигации
- Время отклика на переходы
- Популярность сцен
- Ошибки 404 (несуществующие сцены)
- Память и CPU

---

## 📈 ОЖИДАЕМЫЕ ПРЕИМУЩЕСТВА

### Архитектурные улучшения
1. **Централизация** - вся навигация в одном месте
2. **Типобезопасность** - строгая типизация маршрутов
3. **Валидация** - автоматическая проверка разрешений
4. **Логирование** - детальные логи всех операций
5. **Аналитика** - понимание поведения пользователей

### Производительность
- ⬇️ Снижение дублирования кода на 80%
- ⚡ Ускорение навигации на 15-20%
- 🧹 Упрощение отладки на 50%
- 📊 Улучшение observability на 100%

### Разработка
- ⏱️ Сокращение времени разработки новых функций на 30%
- 🐛 Снижение количества багов навигации на 60%
- 📖 Упрощение onboarding для новых разработчиков
- 🔄 Упрощение рефакторинга

---

## 🎯 КРИТЕРИИ УСПЕХА

### Функциональные
- [ ] 100% сцен используют NavigationRouter
- [ ] 0 прямых вызовов `ctx.scene.enter` вне навигации
- [ ] 100% переходов проходят валидацию
- [ ] Работает система "Назад" для всех сцен
- [ ] Логирование всех навигационных операций

### Технические
- [ ] Тестовое покрытие > 80%
- [ ] Время отклика навигации < 100ms
- [ ] 0 критических ошибок в production
- [ ] Память стабильна (нет утечек)
- [ ] TypeScript без ошибок

### Качественные
- [ ] Код соответствует стандартам проекта
- [ ] Документация полная и актуальная
- [ ] Примеры кода работают
- [ ] Troubleshooting guide готов

---

## ⚠️ РИСКИ И МИТИГАЦИЯ

### Высокие риски
1. **Регрессии в навигации** 🔴
   - Митигация: поэтапная миграция, A/B тестирование
2. **Производительность** 🟡
   - Митигация: нагрузочное тестирование, профилирование
3. **Сложность миграции** 🟡
   - Митигация: автоматизация, скрипты, приоритизация

### Средние риски
1. **Сопротивление команды** 🟢
   - Митигация: документация, примеры, обучение
2. **Время выполнения** 🟡
   - Митигация: приоритизация, поэтапный деплой

---

## 📝 ТРЕБОВАНИЯ К КОМАНДЕ

### Роли
- **Tech Lead** - архитектурные решения, код-ревью
- **Senior Developer** - миграция ключевых компонентов
- **Middle Developer** - миграция сцен, тестирование
- **QA Engineer** - тестирование, валидация

### Навыки
- Знание TypeScript и Telegraf
- Опыт работы с большими рефакторингами
- Понимание архитектурных паттернов
- Опыт с аналитикой и метриками

---

## 🚀 ПЛАН ДЕЙСТВИЙ НА НЕДЕЛЮ

### День 1-2: Подготовка
- [ ] Расширить SceneRegistry
- [ ] Создать типы и утилиты
- [ ] Подготовить скрипты миграции

### День 3-5: Миграция сервисов и компонентов
- [ ] Рефакторинг NavigationService.ts
- [ ] Миграция компонентов меню
- [ ] Создание адаптеров

### День 6-8: Миграция топ-10 сцен
- [ ] subscriptionScene
- [ ] checkBalanceScene
- [ ] menuScene
- [ ] imageToVideoWizard
- [ ] textToVideoWizard
- [ ] Остальные...

### День 9-10: Интеграция и middleware
- [ ] Создать auto-navigation middleware
- [ ] Интегрировать с ботом
- [ ] Обновить scene guards

### День 11-14: Тестирование
- [ ] Unit тесты
- [ ] Интеграционные тесты
- [ ] Нагрузочное тестирование
- [ ] Исправление багов

### День 15: Деплой
- [ ] Staging деплой
- [ ] Мониторинг
- [ ] Production деплой

---

## 💡 РЕКОМЕНДАЦИИ ПО ИНТЕГРАЦИИ

### Для новых сцен
```typescript
// Используйте NavigationRouter для всех переходов
import { navigateToScene, goBack } from '@/navigation'

// Вместо ctx.scene.enter()
await navigateToScene(ctx, 'myScene', {
  leaveCurrent: true,
  saveToHistory: true,
  mode: ModeEnum.MyScene
})

// Вместо ctx.scene.leave()
await goBack(ctx)
```

### Для проверки доступа
```typescript
// Проверяйте доступ через SceneRegistry
import { getSceneById, isSceneAccessible } from '@/navigation'

const scene = getSceneById('myScene')
if (!isSceneAccessible(scene, userAccessLevel, hasSubscription)) {
  await ctx.reply('Нет доступа к этой функции')
  return
}
```

### Для аналитики
```typescript
// Подписывайтесь на события навигации
import { navigationRouter } from '@/navigation'

navigationRouter.on(NavigationEvent.SCENE_ENTER, (event, context) => {
  // Отправить в Google Analytics
  // Записать в метрики
  // Уведомить админов
})
```

---

## 📞 КОНТАКТЫ И ПОДДЕРЖКА

### Каналы коммуникации
- **Slack**: #navigation-refactor
- **Jira**: NAV-REFACTOR project
- **Документация**: `/src/navigation/README.md`

### Экстренная связь
- **Tech Lead**: @techlead
- **On-call**: @oncall-developer

---

**Последнее обновление**: 04.12.2025
**Статус**: Готов к выполнению
**Версия**: 1.0
