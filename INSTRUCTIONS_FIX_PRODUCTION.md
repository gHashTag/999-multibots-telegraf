# 🚀 Инструкция по исправлению Template 1 в Production

## Проблема
В production FalVeo31Provider отключен, что ломает Template 1 (Google Veo 3.1).

## Решение
Нужно восстановить код FalVeo31Provider в production.

## Пошаговые действия

### 1. Файл: src/scenes/lipSyncWizard/ai-reels-wizard.ts

**Найти строку 17:**
```typescript
// TEMPORARILY DISABLED: import { FalVeo31Provider } from '@/core/lipsync/providers/fal-veo31-provider'
```

**Заменить на:**
```typescript
import { FalVeo31Provider } from '@/core/lipsync/providers/fal-veo31-provider'
```

**Найти строки 1205-1206:**
```typescript
throw new Error("Fal Veo 3.1 temporarily disabled - missing @fal-ai/client");
// const falVeo31 = new FalVeo31Provider()
```

**Заменить на:**
```typescript
const falVeo31 = new FalVeo31Provider()
```

### 2. Дополнительная проверка

Убедиться, что:
- `import { FalVeo31Provider } from '@/core/lipsync/providers/fal-veo31-provider'` есть
- Нет `throw new Error` для FalVeo 3.1
- Код после `const falVeo31 = new FalVeo31Provider()` корректный

### 3. Проверка

После исправления:
1. Запустить `npm run dev`
2. Выбрать Template 1 (Veo 3.1)
3. Пройти весь workflow до конца
4. Убедиться, что Veo 3.1 генерируется без ошибок

## Альтернативный способ (через git)

Если есть доступ к main ветке:

```bash
# Переключиться на production ветку
git checkout production  # или main

# Взять изменения из template-1
git cherry-pick 463b29744  # Обновление названий
git cherry-pick 04bfe76c0  # Исправление обработки фото

# Или мерджить всю ветку
git merge template-1
```

## Важно

- Зависимость `@fal-ai/client` УЖЕ установлена в package.json production
- Обработка фото УЖЕ исправлена в registerCommands.ts
- Нужно только восстановить FalVeo31Provider

## Тестирование

После деплоя в production:
1. Запустить Template 1
2. Загрузить изображение
3. Ввести текст
4. Дождаться lip-sync видео (30-60 сек)
5. Дождаться Veo 3.1 видео (5-10 мин)
6. Получить финальный ролик

Все должно работать без ошибок!