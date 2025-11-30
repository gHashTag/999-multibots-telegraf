# 🔧 ИСПРАВЛЕНИЕ: Поддержка старых моделей Replicate и новых Fal

## 📋 ПРОБЛЕМА

Пользователи сообщали, что старые модели (обученные на Replicate) перестали работать после перехода на Fal.ai. При попытке сгенерировать изображение с старой моделью возникали ошибки.

## 🔍 КОРЕНЬ ПРОБЛЕМЫ

В коде `generateNeuroPhotoDirect.ts` была ошибка в логике выбора API провайдера:

```typescript
// БЫЛО (неправильно):
let useFal = !!process.env.FAL_KEY
// Всегда использовался Fal.ai если есть ключ, независимо от типа модели
```

Код не проверял, какая модель используется (Replicate или Fal), и всегда пытался использовать Fal.ai для всех моделей.

## ⚙️ ИСПРАВЛЕНИЯ

### 1. **Получение моделей всех типов** (`src/scenes/neuroPhotoWizard/index.ts`)

Раньше запрашивались только модели с `api = 'replicate'`:

```typescript
userModels = await getActiveUserModelsByType(Number(telegramId), 'replicate')
```

**Исправлено:** Добавлена логика получения моделей других API, если нет replicate моделей:

```typescript
// Сначала пробуем получить replicate модели
userModels = await getActiveUserModelsByType(Number(telegramId), 'replicate')

// Если нет replicate моделей, получаем остальные (Fal и т.д.)
if (!userModels || userModels.length === 0) {
  const { data: allModels } = await supabase
    .from('model_trainings')
    .select('*')
    .eq('telegram_id', Number(telegramId))
    .eq('status', 'SUCCESS')
    .neq('api', 'replicate') // Все кроме replicate
    .order('created_at', { ascending: false })
  userModels = allModels as ModelTraining[]
}
```

### 2. **Определение API провайдера** (`src/services/generateNeuroPhotoDirect.ts`)

Добавлена проверка поля `api` в userModel:

```typescript
// 🔧 ИСПРАВЛЕНО: Определяем провайдер на основе модели пользователя
const apiType = (ctx.session.userModel as any)?.api || 'fal'
let useFal = apiType.toLowerCase() !== 'replicate'

if (useFal) {
  // ✨ Используем Fal.ai для моделей не-Replicate
  imageUrl = await generateImageWithFalAndLora(prompt)
} else {
  // 🔄 Используем Replicate для старых моделей
  const output = await replicate.run(model_url, { input: replicateInput })
}
```

### 3. **Исправление сохранения model_type** (`src/services/generateNeuroPhotoDirect.ts`)

Раньше сохранялся URL модели, что неправильно:

```typescript
// БЫЛО (неправильно):
await savePromptDirect(prompt, model_url, ModeEnum.NeuroPhoto, ...)
```

**Исправлено:** Сохраняется API тип:

```typescript
// 🔧 ИСПРАВЛЕНО:
const modelTypeForSave = apiType || 'unknown'
await savePromptDirect(prompt, modelTypeForSave, ModeEnum.NeuroPhoto, ...)
```

## ✅ РЕЗУЛЬТАТ

Теперь система корректно:
1. ✅ Получает модели всех типов (Replicate, Fal и другие)
2. ✅ Определяет API провайдер на основе поля `api` в модели
3. ✅ Использует Replicate для старых моделей (`api = 'replicate'`)
4. ✅ Использует Fal.ai для новых моделей (`api != 'replicate'`)
5. ✅ Сохраняет корректный API тип в историю генераций

## 🧪 ПРОВЕРКА

Для проверки исправлений выполните SQL скрипт:

```bash
# Проверить модели и их API типы
psql -f scripts/check-model-types.sql
```

Или в Supabase SQL Editor выполните запросы из файла `scripts/check-model-types.sql`.

## 📝 ДЕПЛОЙ

Исправления задеплоены в production:
- ✅ Код собран без ошибок
- ✅ Контейнер развернут на 188.137.250.69:3001
- ✅ Health check: PASSED
- ✅ Webhook verification: PASSED

Теперь пользователи могут снова генерировать изображения со старыми моделями Replicate! 🎉
