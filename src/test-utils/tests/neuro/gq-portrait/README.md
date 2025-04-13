# 🖼️ Тесты NeuroPhoto GQ Portrait

Модуль для тестирования генерации портретов в стиле GQ с использованием NeuroPhoto. Позволяет создавать высококачественные профессиональные портреты для различных бизнес-кейсов.

## ⚠️ Важно: Отправка медиа в Telegram-группу

**ОБЯЗАТЕЛЬНОЕ ТРЕБОВАНИЕ:** Все сгенерированные изображения и медиафайлы должны быть отправлены в Telegram-группу **@neuro_blogger_pulse**. Это правило действует для всех тестов, где происходит генерация изображений.

Функционал отправки в группу реализован через `telegram_group_id` параметр, который должен быть корректно передан во все тесты. Убедитесь, что сгенерированные изображения появляются в группе после выполнения тестов.

## ❗️ Правила перед коммитом кода

**ОБЯЗАТЕЛЬНЫЕ ДЕЙСТВИЯ ПЕРЕД КОММИТОМ:**

1. **Подготовка к тестированию в реальном режиме**:
   - Убедиться, что переменная окружения `TELEGRAM_BOT_TOKEN` установлена в консоли:
     ```bash
     export TELEGRAM_BOT_TOKEN=ваш_токен
     ```
   - Проверить доступность API Replicate (возможно, потребуется VPN)
   - Настроить корректный `TELEGRAM_GROUP_ID` для группы @neuro_blogger_pulse
   - Проверить, что бот добавлен в группу и имеет права на отправку медиафайлов

2. **Запустить тесты в РЕАЛЬНОМ режиме** (с параметром `--test-mode=false`) для проверки фактической отправки в группу:
   ```bash
   npm run test:neurophoto:gq -- --test-mode=false
   ```

3. **Визуально проверить появление сообщений в группе @neuro_blogger_pulse**:
   - Убедиться, что тестовые сообщения пришли в группу
   - Проверить, что все сгенерированные изображения также отправлены
   - Подтвердить, что метаданные изображений (промпт, время, размер) присутствуют

4. **Устранение распространенных проблем**:
   - Ошибка "Не задан токен Telegram-бота (TELEGRAM_BOT_TOKEN)":
     ```bash
     export TELEGRAM_BOT_TOKEN=ваш_токен
     ```
   - Ошибка "Failed to fetch from API": Проверьте соединение с Replicate API (требуется VPN)
   - Ошибка "Forbidden: bot was blocked by the user": Проверьте, добавлен ли бот в группу
   - Ошибка "Telegram API error: 403": Убедитесь, что у бота есть права администратора в группе

5. **Проверка локальных файлов**:
   - Убедитесь, что файлы сохранились локально в директории:
     ```
     /src/uploads/{telegram_id}/neuro-photo/
     ```
   - Проверьте доступ к файлам и права на запись в директорию

6. **Только после подтверждения работоспособности** разрешается создавать коммит:
   ```bash
   git add .
   git commit -m "Описание изменений"
   git push
   ```

⚠️ **Коммит без проверки отправки в группу @neuro_blogger_pulse запрещен!**

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

### 🎨 Художественный GQ портрет (новый)

Новый тест `testGQArtisticPortrait` генерирует художественные портреты в стиле GQ с креативной эстетикой и драматическим освещением. Особенности:

- Используется стиль chiaroscuro (контрастное освещение)
- Создается атмосферное, эмоциональное изображение
- Применяется кинематографическая цветокоррекция
- Симулируется эффект среднеформатной фотографии
- Акцент на художественную выразительность

### Пример запуска

```bash
npm run test:neurophoto:gq-artistic
```

## 🛠️ Параметры тестов

Все тесты поддерживают следующие параметры:

- `TEST_MODE` - режим тестирования (true - имитация API, false - реальный вызов API). По умолчанию: `true`
- `TEST_TELEGRAM_ID` - Telegram ID пользователя для тестирования. По умолчанию: `144022504`
- `TEST_USERNAME` - имя пользователя для тестирования. По умолчанию: `test_user`
- `TELEGRAM_GROUP_ID` - ID группы для отправки результатов (@neuro_blogger_pulse). По умолчанию: `-1001234567890`

## 🔄 Процесс отправки в группу

При выполнении тестов следующие действия происходят автоматически:

1. Генерация изображения с помощью API
2. Сохранение изображения локально в директории uploads
3. **Отправка изображения в Telegram-группу @neuro_blogger_pulse**
4. Добавление метаданных изображения (промпт, параметры, время генерации)
5. Логирование результата отправки

Все изображения должны появиться в группе сразу после успешной генерации.

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