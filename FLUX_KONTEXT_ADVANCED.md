# FLUX Kontext Advanced - Продвинутое ИИ редактирование изображений

## Обзор

Продвинутая реализация FLUX Kontext с поддержкой нескольких изображений и специализированных режимов редактирования, основанная на исследовании возможностей [FLUX.1 Kontext от Black Forest Labs](https://replicate.com/blog/flux-kontext).

## Возможности

### 🎨 Режимы редактирования

1. **🖼️ Одиночное редактирование** - классическое редактирование одного изображения
2. **🔗 Объединение изображений** - объединение двух изображений в одно
3. **👤 Серия портретов** - создание серии портретов из одного изображения  
4. **💇 Изменить стрижку** - изменение прически и цвета волос
5. **🏛️ Знаменитые места** - помещение себя на фоне достопримечательностей
6. **📸 Профессиональный портрет** - создание профессионального портрета

### 💎 Модели

- **💼 FLUX Kontext Pro** - быстрая и качественная обработка (9⭐)
- **🚀 FLUX Kontext Max** - максимальное качество и точность (12⭐)

## Архитектура

### Файлы реализации

```
src/
├── scenes/fluxKontextScene/index.ts          # Основная сцена с UI
├── services/generateFluxKontext.ts           # Сервисы обработки
├── interfaces/telegram-bot.interface.ts     # Интерфейсы сессии
├── hearsHandlers.ts                         # Обработчики кнопок
└── handlers/handleTextMessage/index.ts      # Обработка текста
```

### Интерфейсы

#### MySession (расширение)
```typescript
// Продвинутые поля FLUX Kontext
fluxKontextMode?: 'single' | 'multi' | 'portrait_series' | 'haircut' | 'landmarks' | 'headshot'
fluxKontextImageA?: string // Первое изображение
fluxKontextImageB?: string // Второе изображение для multi-image режима
awaitingFluxKontextImageA?: boolean
awaitingFluxKontextImageB?: boolean
fluxKontextStep?: 'mode_select' | 'image_a' | 'image_b' | 'prompt' | 'processing'
```

#### AdvancedFluxKontextParams
```typescript
interface AdvancedFluxKontextParams {
  prompt: string
  mode: 'single' | 'multi' | 'portrait_series' | 'haircut' | 'landmarks' | 'headshot'
  imageA: string // Первое изображение (обязательно)
  imageB?: string // Второе изображение (для multi режима)
  modelType: 'pro' | 'max'
  telegram_id: string
  username: string
  is_ru: boolean
  ctx: MyContext
}
```

## Логика работы

### 1. Выбор режима
Пользователь выбирает один из 6 режимов редактирования через inline-клавиатуру.

### 2. Загрузка изображений
- **Одно изображение**: для большинства режимов
- **Два изображения**: для режима "Объединение изображений"

### 3. Выбор модели
Выбор между FLUX Kontext Pro и Max с отображением стоимости.

### 4. Ввод промпта
Специализированные примеры промптов для каждого режима:

#### Примеры промптов по режимам

**Объединение изображений:**
- "combine these two people in one photo"
- "merge the backgrounds seamlessly"
- "blend the lighting from both images"

**Серия портретов:**
- "create 4 different professional portraits"
- "show different emotions and expressions"
- "various lighting setups"

**Изменение стрижки:**
- "give her a bob haircut"
- "change hair color to blonde"
- "modern short hairstyle"

**Знаменитые места:**
- "put in front of Eiffel Tower"
- "Times Square background"
- "standing at the Great Wall of China"

**Профессиональный портрет:**
- "professional business headshot"
- "corporate portrait with neutral background"
- "LinkedIn profile photo style"

### 5. Обработка и результат
Автоматическое улучшение промпта в зависимости от режима и генерация финального изображения.

## Особенности реализации

### Улучшение промптов
Функция `enhancePromptForMode` автоматически дополняет пользовательские промпты специфичными инструкциями для каждого режима:

```typescript
const enhancePromptForMode = (prompt: string, mode: string, is_ru: boolean): string => {
  const enhancements = {
    single: prompt,
    multi: `Combine and merge elements: ${prompt}. Seamlessly blend...`,
    portrait_series: `Create a professional portrait series: ${prompt}...`,
    // ... другие режимы
  }
  return enhancements[mode] || prompt
}
```

### Динамическое ценообразование
Стоимость адаптируется в зависимости от сложности режима:
```typescript
let cost = modelConfig.costPerImage
if (mode === 'multi' || mode === 'portrait_series') {
  cost = Math.round(cost * 1.5) // +50% для сложных режимов
}
```

### Пошаговая логика
Сцена использует step-based подход аналогично Morphing:
- `mode_select` → `image_a` → `image_b` (если нужно) → `prompt` → `processing`

## Интеграция

### Подключение сцены
```typescript
// В stage.register()
stage.register(fluxKontextScene)
```

### Активация через команды
```typescript
// В hearsHandlers.ts
bot.hears([levels[12].title_ru, levels[12].title_en], async (ctx: MyContext) => {
  await ctx.scene.enter('flux_kontext_scene')
})
```

## Преимущества

1. **🚀 Расширенная функциональность** - 6 специализированных режимов
2. **🖼️ Поддержка нескольких изображений** - как в Morphing для видео
3. **🎯 Умные промпты** - автоматическое улучшение под каждый режим
4. **💰 Динамические цены** - справедливая стоимость по сложности
5. **🔄 Итеративность** - возможность пробовать разные режимы
6. **📱 Интуитивный UX** - пошаговый процесс с понятными кнопками

## Будущие улучшения

1. **Композитные изображения** - реальное объединение двух изображений для multi-режима
2. **Batch обработка** - генерация нескольких вариантов одновременно
3. **Предустановки** - готовые шаблоны для популярных задач
4. **История** - сохранение настроек режимов для быстрого доступа

## Заключение

Продвинутая реализация FLUX Kontext превращает простое редактирование изображений в мощный инструмент для творчества, используя лучшие практики из существующего Morphing функционала и расширяя возможности на основе исследования возможностей FLUX.1 Kontext. 