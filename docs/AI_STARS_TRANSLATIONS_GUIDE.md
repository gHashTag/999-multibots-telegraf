# Переводы для AI_STARS_bot

## 📝 Обзор

Этот документ описывает систему переводов для бота `AI_STARS_bot`. Бот поддерживает русский и английский языки с автоматическим определением языка пользователя.

## 🚀 Настройка

### 1. Переменные окружения

Добавьте в ваш `.env` файл:

```env
BOT_TOKEN_9=YOUR_AI_STARS_BOT_TOKEN_HERE
```

**⚠️ Важно:** Указанный токен не является корректным токеном Telegram-бота. Замените его на реальный токен, полученный от @BotFather.

### 2. Добавление переводов в базу данных

Выполните SQL скрипты в следующем порядке:

```bash
# Основные переводы
psql -d your_database -f scripts/add_ai_stars_translations.sql

# Расширенные переводы
psql -d your_database -f scripts/add_ai_stars_extended_translations.sql
```

## 🌐 Поддерживаемые языки

| Язык | Код | Статус |
|------|-----|--------|
| Русский | `ru` | ✅ Полная поддержка |
| Английский | `en` | ✅ Полная поддержка |

## 🔑 Ключи переводов

### Основные ключи

| Ключ | Описание | Категория |
|------|----------|-----------|
| `start` | Приветственное сообщение | `specific` |
| `menu` | Главное меню | `specific` |
| `help` | Справка | `common` |
| `error` | Сообщение об ошибке | `system` |
| `success` | Сообщение об успехе | `system` |
| `cancel` | Отмена операции | `common` |

### Специфичные ключи

| Ключ | Описание | Категория |
|------|----------|-----------|
| `image_generation_prompt` | Запрос описания для генерации изображения | `specific` |
| `text_creation_menu` | Меню создания текста | `specific` |
| `translation_menu` | Меню переводов | `specific` |
| `settings_menu` | Меню настроек | `specific` |
| `subscription_menu` | Меню подписок | `specific` |

### Системные ключи

| Ключ | Описание | Категория |
|------|----------|-----------|
| `processing` | Сообщение о обработке | `system` |
| `generating_image` | Процесс генерации изображения | `specific` |
| `rate_limit` | Превышение лимита запросов | `system` |
| `subscription_required` | Требуется подписка | `system` |
| `insufficient_balance` | Недостаточно средств | `system` |

## 💡 Использование в коде

### Получение перевода

```typescript
import { getTranslation } from '@/core/supabase'

// В обработчике команды или сцены
const { translation, url, buttons } = await getTranslation({
  key: 'start',
  ctx,
  bot_name: 'AI_STARS_bot'
})

await ctx.reply(translation, {
  reply_markup: {
    inline_keyboard: buttons.map(btn => [{
      text: btn.text,
      callback_data: btn.callback_data
    }])
  }
})
```

### Определение языка пользователя

```typescript
import { isRussian } from '@/helpers/language'

const isRu = isRussian(ctx) // true для русского языка
const langCode = ctx.from?.language_code || 'ru'
```

### Пример использования в сцене

```typescript
// В файле сцены
export const startScene = new Scenes.BaseScene<MyContext>('start')

startScene.enter(async (ctx) => {
  const { translation, url } = await getTranslation({
    key: 'start',
    ctx,
    bot_name: 'AI_STARS_bot'
  })
  
  const photoOptions = url ? { photo: url } : {}
  
  if (url) {
    await ctx.replyWithPhoto(url, { caption: translation })
  } else {
    await ctx.reply(translation)
  }
})
```

## 🎨 Кнопки и интерактивность

### Структура кнопок

```json
{
  "row": 1,
  "text": "🎨 Генерация изображений",
  "callback_data": "generate_image",
  "description": "Создание изображений по текстовому описанию",
  "stars_price": 100
}
```

### Параметры кнопок

| Параметр | Описание | Обязательный |
|----------|----------|---------------|
| `row` | Номер ряда | ✅ |
| `text` | Текст кнопки | ✅ |
| `callback_data` | Данные обратного вызова | ✅ |
| `description` | Описание функции | ❌ |
| `stars_price` | Цена в звездах | ❌ |
| `en_price` | Цена в долларах | ❌ |
| `ru_price` | Цена в рублях | ❌ |

## 🔧 Обслуживание переводов

### Добавление нового перевода

```sql
INSERT INTO translations (key, language_code, bot_name, translation, category) 
VALUES 
('new_key', 'ru', 'AI_STARS_bot', 'Новый перевод', 'specific'),
('new_key', 'en', 'AI_STARS_bot', 'New translation', 'specific')
ON CONFLICT (key, language_code, bot_name) 
DO UPDATE SET 
    translation = EXCLUDED.translation,
    updated_at = NOW();
```

### Обновление существующего перевода

```sql
UPDATE translations 
SET 
    translation = 'Обновленный текст',
    updated_at = NOW()
WHERE 
    key = 'existing_key' 
    AND language_code = 'ru' 
    AND bot_name = 'AI_STARS_bot';
```

### Проверка переводов

```sql
-- Все переводы для бота
SELECT key, language_code, LEFT(translation, 50) as preview
FROM translations 
WHERE bot_name = 'AI_STARS_bot' 
ORDER BY key, language_code;

-- Недостающие переводы
SELECT DISTINCT t1.key
FROM translations t1
WHERE t1.bot_name = 'AI_STARS_bot'
  AND NOT EXISTS (
    SELECT 1 FROM translations t2 
    WHERE t2.key = t1.key 
      AND t2.bot_name = 'AI_STARS_bot'
      AND t2.language_code != t1.language_code
  );
```

## 🐛 Отладка

### Логирование переводов

Система автоматически логирует:
- Попытки получения переводов
- Ошибки парсинга кнопок
- Fallback на дефолтного бота
- Использование дефолтных кнопок

### Проверка в коде

```typescript
console.log('CASE: getTranslation:', key)
// Проверьте логи на наличие этого сообщения
```

## 📊 Статистика использования

### Топ используемых ключей

```sql
-- Требует настройки логирования использования
SELECT key, COUNT(*) as usage_count
FROM translation_usage_log 
WHERE bot_name = 'AI_STARS_bot'
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY key
ORDER BY usage_count DESC;
```

## 🚀 Следующие шаги

1. **Тестирование**: Проверьте все переводы с разными языковыми настройками
2. **Локализация изображений**: Добавьте локализованные изображения для разных языков
3. **A/B тестирование**: Тестируйте разные варианты текстов
4. **Аналитика**: Настройте отслеживание использования переводов
5. **Автоматизация**: Создайте скрипты для проверки полноты переводов

## 📞 Поддержка

При возникновении проблем с переводами:
1. Проверьте логи бота
2. Убедитесь, что переводы добавлены в базу данных
3. Проверьте корректность токена бота
4. Обратитесь к разработчикам через GitHub Issues 