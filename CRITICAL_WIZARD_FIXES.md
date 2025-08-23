# 🚨 КРИТИЧЕСКИЕ ИСПРАВЛЕНИЯ WIZARD'ОВ - НЕ ЛОМАЙ ЭТО!

## ⚠️ ПРОБЛЕМА КОТОРУЮ ИСПРАВИЛИ

**НИКОГДА НЕ ВЫЗЫВАЙ ПЕРВЫЙ ШАГ WIZARD'А ВРУЧНУЮ В .enter() МЕТОДЕ!**

### ❌ НЕПРАВИЛЬНО:
```typescript
textToVideoWizard.enter(async ctx => {
  // ❌ ДВОЙНОЙ ВЫЗОВ ПЕРВОГО ШАГА - ЛОМАЕТ WIZARD!
  const firstStepHandler = ctx.wizard.steps[0]
  await firstStepHandler(ctx) // ❌❌❌ НЕ ДЕЛАЙ ЭТО!
})
```

### ✅ ПРАВИЛЬНО:
```typescript  
textToVideoWizard.enter(async ctx => {
  // ✅ TELEGRAF АВТОМАТИЧЕСКИ ВЫЗЫВАЕТ ПЕРВЫЙ ШАГ
  console.log('Wizard entered, first step will execute automatically')
})
```

## 🎯 СУТЬ ПРОБЛЕМЫ

1. **Telegraf автоматически** вызывает первый шаг при `ctx.scene.enter()`
2. **НАШ enter handler** ТОЖЕ вызывал первый шаг  
3. **Результат**: ДВОЙНОЙ ВЫЗОВ → wizard ломается → пользователь видит главное меню вместо выбора моделей

## 🛠️ ЧТО ИСПРАВИЛИ

### Файл: `src/scenes/textToVideoWizard/index.ts`
```typescript
// БЫЛО:
textToVideoWizard.enter(async ctx => {
  const firstStepHandler = ctx.wizard.steps[0]
  await firstStepHandler(ctx) // ❌ ДВОЙНОЙ ВЫЗОВ
})

// СТАЛО:
textToVideoWizard.enter(async ctx => {
  console.log('🎬 [WIZARD] Wizard will automatically execute first step...')
  // ✅ НЕТ РУЧНОГО ВЫЗОВА ПЕРВОГО ШАГА
})
```

### Файл: `src/scenes/textToVideoWizard/simple.ts`
```typescript  
// БЫЛО:
simpleTextToVideoWizard.enter(async ctx => {
  const firstStepHandler = ctx.wizard.steps[0] 
  await firstStepHandler(ctx) // ❌ ДВОЙНОЙ ВЫЗОВ
})

// СТАЛО:
simpleTextToVideoWizard.enter(async ctx => {
  console.log('🎬 [SIMPLE] Wizard will automatically execute first step...')
  // ✅ НЕТ РУЧНОГО ВЫЗОВА ПЕРВОГО ШАГА
})
```

## 🚨 ПРАВИЛА КОТОРЫЕ НЕ ЛОМАЙ:

### 1. НЕ ВЫЗЫВАЙ ШАГИ WIZARD'А ВРУЧНУЮ
- ❌ `await ctx.wizard.steps[0](ctx)`  
- ❌ `await firstStepHandler(ctx)`
- ✅ Позволь Telegraf делать это автоматически

### 2. НЕ ВЫЗЫВАЙ ctx.wizard.next() В ПЕРВОМ ШАГЕ БЕЗ ПРИЧИНЫ
- ❌ Первый шаг показывает модели → сразу `ctx.wizard.next()` → ломает логику
- ✅ Первый шаг показывает модели → **ЖДЕТ** выбора → второй шаг обрабатывает выбор

### 3. ПРАВИЛЬНАЯ ЛОГИКА WIZARD'А:
```
Шаг 1: Показать модели → ЖДАТЬ выбора (НЕ переходить дальше)
Шаг 2: Обработать выбор модели → перейти к промпту  
Шаг 3: Обработать промпт → сгенерировать видео
```

## 🎬 КАК ПРОВЕРИТЬ ЧТО РАБОТАЕТ:

1. **Запустить бота**: `bun dev`
2. **Нажать**: "🎥 Видео из текста"  
3. **ДОЛЖНО ПОЯВИТЬСЯ**: Выбор моделей с кнопками:
   - `Veo 3 Fast | 8s | 📱 (40⭐)`
   - `Veo 3 | 8s | 📱 (202⭐)` 
   - И т.д.
4. **НЕ ДОЛЖНО**: Возвращать в главное меню

## 📋 ДИАГНОСТИКА ЕСЛИ ЛОМАЕТСЯ:

Ищи в логах:
- ✅ `🎬 [WIZARD] ✅ WIZARD ENTERED!` 
- ✅ `🎬 [WIZARD] Step 1: Creating CONFIG-based keyboard...`
- ✅ `🎬 [WIZARD] Step 1: ✅ REPLY SENT SUCCESSFULLY!`
- ❌ Если видишь `CASE 📲: menuCommand` сразу после входа в wizard - СЛОМАНО!

## 🔥 ЕСЛИ СНОВА СЛОМАЕТСЯ:

1. **Проверь**: Нет ли ручного вызова первого шага в `.enter()`
2. **Проверь**: Не вызывается ли `ctx.wizard.next()` преждевременно  
3. **Проверь**: Telegraf scene middleware правильно настроен
4. **Откати**: к последнему рабочему состоянию

---

# ⚡ КОММИТ ЭТИХ ИЗМЕНЕНИЙ НЕМЕДЛЕННО!

```bash
git add .
git commit -m "CRITICAL FIX: Remove double first step call in textToVideo wizards

- Fixed double execution of first step in textToVideoWizard.enter()  
- Fixed double execution of first step in simpleTextToVideoWizard.enter()
- Added detailed logging for wizard debugging
- Wizard now shows model selection properly after button click

🚨 DO NOT CALL WIZARD STEPS MANUALLY IN .enter() METHODS!
Telegraf handles this automatically."
```