# 🚨 КРИТИЧЕСКАЯ ПРОБЛЕМА: НЕСООТВЕТСТВИЕ MODE И ENUM

## ❌ ПРОБЛЕМНЫЕ КНОПКИ

В `unified-navigation.config.ts` 5 кнопок имеют `mode`, которых НЕТ в `ModeEnum`:

1. **🎨 ИИ Фотошоп** → mode: `'ai_photoshop'` ❌ НЕТ в ModeEnum!
2. **🌀 Infinity Морфинг** → mode: `'morphing'` ❌ НЕТ в ModeEnum!
3. **🔍 Мониторинг конкурентов** → mode: `'competitor_monitoring'` ❌ НЕТ в ModeEnum!
4. **🎬 ИИ Рилс** → mode: `'ai_reels'` ❌ НЕТ в ModeEnum!
5. **🌐 EN/RU** → mode: `'language'` ❌ НЕТ в ModeEnum!

## ✅ ПРАВИЛЬНЫЕ КНОПКИ

Остальные 20 кнопок используют корректные ModeEnum значения:
- ModeEnum.NeuroPhoto
- ModeEnum.ImageToPrompt
- ModeEnum.Avatar
- и т.д.

## 🔍 ПРОБЛЕМА В handleMenuButtonPress

В файле `unified-navigation.config.ts` строка 368:
```typescript
ctx.session.mode = button.mode as ModeEnum  // ❌ ОШИБКА ТИПИЗАЦИИ!
```

Если `button.mode` это строка `'ai_photoshop'` (которой НЕТ в ModeEnum), то приведение типов `as ModeEnum` НЕ СРАБОТАЕТ правильно!

## 🔍 ПРОБЛЕМА В checkBalanceScene

В файле `checkBalanceScene.ts` строка 1040:
```typescript
await ctx.scene.enter(mode, {...})  // ❌ Если mode это строка 'ai_photoshop'
```

Если `mode` это строка 'ai_photoshop', а не корректный ModeEnum, то `ctx.scene.enter()` может НЕ НАЙТИ нужную сцену!

## 📋 НУЖНЫЕ ДЕЙСТВИЯ

### Вариант 1: Добавить в ModeEnum (РЕКОМЕНДУЕТСЯ)
Добавить в `src/interfaces/modes.ts`:
```typescript
AIPhotoshop = 'ai_photoshop',
Morphing = 'morphing',
CompetitorMonitoring = 'competitor_monitoring',
AIReels = 'ai_reels',
Language = 'language',
```

И обновить `unified-navigation.config.ts`:
```typescript
// Было:
mode: 'ai_photoshop'

// Стало:
mode: ModeEnum.AIPhotoshop
```

### Вариант 2: Исправить handleMenuButtonPress
Изменить логику так, чтобы она корректно обрабатывала строковые mode.

## ⚠️ ТЕКУЩЕЕ ПОВЕДЕНИЕ

Сейчас эти 5 кнопок МОГУТ работать через универсальный обработчик в `hearsHandlers.ts`, потому что:

1. `handleMenuButtonPress()` сохраняет `ctx.session.mode = 'ai_photoshop'`
2. `checkBalanceScene` читает `ctx.session.mode`
3. `enterTargetScene()` пытается сделать `ctx.scene.enter('ai_photoshop')`
4. **НО:** Если сцены с именем 'ai_photoshop' нет, будет ошибка!

## 🎯 РЕКОМЕНДАЦИЯ

**НЕМЕДЛЕННО ИСПРАВИТЬ** - добавить недостающие значения в ModeEnum и обновить unified-navigation.config.ts для единообразия и правильной типизации!
