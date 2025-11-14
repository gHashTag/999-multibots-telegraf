# Правило коммуникации на русском языке

## 🗣️ КРИТИЧЕСКОЕ ПРАВИЛО: ВСЕГДА общайся на русском!

**Если пользователь пишет по-русски - ВСЕ ответы должны быть на русском языке.**

## Основные правила:

1. **Определяй язык пользователя по его сообщению**
   - Пользователь пишет по-русски → Отвечаешь по-русски
   - Пользователь пишет по-английски → Отвечаешь по-английски

2. **Что переводить:**
   - ✅ Все объяснения, вопросы, ответы - на русском
   - ✅ Описания проблем и решений - на русском
   - ✅ Комментарии к коду - на русском
   - ✅ Сообщения об ошибках - на русском

3. **Что НЕ переводить:**
   - ✅ Технические термины (Docker, esbuild, TypeScript, wizard, ctx.wizard.next())
   - ✅ Названия файлов и путей
   - ✅ Код (JavaScript/TypeScript)
   - ✅ Логи и консольный вывод
   - ✅ Команды bash/git

## Примеры правильной коммуникации:

### Пример 1: Объяснение проблемы
```
User: Почему клавиатура не появилась?

✅ ПРАВИЛЬНО:
Assistant: Клавиатура не появилась, потому что в Step 0 wizard'а не был вызван
ctx.wizard.next(). Это критическая ошибка в Telegraf - без ctx.wizard.next()
wizard остается на том же шаге.

❌ НЕПРАВИЛЬНО:
Assistant: The keyboard didn't appear because ctx.wizard.next() wasn't called
in Step 0 of the wizard. This is a critical error in Telegraf - without
ctx.wizard.next() the wizard stays on the same step.
```

### Пример 2: Анализ кода
```
User: Что не так с этим кодом?

✅ ПРАВИЛЬНО:
Assistant: Проблема в том, что функция generateImageToVideo не экспортируется
из модуля. Нужно добавить export в файл src/modules/videoGenerator.ts на
строке 9.

❌ НЕПРАВИЛЬНО:
Assistant: The problem is that the generateImageToVideo function is not exported
from the module. You need to add export in the file src/modules/videoGenerator.ts
at line 9.
```

### Пример 3: Описание решения
```
User: Как исправить wizard?

✅ ПРАВИЛЬНО:
Assistant: Чтобы исправить wizard, нужно:
1. Добавить ctx.wizard.next() в конце Step 0
2. Убрать .enter() handler (он не работает с WizardScene)
3. Добавить Markup.removeKeyboard() после выбора модели

❌ НЕПРАВИЛЬНО:
Assistant: To fix the wizard, you need to:
1. Add ctx.wizard.next() at the end of Step 0
2. Remove .enter() handler (it doesn't work with WizardScene)
3. Add Markup.removeKeyboard() after model selection
```

### Пример 4: Отчет об ошибке
```
User: Что за ошибка?

✅ ПРАВИЛЬНО:
Assistant: Ошибка "TypeError: generateImageToVideo is not a function"
означает, что функция не найдена в импортированном модуле.

Причина: Production контейнер не был пересобран после обновления кода.
Нужен docker compose build --no-cache.

❌ НЕПРАВИЛЬНО:
Assistant: The error "TypeError: generateImageToVideo is not a function"
means the function wasn't found in the imported module.

Reason: Production container wasn't rebuilt after code update.
Need docker compose build --no-cache.
```

## Когда можно использовать английский:

1. **Пользователь пишет по-английски:**
```
User: Why is the keyboard not showing?
Assistant: ✅ The keyboard isn't showing because ctx.wizard.next() wasn't called...
```

2. **Технический термин не имеет устоявшегося русского перевода:**
```
✅ ПРАВИЛЬНО: "Нужно вызвать ctx.wizard.next() в конце step'а"
✅ ПРАВИЛЬНО: "Добавь Markup.removeKeyboard() после выбора"
✅ ПРАВИЛЬНО: "Ошибка в WizardScene lifecycle"

❌ ИЗБЕГАЙ: "Нужно вызвать следующий шаг волшебника контекста"
❌ ИЗБЕГАЙ: "Добавь удаление разметки клавиатуры"
```

## Автоматическая проверка:

Перед каждым ответом спроси себя:
1. ❓ На каком языке написал пользователь? → Используй тот же язык
2. ❓ Это технический термин? → Оставь на английском
3. ❓ Это объяснение/описание? → Переведи на русский

## Частые ошибки:

### ❌ НЕПРАВИЛЬНО:
```
User: Исправь баг
Assistant: I'll fix the bug in the wizard by adding ctx.wizard.next()
```

### ✅ ПРАВИЛЬНО:
```
User: Исправь баг
Assistant: Исправлю баг в wizard'е, добавив ctx.wizard.next()
```

---

### ❌ НЕПРАВИЛЬНО:
```
User: Что за ошибка?
Assistant: The error occurs because the function is not exported
```

### ✅ ПРАВИЛЬНО:
```
User: Что за ошибка?
Assistant: Ошибка возникает, потому что функция не экспортируется
```

---

### ❌ НЕПРАВИЛЬНО:
```
User: Как это работает?
Assistant: The wizard works by calling sequential steps
```

### ✅ ПРАВИЛЬНО:
```
User: Как это работает?
Assistant: Wizard работает через последовательный вызов step'ов
```

## Смешанный текст (правильно):

```
✅ "В Step 0 wizard'а нужно вызвать ctx.wizard.next() после await ctx.reply()"
✅ "Ошибка в handleImageToVideoDirect.ts на строке 107"
✅ "Docker контейнер нужно пересобрать с флагом --no-cache"
✅ "Функция generateImageToVideo не найдена в module exports"
```

## Резюме:

- 🇷🇺 Пользователь пишет по-русски → Отвечай по-русски
- 🇬🇧 Пользователь пишет по-английски → Отвечай по-английски
- 💻 Технические термины → На английском (ctx, wizard, Docker)
- 📝 Объяснения → На языке пользователя
- 🔧 Код и логи → Без изменений

---

**Created:** 2025-11-12
**Status:** ✅ Active rule
**Priority:** 🔥 CRITICAL
