# 🎬 Полное руководство: Sora 2 Visual Content Creator Agent

> **Источник:** Проверенный production агент из bible_vibecoder
> **Дата:** 2025-10-16

---

## 🎯 Что делает этот агент?

**Sora 2 Visual Content Creator** генерирует **готовые промпты для Sora 2**, которые создают вирусный видео-контент для TikTok/Instagram Reels.

### ⚠️ ВАЖНО: Что агент НЕ делает
- ❌ Не генерирует видео напрямую
- ❌ Не требует API ключа Sora
- ❌ Не создает файлы .mp4

### ✅ Что агент ДЕЛАЕТ
- ✅ Создает **copy-paste промпты** для Sora 2
- ✅ Генерирует **текстовые хуки** для социальных сетей
- ✅ Добавляет **естественные реплики** персонажа
- ✅ Включает **технические спецификации** (камера, свет, движение)
- ✅ Предсказывает **метрики вирусности** (hook rate, completion rate)

---

## 🚀 Как использовать

### Способ 1: Slash команда (если настроена)

```bash
/sora2 "Ваша тема"
```

**Примеры:**
```bash
/sora2 "Первый раз использую Claude Code"
/sora2 "AI пишет код лучше меня"
/sora2 "Вайбкодинг и агенты"
/sora2 "Когда загрузка зависла на 99%"
```

### Способ 2: Прямой вызов агента через Task tool

```javascript
Task(
  description: "Generate Sora 2 content",
  prompt: "Создай современный вирусный контент для темы 'Первый раз с AI' в unified copy-paste формате для Sora 2.",
  subagent_type: "sora2-visual-content-creator"
)
```

---

## 📋 Что получите в результате

### Структура ответа агента:

```markdown
## 🎭 "[Название концепта]"

🎬 READY-TO-COPY SORA 2 PROMPT:

Close-up, 50mm f/1.8. Developer confidently approaches laptop.
TEXT OVERLAY (0-2s): "НАПИСАЛ ОДНУ БУКВУ... ИИ СДЕЛАЛ ВСЁ 🤯"
Modern office setup, warm lighting with screen glow.
[0-2s] Types single "H", casual confidence, relaxed posture
CREATOR SPEECH: "Хм, попробуем букву H..."
[2-4s] Screen explodes with code, person freezes in shock
CREATOR SPEECH: "СТОП! ЧТО ТЫ ДЕЛАЕШЬ?!"
[4-6s] Slow zoom out showing multiple screens filling up
[6-8s] Person notices AI ordered pizza, booked vacation
CREATOR SPEECH: "Он даже пиццу заказал..."
[8-10s] "I can't even..." gesture, defeated laugh
[10-12s] Stares at screen in disbelief
[12-15s] Points at camera with bewildered expression
TEXT OVERLAY (13-15s): "НАПИШИ VIBECODE - ПОЛУЧИ БИБЛИЮ ВАЙБКОДЕРА!"
Tech thriller to comedy shift, dramatic lighting changes.
Photorealistic, vertical 9:16, 15s.

📊 Engagement Prediction:
- Hook Rate: 90% (relatable AI fear)
- Completion Rate: 85% (comedy payoff)
- Share Rate: 25% (everyone can relate)

🎯 Viral Score: 9/10 - Perfect balance of tech anxiety and humor
```

---

## 🎬 Что делать с результатом

### Шаг 1: Скопировать промпт
Копируете весь блок между **"🎬 READY-TO-COPY SORA 2 PROMPT:"** до **"Photorealistic, vertical 9:16, 15s."**

### Шаг 2: Вставить в Sora 2
- Открываете **OpenAI Sora 2** (https://sora.com или через API)
- Вставляете промпт
- Нажимаете "Generate"

### Шаг 3: Получить видео
Sora 2 генерирует 15-секундное вертикальное видео (9:16) по вашему промпту.

### Шаг 4: Пост-продакшн (опционально)
- Добавить текстовые overlay (если Sora не добавила автоматически)
- Записать creator speech (или использовать AI TTS)
- Добавить музыку и sound effects
- Экспортировать для TikTok/Instagram Reels

---

## 🎯 Формат промптов Sora 2

### Анатомия промпта:

```
[Shot type], [lens specs]. [Character] in [setting] with [lighting].
TEXT OVERLAY (0-2s): "[Hook text]"
[0-Xs] [Action description]
CREATOR SPEECH: "[Natural dialogue]"
[X-Ys] [Development/build]
CREATOR SPEECH: "[Natural dialogue]"
[Y-Zs] [Climax/punchline]
TEXT OVERLAY (13-15s): "[CTA]"
[Style reference]. Photorealistic, [aspect ratio], [duration]s.
```

### Ключевые элементы:

#### 1. **Shot type & lens**
```
Close-up, 50mm f/1.8
Medium shot, 35mm f/2.8
Wide shot, 24mm f/4
```

#### 2. **TEXT OVERLAY**
```
TEXT OVERLAY (0-2s): "ХУК С ЭМОДЗИ 🤯"
TEXT OVERLAY (13-15s): "CTA ДЛЯ ДЕЙСТВИЯ! 👇"
```

#### 3. **Timeline [0-Xs]**
```
[0-2s] Setup action
[2-4s] Build tension
[4-6s] Peak moment
[6-8s] Punchline
```

#### 4. **CREATOR SPEECH**
```
CREATOR SPEECH: "Естественная реплика..."
НЕ: "Закадровый голос описывает..."
```

#### 5. **Technical specs**
```
Photorealistic, vertical 9:16, 15s.
```

---

## 🎭 Категории контента

Агент специализируется на 4 типах визуальной комедии:

### 1. 🤡 Physical Comedy
```bash
/sora2 "Падение со стула когда код заработал"
```
- Неожиданные падения
- Объекты появляются из ниоткуда
- Гравитационные моменты с AI
- Slapstick debugging сценарии

### 2. 🎭 Transformation Stories
```bash
/sora2 "Уставший кодер превращается в AI менеджера"
```
- Tired manual coder → Relaxed AI manager
- Chaotic desk → Organized workspace
- Single person → AI agent swarm
- Old computer → Quantum setup

### 3. 🎪 Reaction Comedy
```bash
/sora2 "Первый раз увидел как AI пишет код"
```
- First time seeing AI code
- "Works on my machine" face
- Loading bar frustration
- Bug discovery drama

### 4. 🎬 Cinematic Parodies
```bash
/sora2 "Матрица но с AI промптами"
```
- Matrix bullet-time с промптами
- Mission Impossible debugging
- Avengers assembling AI agents
- Star Wars force с автоматизацией

---

## 📊 Метрики успеха

### Что включает агент:

#### 📈 Engagement Prediction
```
- Hook Rate: 90% (why people stop scrolling)
- Completion Rate: 85% (why they watch till end)
- Share Rate: 25% (why they share)
```

#### 🎯 Viral Score (1-10)
```
9/10 - Perfect balance of tech anxiety and humor

Reasoning:
- Highly relatable AI experience
- Unexpected escalation
- Rewatchable details in background
- Universal programmer pain point
```

### Целевые показатели:
- **Hook Rate:** 80%+ (first 2 seconds)
- **Completion Rate:** 70%+ (full watch)
- **Share Rate:** 15%+ (relatable comedy)
- **Comment Rate:** 8%+ (people share experiences)

---

## 💡 Best Practices

### Хорошие темы:
✅ "Первый раз использую [AI инструмент]"
✅ "Когда [relatable developer problem]"
✅ "[Before] vs [After] AI"
✅ "Пытаюсь объяснить [tech concept] другу"

### Плохие темы:
❌ "Сложный технический туториал"
❌ "Длинное объяснение кода"
❌ "Серьезный образовательный контент"
❌ "Чисто текстовый контент"

### Почему?
Агент создает **визуальную комедию**, которая работает БЕЗ звука и технических знаний.

---

## 🎨 Принципы создания контента

### ✅ DO CREATE:
- **Text hooks** (0-2s overlay that stops scrolling)
- **Creator speech** (2-3 natural phrases, NOT narration)
- **Physical comedy** (reactions, transformations, visual gags)
- **Emotional journeys** (confidence → shock → defeat → hope)
- **Value-driven CTAs** (friendly, not aggressive)
- **15-second format** (perfect for TikTok/Reels)

### ❌ AVOID:
- Voiceover narration (use natural speech)
- Pure educational content (add comedy)
- Overly long text overlays (keep punchy)
- Aggressive sales CTAs (be friendly)
- Silent content (people expect talking)

---

## 🔧 Технические характеристики

### Sora 2 Specs:
- **Format:** 720x1280 (vertical for social media)
- **Duration:** 15 seconds (6-8s optimal for viral content)
- **Aspect Ratio:** 9:16 (vertical)
- **Quality:** Photorealistic
- **Style:** Modern TikTok/Reels aesthetic

### Camera Specs:
- **Standard:** 35mm f/2.8
- **Dramatic:** 50mm f/1.8
- **Wide comedy:** 24mm f/4

### Lighting:
- Specific color temperatures
- Practical sources (desk lamp, monitor glow)
- RGB keyboard lighting (tech aesthetic)

---

## 📝 Примеры промптов для разных ниш

### Для программистов:
```bash
/sora2 "Когда код заработал с первого раза"
/sora2 "Пытаюсь найти баг в 3 часа ночи"
/sora2 "Stack Overflow не знает ответа"
```

### Для AI энтузиастов:
```bash
/sora2 "Первый раз попросил ChatGPT написать код"
/sora2 "Claude Code сделал всё за меня"
/sora2 "Когда prompt engineering важнее программирования"
```

### Для контент-креаторов:
```bash
/sora2 "Когда AI сгенерил лучший контент чем я"
/sora2 "Пытаюсь объяснить Sora маме"
/sora2 "Мой рабочий день с AI агентами"
```

---

## 🎯 Workflow: От идеи до видео

### 1. Генерация промпта (Agent)
```bash
/sora2 "Ваша идея"
→ Получаете готовый промпт
```

### 2. Генерация видео (Sora 2)
```
Копируете промпт → Вставляете в Sora 2 → Generate
→ Получаете 15-сек видео
```

### 3. Пост-обработка (Optional)
```
- Добавить текстовые overlay
- Записать creator speech
- Добавить музыку/SFX
- Экспорт для TikTok/Reels
```

### 4. Публикация
```
- TikTok: 19:00-21:00 (будни)
- Instagram Reels: 18:00-20:00 (будни)
- YouTube Shorts: 17:00-19:00 (будни)
```

---

## 🚨 Частые вопросы

### Q: Нужен ли мне доступ к Sora 2?
**A:** Да, агент только создает промпты. Для генерации видео нужен Sora 2.

### Q: Можно ли редактировать промпт?
**A:** Да! Промпты полностью редактируемые. Меняйте под свои нужды.

### Q: Сколько стоит генерация видео?
**A:** Зависит от Sora 2 pricing. Агент создает промпты бесплатно.

### Q: Можно ли использовать для других AI генераторов?
**A:** Промпты оптимизированы для Sora 2, но можно адаптировать для других.

### Q: Как часто можно генерировать промпты?
**A:** Без ограничений! Каждый запрос генерирует уникальный контент.

### Q: Можно ли генерировать на других языках?
**A:** Да, но агент оптимизирован для русскоязычного контента.

---

## 📚 Дополнительные ресурсы

### Документация:
- **[sora-2-timeline-prompting-format.md]** - Официальный формат Sora 2
- **[content-plan-sora2-visual-only.md]** - Примеры визуального контента
- **[sora2-content-demo.md]** - Демо работы агента

### Примеры:
- **"AI Mind Reader"** - Классическая реакция на AI
- **"Before vs After AI"** - Split screen трансформация
- **"Loading Hell"** - Фрустрация с загрузкой

### Источник агента:
- **bible_vibecoder** - Production проект
- **Location:** `.claude/agents/sora2-visual-content-creator.md`
- **Command:** `.claude/commands/sora2/index.js`

---

## 🎬 Пример полного воркфлоу

### Задача: Создать вирусное видео про Claude Code

#### Шаг 1: Генерация промпта
```bash
/sora2 "Первый раз использую Claude Code"
```

#### Шаг 2: Результат агента
```markdown
🎬 READY-TO-COPY SORA 2 PROMPT:

Close-up, 50mm f/1.8. Developer nervously opens Claude Code.
TEXT OVERLAY (0-2s): "ДАЛИ ДОСТУП К CLAUDE CODE... 😰"
Modern home office, soft natural lighting from window.
[0-2s] Opens application, hesitant mouse movement
CREATOR SPEECH: "Ну давай попробуем..."
[2-4s] Types simple request, waits nervously
[4-6s] Code starts appearing automatically
CREATOR SPEECH: "Эм... это нормально?"
[6-8s] Multiple files created simultaneously
[8-10s] Tests pass automatically, jaw drops
CREATOR SPEECH: "СТОП, ОНО ТЕСТЫ НАПИСАЛО?!"
[10-12s] Realizes project is complete
[12-15s] Points at screen in disbelief
TEXT OVERLAY (13-15s): "НАПИШИ VIBECODE - ПОЛУЧИ БИБЛИЮ! 👇"
Tech documentary to comedy revelation.
Photorealistic, vertical 9:16, 15s.

📊 Engagement Prediction:
- Hook Rate: 88% (Claude Code curiosity)
- Completion Rate: 82% (AI magic reveal)
- Share Rate: 22% (developer FOMO)

🎯 Viral Score: 8.5/10 - Strong product showcase + comedy
```

#### Шаг 3: Использование
1. Копируете промпт
2. Открываете Sora 2
3. Вставляете и генерируете
4. Получаете видео за 1-2 минуты

#### Шаг 4: Публикация
- TikTok в 19:00
- Instagram Reels в 20:00
- Хештеги: #ClaudeCode #AI #Coding #TechHumor

---

## 🎯 Ключевые выводы

1. **Агент генерирует промпты**, не видео
2. **Результат copy-paste готов** для Sora 2
3. **Оптимизирован для TikTok/Reels** (9:16, 15s)
4. **Фокус на визуальной комедии** без технических знаний
5. **Включает метрики вирусности** для оценки потенциала
6. **Уникальный контент** при каждом запуске

---

**🚀 Готовы создавать вирусный контент?**

Просто запустите:
```bash
/sora2 "Ваша идея"
```

И получите профессиональный промпт для Sora 2!

---

**Обновлено:** 2025-10-16
**Источник:** bible_vibecoder production agent
**Статус:** ✅ Production-ready
