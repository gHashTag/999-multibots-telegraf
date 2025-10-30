# ✅ AI Reels Template 1 - Исправление Workflow

## 🎯 Исправленные проблемы

### 1. **Lip-sync видео отправлялось как текст с URL**
**Было**: Текстовое сообщение с упоминанием модели
```
🎬 Видео готово!
📥 Скачать: https://...
🤖 Модель: Fal.ai Veed Fabric 1.0 Fast
```

**Стало**: Отправка файлом без упоминания модели
```typescript
await ctx.replyWithVideo(
  { url: finalVideoUrl },
  {
    caption: isRu
      ? `🎬 Ваш AI Reels готов!\n\n✨ Приятного просмотра!`
      : `🎬 Your AI Reels is ready!\n\n✨ Enjoy!`,
  }
)
```

### 2. **Google Veo 3.1 не генерировался и склеивание не происходило**
**Причина**:
- AsyncLipSyncManager использовался для **синхронного** Fal.ai провайдера
- Wizard выходил из сцены сразу (`ctx.scene.leave()`)
- Step 3 (Google Veo 3.1) никогда не запускался

**Решение**:
- Использовать `FalVeedFabricProvider` напрямую (синхронно)
- Сохранить результат в `ctx.session.aiReels.firstVideoUrl`
- Перейти к Step 3 через `ctx.wizard.next()`

## 🔧 Изменения в коде

### Step 2: Генерация lip-sync (строки 851-940)

**Было**:
```typescript
// AsyncLipSyncManager (асинхронный)
const jobId = await asyncLipSyncManager.startAsyncGeneration(...)
await ctx.reply('Результат придет отдельным сообщением')
return ctx.scene.leave() // ❌ Выход из wizard
```

**Стало**:
```typescript
// FalVeedFabricProvider (синхронный)
const falProvider = new FalVeedFabricProvider()
const lipSyncResult = await falProvider.generate(input)

// Сохраняем в session
ctx.session.aiReels = {
  ...ctx.session.aiReels,
  firstVideoUrl: lipSyncResult.output,
  step: 'wan25_generation',
}

// ✅ Переходим к Step 3
return ctx.wizard.next()
```

### Step 3: Генерация Google Veo 3.1 (строки 1013-1195)
- Читает `ctx.session.aiReels.firstVideoUrl` из Step 2
- Генерирует второе видео через Kie.ai Google Veo 3.1
- Сохраняет в `ctx.session.aiReels.secondVideoUrl`
- При ошибке отправляет lip-sync видео **файлом**
- Переходит к Step 4 (`ctx.wizard.next()`)

### Step 4: Склеивание (строки 1197-1310)
- Читает оба URL из session
- Скачивает оба видео
- Склеивает через FFmpeg
- Загружает результат в Supabase
- Отправляет финальное видео **файлом** без упоминания моделей

## 📊 Полный Workflow Template 1

```
Step 0: Выбор изображения
         ↓
Step 1: Ввод текста для озвучки
         ↓
Step 2: Генерация lip-sync (Fal.ai) СИНХРОННО
         ├─ Создание TTS аудио (ElevenLabs)
         ├─ Генерация lip-sync видео (Fal.ai)
         └─ Сохранение в ctx.session.aiReels.firstVideoUrl
         ↓
       ctx.wizard.next()
         ↓
Step 3: Генерация Google Veo 3.1 (Kie.ai) АСИНХРОННО
         ├─ Создание задачи в Google Veo 3.1
         ├─ Polling статуса (до 10 минут)
         └─ Сохранение в ctx.session.aiReels.secondVideoUrl
         ↓
       ctx.wizard.next()
         ↓
Step 4: Склеивание FFmpeg
         ├─ Скачивание обоих видео
         ├─ Склеивание через FFmpeg
         ├─ Загрузка в Supabase Storage
         └─ Отправка ФАЙЛОМ пользователю
         ↓
       ctx.scene.leave()
```

## 🎬 UX для пользователя

### Успешный сценарий:
```
Пользователь: [загружает изображение]
Бот: ✅ Изображение получено!

Пользователь: [вводит текст]
Бот: 🎬 Создаем первое видео (lip-sync)...
     ⏳ Подождите 30-60 секунд...

Бот: ✅ Первое видео (lip-sync) готово!
     🎬 Создаем второе видео (Google Veo 3.1)...

Бот: ✅ Второе видео (Google Veo 3.1) готово!
     3️⃣ Склеиваем два видео в финальный ролик...
     ⏳ Это займет 30-45 секунд...

Бот: [отправляет ВИДЕО ФАЙЛОМ]
     🎬 Ваш AI Reels готов!
     ✨ Приятного просмотра!

Бот: ✨ Спасибо за использование AI Reels!
```

### Сценарий с ошибкой Google Veo 3.1:
```
Пользователь: [загружает изображение]
Бот: ✅ Изображение получено!

Пользователь: [вводит текст]
Бот: 🎬 Создаем первое видео (lip-sync)...

Бот: ✅ Первое видео (lip-sync) готово!
     🎬 Создаем второе видео (Google Veo 3.1)...

Бот: ❌ Ошибка генерации второго видео. Но первое видео готово!
     [отправляет lip-sync ВИДЕО ФАЙЛОМ]
     🎬 Ваше lip-sync видео
```

## 🔑 Ключевые моменты

### AsyncLipSyncManager vs Прямое использование провайдера

| Провайдер | Режим | Использование |
|-----------|-------|---------------|
| **Kie.ai** | Асинхронный (webhook) | AsyncLipSyncManager |
| **Fal.ai** | Синхронный (blocking) | Прямое использование |

### Когда использовать AsyncLipSyncManager?
- ✅ Kie.ai (webhook callback)
- ✅ Любой асинхронный провайдер с polling
- ❌ Fal.ai (синхронный результат)
- ❌ Template 1 (нужен контроль workflow)

### Когда использовать провайдер напрямую?
- ✅ Fal.ai (синхронный результат)
- ✅ Template 1 (wizard с несколькими шагами)
- ✅ Когда нужен контроль потока выполнения
- ❌ Kie.ai (нужен webhook handling)

## 💰 Стоимость

**Текущая**: 240⭐ (фиксированная)

**Компоненты**:
- Fal.ai lip-sync 720p (~60 сек): ~187⭐
- Google Veo 3.1 image-to-video (5 сек): ~160⭐
- FFmpeg склеивание: бесплатно
- **Итого себестоимость**: ~347⭐

**Проблема**: Себестоимость превышает цену продажи!

**Решение**: Увеличить цену до 350⭐ или использовать более дешёвый провайдер для lip-sync.

## 🚀 Деплой

```bash
git add .
git commit -m "fix: Template 1 workflow - sync Fal.ai + video file output"
git push origin production
```

## 🧪 Тестирование

1. Запустить бота в production
2. Выбрать "AI Reels" → "Шаблон номер один (WAN25)"
3. Загрузить изображение
4. Ввести текст для озвучки
5. Дождаться результата

**Ожидаемый результат**:
- ✅ Lip-sync видео генерируется за 30-60 секунд
- ✅ Google Veo 3.1 видео генерируется за 5-10 минут
- ✅ Склеивание происходит автоматически
- ✅ Финальное видео отправляется **файлом**
- ✅ Нет упоминания моделей и промежуточных URL
