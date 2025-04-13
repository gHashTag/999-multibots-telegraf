# 🖼️ Тесты NeuroPhoto GQ Portrait

Модуль для тестирования генерации портретов в стиле GQ с использованием NeuroPhoto. Позволяет создавать высококачественные профессиональные портреты для различных бизнес-кейсов.

## 📚 Доступные тесты

### 🧪 Базовый GQ-портрет

Тест для создания профессионального портрета в классическом стиле GQ magazine.

```bash
npm run test:neurophoto:gq
```

### 💼 Бизнес-портрет в стиле GQ

Тест для создания портрета бизнесмена в формальном костюме с деловым стилем.

```bash
npm run test:neurophoto:gq-business
```

### 👗 Модный портрет в стиле GQ/Vogue

Тест для создания элегантного модного портрета с эстетикой fashion-фотографии.

```bash
npm run test:neurophoto:gq-fashion
```

### 🔄 Пакетный тест GQ-портретов

Тест для последовательной генерации нескольких вариаций портретов в стиле GQ.

```bash
npm run test:neurophoto:gq-batch
```

### 🚀 Запуск всех тестов GQ-портретов

Тест для последовательного запуска всех типов GQ-портретов.

```bash
npm run test:neurophoto:gq-all
```

## 🛠️ Параметры тестов

Все тесты поддерживают следующие параметры:

- `TEST_MODE` - режим тестирования (true - имитация API, false - реальный вызов API). По умолчанию: `true`
- `TEST_TELEGRAM_ID` - Telegram ID пользователя для тестирования. По умолчанию: `144022504`
- `TEST_USERNAME` - имя пользователя для тестирования. По умолчанию: `test_user`
- `TELEGRAM_GROUP_ID` - ID группы для отправки результатов. По умолчанию: `-1001234567890`

## 🧬 Структура промптов

Все промпты для GQ-портретов следуют определённой структуре:

```
NEUROCODER профессиональная портретная фотография [субъект], [контекст], [освещение], [детализация], [ориентация], [разрешение], [детали], [стиль], [обработка], [особенности]
```

### 🎨 Ключевые компоненты промптов:

- **Trigger Word** - обязателен для правильной работы модели: `NEUROCODER`
- **Субъект** - описание человека на портрете (пол, внешность, стиль и т.д.)
- **Контекст** - стиль фотографии (GQ magazine, fashion editorial и т.д.)
- **Освещение** - описание освещения (studio lighting, dramatic lighting и т.д.)
- **Детализация** - степень детализации (sharp facial features, perfect details и т.д.)
- **Ориентация** - портретная, пейзажная и т.д.
- **Разрешение** - качество изображения (8k, high resolution и т.д.)
- **Детали** - специфические детали, которые должны быть на портрете
- **Стиль** - стилистическое направление (professional photography, fashion и т.д.)
- **Обработка** - уровень обработки (professional retouching, cinematic и т.д.)
- **Особенности** - специфические особенности, которые должны быть видны на портрете

## 📝 Примеры промптов

### Бизнес-портрет:
```
NEUROCODER professional portrait photograph of a confident businessman in luxury tailored suit, high fashion GQ magazine style editorial, perfect studio lighting, sharp facial features, strong jaw, executive look, portrait orientation, 8k, high resolution, perfect details, elegant masculine fashion photography, professional retouching, cinematic dramatic lighting, corporate excellence, professional DSLR, luxury watch detail
```

### Модный портрет:
```
NEUROCODER professional portrait photograph of an elegant fashion model woman, high fashion Vogue/GQ magazine editorial style, perfect professional studio lighting, sharp features, flawless skin, fashion week aesthetic, portrait orientation with dramatic composition, 8k, high resolution, perfect details, haute couture, professional retouching, cinematic lighting with artistic shadows, luxury fashion photography, professional styling, designer clothing, minimalist background
```

## 📊 Результаты тестов

Результаты генерации сохраняются в директории:
```
/src/uploads/{telegram_id}/neuro-photo/
```

В тестовом режиме реальные изображения не генерируются, но директория для результатов создаётся. 