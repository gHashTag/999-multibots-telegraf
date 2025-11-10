# 🚀 Ngrok Development Setup

## Зачем это нужно?

При локальной разработке вебхуки от внешних сервисов (Kie.ai, Railway) не могут достучаться до `localhost`.
Ngrok создает публичный туннель до твоего локального сервера, позволяя получать вебхуки во время разработки.

## ⚡ Автоматический режим (Встроено в `bun dev`)

### 1. Получи ngrok authtoken

1. Зарегистрируйся на https://dashboard.ngrok.com/
2. Скопируй свой authtoken
3. Добавь в `.env`:

```bash
NGROK_AUTHTOKEN=your_token_here
```

### 2. Запусти бота как обычно

```bash
bun dev
```

**Готово!** Ngrok запустится автоматически в dev окружении:
- ✅ Автоматически создаст ngrok туннель на порт 8080
- ✅ Автоматически установит `BASE_WEBHOOK_URL` в публичный URL
- ✅ Покажет все webhook URLs в консоли
- ✅ Запустит бота с правильными webhook URLs

## Что ты увидишь

```
[Infisical загружает секреты...]
✅ [Infisical] Секреты скопированы в process.env для окружения: dev

🌐 [NGROK] Создаем туннель для локальной разработки...
📡 [NGROK] Подключаемся к ngrok на порт 8080...
✅ [NGROK] Туннель успешно создан!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 ПУБЛИЧНЫЕ WEBHOOK URLs:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 Base URL:          https://abc123.ngrok.io
🎬 Kie.ai Callback:   https://abc123.ngrok.io/api/kie-ai/callback
🎥 AI Reels Callback: https://abc123.ngrok.io/api/telegram/ai-reels-callback
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Все боты успешно инициализированы
```

## Как это работает

### Без ngrok (не работает локально)
```
1. Твой Mac (localhost:8080) → Kie.ai API
2. Kie.ai генерирует видео
3. Kie.ai → webhook → https://three-head-dragon.shop ❌ (продакшн сервер)
4. Продакшн не знает о твоем taskId → видео не доставляется
```

### С ngrok (работает!)
```
1. Твой Mac (localhost:8080) ← ngrok tunnel ← https://abc123.ngrok.io
2. Твой Mac → Kie.ai API с callbackUrl: https://abc123.ngrok.io/api/kie-ai/callback
3. Kie.ai генерирует видео
4. Kie.ai → webhook → https://abc123.ngrok.io ✅
5. ngrok перенаправляет → localhost:8080 ✅
6. taskId найден в локальной памяти → видео доставляется ✅
```

## Troubleshooting

### Ошибка: "authtoken"
```
❌ Failed to start ngrok tunnel:
Error: authtoken is required

💡 Tip: You need an ngrok authtoken. Get one at https://dashboard.ngrok.com/
Then run: export NGROK_AUTHTOKEN=your_token_here
Or add NGROK_AUTHTOKEN to your .env file
```

**Решение**: Добавь `NGROK_AUTHTOKEN` в `.env`

### Ошибка: "port 8080 already in use"

```bash
# Убей процесс на порту 8080
lsof -ti:8080 | xargs kill -9

# Или используй kill-port
npm run predev
```

### Ngrok tunnel closed unexpectedly

Бесплатный план ngrok закрывает туннели через 2 часа. Просто перезапусти:

```bash
npm run dev:tunnel
```

## Production vs Development

### Development (локально с ngrok)
```bash
npm run dev:tunnel
```
- ✅ Получаешь вебхуки на localhost
- ✅ Можешь дебажить в VS Code
- ✅ Видишь логи в реальном времени
- ⚠️ Новый URL при каждом запуске

### Production (на сервере)
```bash
npm run deploy
```
- ✅ Постоянный URL (three-head-dragon.shop)
- ✅ Работает 24/7
- ⚠️ Нет логов в реальном времени

## Альтернативы ngrok

### 1. Cloudflare Tunnel (бесплатно, без лимитов)
```bash
brew install cloudflare/cloudflare/cloudflared
cloudflared tunnel --url http://localhost:8080
```

### 2. Localtunnel (бесплатно, проще ngrok)
```bash
npm install -g localtunnel
lt --port 8080
```

### 3. Тестировать на продакшене
Самый простой способ - просто используй @neuro_blogger_bot на production сервере.

## FAQ

**Q: Можно ли использовать ngrok для production?**
A: Нет, только для development. Production использует постоянный домен.

**Q: Нужно ли перезапускать бота при каждом изменении кода?**
A: Нет! Бот запущен с `--watch`, изменения применяются автоматически.

**Q: Ngrok URL меняется при каждом запуске?**
A: Да, на бесплатном плане. Платный план дает постоянный URL.

**Q: Можно ли использовать несколько туннелей одновременно?**
A: Да, но на бесплатном плане только 1 туннель. Платный - до 10.
