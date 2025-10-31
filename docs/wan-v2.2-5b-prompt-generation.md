# WAN v2.2-5b Prompt Generation - Документация

## 🎯 Обзор

WAN v2.2-5b от Alibaba - китайская модель, которая лучше работает с **английскими промптами**. Поэтому мы используем двухэтапную генерацию промпта:

1. **Перевод на английский** (если текст на русском)
2. **Генерация визуального промпта** на английском

## 🔄 Процесс генерации промпта

### Этап 1: Перевод текста пользователя на английский

**Функция**: `translateToEnglish(text: string): Promise<string>`

**Когда используется**: Автоматически, если `language === 'ru'`

**Пример**:
```typescript
// Пользователь ввел:
"Сегодня я расскажу о путешествиях по Европе"

// После перевода:
"Today I'll talk about traveling through Europe"
```

**Параметры OpenAI**:
- Model: `gpt-4o-mini`
- Temperature: `0.3` (низкая для точного перевода)
- Max tokens: `500`

**System prompt**:
```
You are a professional translator. Translate the following text to English.
Keep the meaning and style. Return ONLY the translation, no explanations.
```

### Этап 2: Генерация визуального промпта

**Функция**: `generateVisualPrompt(userText: string, language: 'ru' | 'en'): Promise<string>`

**Входные данные**: Английский текст (переведенный или оригинальный)

**Выходные данные**: Детальный визуальный промпт на английском (100-150 слов)

**Пример**:
```typescript
// Английский текст:
"Today I'll talk about traveling through Europe"

// Визуальный промпт:
"A dynamic cinematic shot starting with a close-up of a vintage world map,
camera slowly zooms out revealing scattered passport stamps, old photographs,
and a compass. Soft golden hour lighting streams through a window, creating
warm shadows. The scene transitions to show gentle hand movements over the map,
tracing routes through European cities. Vertical composition 9:16, nostalgic
travel vibes, natural documentary style, smooth camera movements."
```

**Параметры OpenAI**:
- Model: `gpt-4o-mini`
- Temperature: `0.8` (высокая для креативности)
- Max tokens: `300`

**System prompt**:
```
You are an expert at creating visual prompts for AI video generation.

Task: Based on user's text, create a short but detailed visual prompt that:
1. UNPACKS THE IDEA visually - turn the spoken concept into concrete visual scenes
2. Describes specific images, scenes, movements, and actions
3. Fits vertical 9:16 video format (for social media)
4. Creates cinematic, dynamic picture with camera movements

Rules:
- Prompt MUST be in English (for Alibaba WAN v2.2-5b model)
- Length: 100-150 words
- Use visual details: lighting, camera angles, movements, emotions, atmosphere
- Avoid abstract concepts, focus on CONCRETE visuals
- Include vertical composition 9:16 format
- Add camera movements and transitions
```

## 📊 Примеры генерации

### Пример 1: О путешествиях (Русский текст)

**Ввод пользователя**:
```
Сегодня я расскажу о своих путешествиях по Азии
```

**ШАГ 1 - Перевод**:
```
Today I'll talk about my travels across Asia
```

**ШАГ 2 - Визуальный промпт**:
```
A dynamic vertical composition starting with an overhead shot of Asian street markets,
vibrant colors of traditional lanterns swaying gently. Camera tilts down revealing
hands browsing through colorful spices and textiles. Smooth transition to iconic
temple architecture silhouettes against sunset sky. Warm golden lighting throughout,
documentary-style cinematography. Close-ups of cultural details - ornate patterns,
traditional crafts, bustling street life. 9:16 vertical format, travel vlog aesthetic,
natural camera movements creating immersive journey through Asian landscapes.
```

### Пример 2: О технологиях (Английский текст)

**Ввод пользователя**:
```
In this video we'll explore artificial intelligence
```

**ШАГ 1 - Перевод**: *пропускается (уже на английском)*

**ШАГ 2 - Визуальный промпт**:
```
Futuristic tech environment in vertical 9:16 format. Camera starts tight on glowing
neural network visualizations, digital nodes connecting and pulsing with light. Smooth
zoom out reveals holographic AI interface floating in space. Blue and purple neon
lighting creates high-tech atmosphere. Transition to close-ups of circuit boards coming
to life, data streams flowing through transparent displays. Robotic elements in soft
focus background. Modern, sleek aesthetic with dynamic camera movements. Cinematic
depth of field, sci-fi visual storytelling, vertical composition optimized for social
media platforms.
```

### Пример 3: О кулинарии (Русский текст)

**Ввод пользователя**:
```
Научу готовить идеальную пасту карбонара
```

**ШАГ 1 - Перевод**:
```
I'll teach you how to cook the perfect pasta carbonara
```

**ШАГ 2 - Визуальный промпт**:
```
Vertical kitchen scene in 9:16 format. Camera starts with close-up of fresh pasta
being lifted from boiling water, steam rising beautifully. Smooth transition to hands
whisking eggs and pecorino cheese in ceramic bowl. Warm, natural lighting from window
creates appetizing shadows. Pan reveals sizzling guanciale in cast iron pan, golden
and crispy. Final shot shows creamy pasta being tossed, camera following the motion
vertically. Food photography aesthetic, professional cooking show style, dynamic camera
movements emphasizing cooking process, mouth-watering presentation.
```

## 🎨 Ключевые элементы промпта

### Обязательные компоненты:
1. **Vertical composition 9:16** - упоминание формата
2. **Camera movements** - zoom, pan, tilt, smooth transitions
3. **Lighting** - golden hour, neon, natural, dramatic, etc.
4. **Concrete visuals** - конкретные объекты, сцены, действия
5. **Atmosphere/Style** - cinematic, documentary, sci-fi, food photography, etc.

### Избегаем:
- ❌ Абстрактные концепции ("beautiful", "amazing")
- ❌ Текст или слова в промпте
- ❌ Лица людей (lip-sync уже есть в первом видео)
- ❌ Слишком короткие промпты (<80 слов)
- ❌ Слишком длинные промпты (>200 слов)

## 🔧 Техническая интеграция

### В wizard (ai-reels-wizard.ts):

```typescript
// Step 3: Генерация WAN v2.2-5b видео
const userText = ctx.session.aiReels?.text || ''
const isRu = isRussianFromState(ctx)

// Генерируем промпт (автоматически переведет если нужно)
const visualPrompt = await falWan25.generateVisualPrompt(userText, isRu ? 'ru' : 'en')

// Отправляем в WAN v2.2-5b
const wan25Result = await falWan25.generate({
  imageUrl,
  prompt: visualPrompt, // ВСЕГДА на английском
  aspectRatio: '9:16',
  // ...
})
```

### В provider (fal-wan25-provider.ts):

```typescript
async generateVisualPrompt(userText: string, language: 'ru' | 'en'): Promise<string> {
  // ШАГ 1: Перевод (если русский)
  let englishText = userText
  if (language === 'ru') {
    englishText = await this.translateToEnglish(userText)
  }

  // ШАГ 2: Генерация промпта (всегда на английском)
  const visualPrompt = await openai.chat.completions.create({
    // ...
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: englishText }, // английский текст
    ],
  })

  return visualPrompt // всегда на английском
}
```

## 📝 Логирование

Все этапы логируются для отладки:

```typescript
// Перевод
🌐 [WAN TRANSLATE] Text translated to English
  originalLength: 45
  translatedLength: 42

// Генерация промпта
✨ [WAN PROMPT] Visual prompt generated (English)
  originalText: "Сегодня я расскажу о путешествиях"
  englishText: "Today I'll talk about traveling"
  promptLength: 156
  promptPreview: "A dynamic cinematic shot starting with..."
```

## 🚨 Обработка ошибок

### Fallback стратегия:

1. **Если перевод failed** → используем оригинальный текст
2. **Если генерация промпта failed** → используем fallback промпт:
   ```
   A dynamic cinematic scene with expressive movements, natural lighting,
   vertical composition 9:16 format for social media, high quality production
   value, engaging visual storytelling, smooth camera movements.
   ```

## 💰 Стоимость

**OpenAI API вызовы на один AI Reels**:
- Перевод (если русский): `gpt-4o-mini` ~50 tokens = $0.00001
- Генерация промпта: `gpt-4o-mini` ~300 tokens = $0.00006
- **Итого**: ~$0.00007 (~0.004⭐ при курсе $1 = 60⭐)

**WAN v2.2-5b генерация**:
- Fal.ai: ~$0.50 за 5 секунд = ~30⭐

**Общая стоимость**: ~30⭐ на WAN v2.2-5b генерацию

## 🎯 Преимущества подхода

1. ✅ **Оптимально для китайской модели** - промпт всегда на английском
2. ✅ **Контекстуальный визуал** - промпт отражает ИДЕЮ текста
3. ✅ **Вертикальный формат** - 9:16 для соцсетей
4. ✅ **Кинематографичность** - камера, освещение, движения
5. ✅ **Детальность** - конкретные визуальные элементы
6. ✅ **Fallback защита** - работает даже если OpenAI недоступен

## 🧪 Тестирование

```bash
# 1. Пересоберите
npm run build

# 2. Запустите бота
npm run dev

# 3. В Telegram:
# - Выберите AI Reels Template 1
# - Загрузите изображение
# - Введите текст на русском: "Сегодня расскажу о космосе"
# - Получите видео 9:16 с космическими визуалами!
```

## 📊 Ожидаемые результаты

**Текст**: "Сегодня расскажу о космосе"
**Промпт** (автоматически сгенерированный):
```
A breathtaking vertical space journey in 9:16 format. Camera starts with close-up
of Earth's atmosphere, beautiful blue gradient fading to black starfield. Smooth
zoom out reveals stunning cosmic vista with swirling galaxies and nebulae. Cinematic
camera movement through asteroid field, floating rocks passing by. Transition to
International Space Station silhouette against glowing sun. Deep space colors -
purples, blues, vibrant cosmic clouds. Documentary-style cinematography, awe-inspiring
scale, vertical composition perfect for social media, dynamic camera following
cosmic journey.
```

**Видео**: Кинематографичное вертикальное видео с космическими сценами, плавными движениями камеры, идеально для Instagram Reels/TikTok
