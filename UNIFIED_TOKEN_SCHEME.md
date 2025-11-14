# ✨ Унифицированная схема токенов "Три головы дракона"

## 🎯 Главная идея: ПРОСТОТА И ЕДИНООБРАЗИЕ

**До**: Путаница с именами
- Dev: `BOT_TOKEN_TEST_1`, `BOT_TOKEN_TEST_2`
- Prod: `BOT_TOKEN_1`-`BOT_TOKEN_10`

**После**: Везде одинаково
- Dev: `BOT_TOKEN_1`-`BOT_TOKEN_2` (2 бота)
- Staging: `BOT_TOKEN_1`-`BOT_TOKEN_10` (10 ботов)
- Prod: `BOT_TOKEN_1`-`BOT_TOKEN_10` (10 ботов)

## 🔄 Что изменилось

### 1. В Infisical (нужно переименовать вручную)

**Окружение `dev`:**
```diff
- BOT_TOKEN_TEST_1  → @ai_koshey_bot
- BOT_TOKEN_TEST_2  → @helper_999_bot
+ BOT_TOKEN_1       → @ai_koshey_bot
+ BOT_TOKEN_2       → @helper_999_bot
```

**Инструкция**: см. `RENAME_TOKENS_INSTRUCTIONS.md`

### 2. В коде (уже обновлено ✅)

**src/index.ts** - унифицированная загрузка токенов:
```typescript
if (env === 'dev') {
  // 2 бота для разработки
  for (let i = 1; i <= 2; i++) {
    process.env[`BOT_TOKEN_${i}`] = getSecret(`BOT_TOKEN_${i}`)
  }
} else if (env === 'staging' || env === 'prod') {
  // 10 ботов для staging/prod
  for (let i = 1; i <= 10; i++) {
    process.env[`BOT_TOKEN_${i}`] = getSecret(`BOT_TOKEN_${i}`)
  }
}
```

**src/core/bot/index.ts** - убрана специфичная логика:
```typescript
// ✅ Теперь везде BOT_TOKEN_1-N
export const DEFAULT_BOT_TOKEN = process.env.BOT_TOKEN_1
export const BOT_TOKENS = BOT_TOKENS_ALL
```

## 📊 Маппинг ботов на токены

### Development (dev)
| Токен | Бот |
|-------|-----|
| `BOT_TOKEN_1` | @ai_koshey_bot |
| `BOT_TOKEN_2` | @helper_999_bot |

### Staging (staging)
| Токен | Бот |
|-------|-----|
| `BOT_TOKEN_1` | @neuro_blogger_bot (staging) |
| `BOT_TOKEN_2` | @MetaMuse_Manifest_bot (staging) |
| `BOT_TOKEN_3` | @ZavaraBot (staging) |
| `BOT_TOKEN_4` | @LeeSolarbot (staging) |
| `BOT_TOKEN_5` | @NeuroLenaAssistant_bot (staging) |
| `BOT_TOKEN_6` | @NeurostylistShtogrina_bot (staging) |
| `BOT_TOKEN_7` | @Gaia_Kamskaia_bot (staging) |
| `BOT_TOKEN_8` | @Kaya_easy_art_bot (staging) |
| `BOT_TOKEN_9` | @AI_STARS_bot (staging) |
| `BOT_TOKEN_10` | @HaimGroupMedia_bot (staging) |

### Production (prod)
| Токен | Бот |
|-------|-----|
| `BOT_TOKEN_1` | @neuro_blogger_bot |
| `BOT_TOKEN_2` | @MetaMuse_Manifest_bot |
| `BOT_TOKEN_3` | @ZavaraBot |
| `BOT_TOKEN_4` | @LeeSolarbot |
| `BOT_TOKEN_5` | @NeuroLenaAssistant_bot |
| `BOT_TOKEN_6` | @NeurostylistShtogrina_bot |
| `BOT_TOKEN_7` | @Gaia_Kamskaia_bot |
| `BOT_TOKEN_8` | @Kaya_easy_art_bot |
| `BOT_TOKEN_9` | @AI_STARS_bot |
| `BOT_TOKEN_10` | @HaimGroupMedia_bot |

## ✅ Преимущества новой схемы

1. **Простота** - Везде одинаковые имена токенов
2. **Масштабируемость** - Легко добавить BOT_TOKEN_11, BOT_TOKEN_12...
3. **Нет путаницы** - Не нужно помнить что в dev это `_TEST_`, а в prod нет
4. **Изоляция** - Каждое окружение имеет свои значения для одинаковых ключей
5. **Единообразие кода** - Один цикл for загружает токены для всех окружений

## 🚀 Что делать дальше

### Шаг 1: Переименовать токены в Infisical (ВРУЧНУЮ)

Следуй инструкции в `RENAME_TOKENS_INSTRUCTIONS.md`

### Шаг 2: Проверить что токены переименованы

```bash
npx tsx scripts/list-bot-tokens.ts
```

Ожидаемый результат:
```
🤖 [List] Найдено BOT токенов: 2

   1. BOT_TOKEN_1
   2. BOT_TOKEN_2
```

### Шаг 3: Протестировать dev окружение

```bash
npm run dev
```

Ожидаемые логи:
```
🏁 Запуск приложения
🔐 [Infisical] Инициализация cloud-first secret manager...
✅ [Infisical] Загружено 97 секретов из dev
📋 [Infisical] Копирование секретов в process.env...
🧪 [Infisical] Development окружение - загружаем 2 тестовых бота
  ✅ BOT_TOKEN_1 загружен
  ✅ BOT_TOKEN_2 загружен
  ✅ Supabase credentials загружены
✅ [Infisical] Секреты скопированы в process.env для окружения: dev
```

### Шаг 4: Проверить что боты запускаются

Должны запуститься 2 бота:
- `clip_maker_neuro_bot` (BOT_TOKEN_1)
- `helper_999_bot` (BOT_TOKEN_2)

## 🔍 Проверка правильности миграции

### Чек-лист

- [ ] В Infisical dev окружении есть `BOT_TOKEN_1` и `BOT_TOKEN_2`
- [ ] В Infisical dev окружении НЕТ `BOT_TOKEN_TEST_1` и `BOT_TOKEN_TEST_2`
- [ ] `npx tsx scripts/list-bot-tokens.ts` показывает 2 токена
- [ ] `npm run dev` запускается без ошибок
- [ ] В логах видно "✅ BOT_TOKEN_1 загружен" и "✅ BOT_TOKEN_2 загружен"
- [ ] Оба бота инициализируются
- [ ] Не возникает ошибки 409 (если другие инстансы остановлены)

## 📞 Если что-то пошло не так

### Проблема: Токены не найдены в Infisical

**Решение**: Проверь что переименование выполнено через Web UI

### Проблема: Ошибка 409 Conflict

**Решение**: Останови другие инстансы ботов:
```bash
pkill -f 'bun.*src/index.ts'
pkill -f 'tsx.*src/index.ts'
```

### Проблема: Боты не запускаются

**Решение**: Проверь логи:
```bash
tail -100 /tmp/bot-startup.log
```

## 🎉 Результат

Теперь у нас **простая, понятная, унифицированная система**:

- ✅ Везде токены называются одинаково: `BOT_TOKEN_1`-`BOT_TOKEN_N`
- ✅ Легко масштабировать: просто добавь `BOT_TOKEN_11` в Infisical
- ✅ Легко поддерживать: не нужно помнить специальные суффиксы для разных окружений
- ✅ Три головы дракона работают изолированно и гармонично! 🐲

**Вместе они создают непобедимого дракона!** 🐉✨
