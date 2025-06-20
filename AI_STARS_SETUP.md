# Быстрая настройка AI_STARS_bot

## ⚡ Краткие инструкции

### 1. Настройка токена
Добавьте в `.env`:
```env
BOT_TOKEN_9=ВАШ_РЕАЛЬНЫЙ_ТОКЕН_ОТ_BOTFATHER
```

### 2. Добавление переводов
```bash
# Основные переводы
psql -d your_database -f scripts/add_ai_stars_translations.sql

# Дополнительные переводы
psql -d your_database -f scripts/add_ai_stars_extended_translations.sql
```

### 3. Проверка переводов
```bash
# Проверить полноту переводов
bun run check:translations

# Сгенерировать SQL для недостающих переводов
bun run generate:translations-sql
```

### 4. Что было добавлено

#### Файлы:
- `src/core/bot/index.ts` - добавлен бот AI_STARS_bot
- `src/core/getBotTokenByName.ts` - добавлен маппинг токена
- `src/interfaces/telegram-bot.interface.ts` - добавлен тип бота
- `scripts/add_ai_stars_translations.sql` - основные переводы
- `scripts/add_ai_stars_extended_translations.sql` - расширенные переводы
- `scripts/check_ai_stars_translations.ts` - проверка переводов
- `docs/AI_STARS_TRANSLATIONS_GUIDE.md` - полная документация

#### Переводы:
- ✅ Русский язык (ru)
- ✅ Английский язык (en)
- ✅ 40+ ключей переводов
- ✅ Кнопки и интерактивность
- ✅ Системные сообщения

### 5. Использование в коде
```typescript
import { getTranslation } from '@/core/supabase'

const { translation, url, buttons } = await getTranslation({
  key: 'start',
  ctx,
  bot_name: 'AI_STARS_bot'
})
```

## 📋 Основные ключи переводов

| Ключ | Русский | Английский |
|------|---------|------------|
| `start` | Приветствие | Welcome message |
| `menu` | Главное меню | Main menu |
| `help` | Справка | Help |
| `balance_info` | Информация о балансе | Balance info |
| `image_generation_prompt` | Генерация изображений | Image generation |
| `text_creation_menu` | Создание текста | Text creation |
| `translation_menu` | Переводы | Translations |
| `settings_menu` | Настройки | Settings |

## 🔧 Проверка работы

1. Запустите бота: `bun run dev`
2. Найдите бота в Telegram: `@AI_STARS_bot`
3. Отправьте `/start`
4. Проверьте переключение языков

## 📞 Помощь

- Документация: `docs/AI_STARS_TRANSLATIONS_GUIDE.md`
- Проверка переводов: `bun run check:translations`
- Проблемы? Создайте Issue в GitHub 