# 🔒 LipSync: Временные ограничения для админов

## 📋 Текущий статус
**LipSync функция настроена только для администраторов** пока проходит тестирование интеграции с ai-server.

## 🛡️ Установленные ограничения

### 1. **Уровень меню** (файл: `src/menu/mainMenu.ts`)
```typescript
// lip_sync - новая Kling модель (временно только для админов)
14: {
  title_ru: '🎤 Kling Lip Sync',
  title_en: '🎤 Kling Lip Sync',
  admin_only: true, // 🔒 ВРЕМЕННО: только для админов пока тестируется интеграция с ai-server
},
```

### 2. **Уровень сцены** (файл: `src/scenes/lipSyncWizard/index.ts`)
```typescript
// НОВОЕ: Проверка админских прав
if (!telegramId || !isUserAdmin(telegramId)) {
  await ctx.reply(
    isRu 
      ? '🔒 Извините, функция LipSync временно доступна только администраторам.'
      : '🔒 Sorry, LipSync feature is temporarily available for administrators only.'
  )
  return ctx.scene.leave()
}
```

### 3. **Список админов** (переменная окружения)
```bash
ADMIN_IDS=144022504,other_admin_id
```

## 🚀 Как убрать ограничения после тестирования

### Шаг 1: Обновить меню
В файле `src/menu/mainMenu.ts`:
```typescript
// lip_sync - новая Kling модель
14: {
  title_ru: '🎤 Kling Lip Sync',
  title_en: '🎤 Kling Lip Sync',
  // admin_only: true, // УДАЛИТЬ ЭТУ СТРОКУ
},
```

### Шаг 2: Упростить проверку в сцене
В файле `src/scenes/lipSyncWizard/index.ts`:
```typescript
export const lipSyncWizard = new Scenes.WizardScene<MyContext>(
  'lip_sync',
  async ctx => {
    const isRu = isRussianFromState(ctx)
    // УДАЛИТЬ всю проверку админских прав:
    // const telegramId = ctx.from?.id?.toString()
    // if (!telegramId || !isUserAdmin(telegramId)) { ... }
    
    await ctx.reply(
      isRu ? 'Отправьте видео или URL видео' : 'Send a video or video URL',
      {
        reply_markup: { remove_keyboard: true },
      }
    )
    return ctx.wizard.next()
  },
  // ... остальные шаги остаются без изменений
```

### Шаг 3: Очистить импорты (опционально)
Если админская проверка больше не нужна:
```typescript
// УДАЛИТЬ эти строки из начала файла:
// const adminIds = process.env.ADMIN_IDS?.split(',') || []
// function isUserAdmin(telegramId: string): boolean {
//   return adminIds.includes(telegramId)
// }
```

## 🧪 План тестирования перед открытием

### Критерии готовности:
- ✅ AI-server стабильно отвечает на LipSync запросы
- ✅ Fallback на Replicate работает корректно
- ✅ Логирование показывает успешные операции
- ✅ Тестирование с разными форматами видео/аудио
- ✅ Проверка обработки ошибок
- ✅ Тестирование нагрузки (несколько одновременных запросов)

### Рекомендуемый процесс тестирования:
1. **Тестирование админами** (текущий этап)
2. **Beta-тестирование с ограниченной группой**
3. **Постепенное открытие для всех пользователей**

## 📊 Мониторинг после открытия

После снятия ограничений рекомендуется отслеживать:
- Количество запросов к ai-server vs Replicate
- Время отклика и успешность обработки
- Жалобы пользователей на качество/ошибки
- Нагрузку на сервера

## 🔧 Быстрое переключение в экстренной ситуации

Если нужно быстро вернуть ограничения:
```typescript
// В src/menu/mainMenu.ts
admin_only: true, // Вернуть эту строку

// В src/scenes/lipSyncWizard/index.ts  
// Вернуть проверку админских прав в начало первого шага
```

---

**Примечание:** Данные ограничения введены временно для безопасного тестирования новой интеграции LipSync с ai-server. После стабилизации функции ограничения должны быть сняты.