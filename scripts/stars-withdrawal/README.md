# Telegram Stars Withdrawal Tool

Автоматизация вывода Telegram Stars с ботов проекта на TON кошелек через Fragment.

## Возможности

- Проверка баланса Stars всех 11 ботов
- Автоматический вывод со всех ботов готовых к выводу
- Вывод с конкретного бота
- Поддержка 2FA авторизации

## Требования

### Минимальные требования для вывода

| Параметр | Значение |
|----------|----------|
| Минимум Stars | 1000 |
| Период ожидания | 21 день после получения |
| Курс | ~$0.013 за Star |

### Credentials

Получить на https://my.telegram.org:
- `api_id` - числовой ID приложения
- `api_hash` - хеш приложения

Также требуется:
- Номер телефона аккаунта владельца ботов
- 2FA пароль (cloud password)

## Настройка

### 1. Добавить переменные в .env

```bash
# MTProto credentials для вывода Stars
TG_API_ID=12345678
TG_API_HASH=abcdef1234567890abcdef1234567890
TG_PHONE=+79001234567
TG_2FA_PASSWORD=your_2fa_password

# Опционально: адрес TON кошелька
TON_WALLET_ADDRESS=UQ...your_ton_wallet
```

### 2. Установить зависимости (если не установлены)

```bash
npm install @mtproto/core open readline-sync
```

## Использование

### Проверить балансы всех ботов

```bash
bun run scripts/stars-withdrawal check
```

Вывод:
```
╔════════════════════════════════════════════════════════════╗
║       TELEGRAM STARS WITHDRAWAL TOOL                      ║
╚════════════════════════════════════════════════════════════╝

✅ @neuro_blogger_bot
   Основной бот NeuroBlogger
   Всего: 5,234 Stars
   Доступно: 3,100 Stars
   ~$40.30 USD
   🚀 ГОТОВ К ВЫВОДУ!

⏳ @MetaMuse_Manifest_bot
   MetaMuse Manifest
   Всего: 800 Stars
   Доступно: 0 Stars
   ⏳ Ожидание 21 дня

...

============================================================
                      ИТОГО
============================================================
📊 Всего ботов: 11
✅ Готово к выводу: 3
❌ Ошибок: 0

⭐ Всего Stars: 15,420
💰 Доступно к выводу: 8,500
💵 ~$110.50 USD
============================================================
```

### Вывести со всех готовых ботов

```bash
bun run scripts/stars-withdrawal withdraw
```

Скрипт:
1. Проверит балансы всех ботов
2. Найдёт ботов готовых к выводу (≥1000 Stars, >21 дня)
3. Сгенерирует Fragment URL для каждого
4. Откроет URL в браузере

### Проверить конкретный бот

```bash
bun run scripts/stars-withdrawal check @neuro_blogger_bot
```

### Вывести с конкретного бота

```bash
bun run scripts/stars-withdrawal withdraw @neuro_blogger_bot
```

## Первый запуск

При первом запуске потребуется авторизация:

1. Скрипт отправит код авторизации на ваш Telegram
2. Введите код в консоли
3. Если включена 2FA, пароль будет взят из `TG_2FA_PASSWORD`
4. Сессия сохранится в `session.json`

Последующие запуски не требуют повторной авторизации.

## Завершение вывода на Fragment

После запуска `withdraw`:

1. Откроется браузер с Fragment.com
2. Войдите через Telegram (если нужно)
3. Подключите TON кошелек
4. Подтвердите вывод

**Важно:** Курс фиксируется в момент генерации URL, но транзакция может занять от нескольких секунд до часов.

## Структура файлов

```
scripts/stars-withdrawal/
├── index.ts           # Entry point, CLI интерфейс
├── config.ts          # Конфигурация 11 ботов
├── mtproto-client.ts  # MTProto клиент с 2FA/SRP
├── stars-service.ts   # Логика проверки и вывода
├── session.json       # Сохранённая сессия (создаётся автоматически)
└── README.md          # Эта документация
```

## Боты проекта

| # | Username | Описание | Token Env |
|---|----------|----------|-----------|
| 1 | @neuro_blogger_bot | Основной бот NeuroBlogger | BOT_TOKEN_1 |
| 2 | @MetaMuse_Manifest_bot | MetaMuse Manifest | BOT_TOKEN_2 |
| 3 | @ZavaraBot | Zavara Bot | BOT_TOKEN_3 |
| 4 | @LeeSolarbot | Lee Solar Bot | BOT_TOKEN_4 |
| 5 | @NeuroLenaAssistant_bot | NeuroLena Assistant | BOT_TOKEN_5 |
| 6 | @NeurostylistShtogrina_bot | Neurostylist Shtogrina | BOT_TOKEN_6 |
| 7 | @Gaia_Kamskaia_bot | Gaia Kamskaia | BOT_TOKEN_7 |
| 8 | @Kaya_easy_art_bot | Kaya Easy Art | BOT_TOKEN_8 |
| 9 | @AI_STARS_bot | AI Stars Bot | BOT_TOKEN_9 |
| 10 | @ai_koshey_bot | AI Koshey (тестовый) | BOT_TOKEN_TEST_1 |
| 11 | @clip_maker_neuro_bot | Clip Maker Neuro (тестовый) | BOT_TOKEN_TEST_2 |

## Ограничения

1. **Fragment** - финальное подтверждение всё равно требует ручного действия
2. **Rate Limits** - между запросами есть задержки для предотвращения блокировки
3. **Региональные ограничения** - Fragment/TON могут быть недоступны в некоторых странах

## Безопасность

- Никогда не коммитьте `session.json` - он содержит токен сессии
- Храните 2FA пароль безопасно (Infisical/Vault)
- API credentials (`api_id`, `api_hash`) привязаны к аккаунту

## Troubleshooting

### "PEER_ID_INVALID"
Убедитесь, что вы являетесь владельцем бота и аккаунт авторизован.

### "SESSION_PASSWORD_NEEDED"
Требуется 2FA. Убедитесь что `TG_2FA_PASSWORD` установлен правильно.

### "AUTH_KEY_UNREGISTERED"
Сессия истекла. Удалите `session.json` и авторизуйтесь заново.

## Источники

- [Telegram Stars API](https://core.telegram.org/api/stars)
- [Fragment](https://fragment.com/about)
- [MTProto Core](https://github.com/alik0211/mtproto-core)
