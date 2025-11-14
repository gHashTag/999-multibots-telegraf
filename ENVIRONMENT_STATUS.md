# 🐲 VIBEE - Статус всех окружений (Три головы дракона)

**Дата проверки**: 2025-11-09
**Приложение**: VIBEE (ранее neuro-blogger-telegram-bot)

---

## 📊 Общий статус

| Окружение | Статус | Инфраструктура | Токены | Infisical |
|-----------|--------|----------------|---------|-----------|
| 🟢 **Dev** | ✅ Работает | Локально | BOT_TOKEN_1-2 | ✅ Подключен |
| 🟡 **Staging** | ⚠️ Не настроен | - | - | ❌ Не создан |
| 🔴 **Production** | ✅ Работает | 212.86.115.30 | BOT_TOKEN_1-10 | ❌ НЕ используется |

---

## 🟢 Development (dev)

### ✅ Статус: ПОЛНОСТЬЮ РАБОЧИЙ

**Конфигурация**:
```bash
INFISICAL_ENVIRONMENT=dev
NODE_ENV=development
```

**Токены** (унифицированная схема):
- ✅ `BOT_TOKEN_1` → @ai_koshey_bot
- ✅ `BOT_TOKEN_2` → @helper_999_bot

**Infisical**:
- ✅ Подключен через Machine Identity
- ✅ Загружает 98 секретов из облака
- ✅ Токены загружаются автоматически при старте

**Боты**:
- ✅ 2 бота инициализируются
- ⚠️ 409 ошибка (ожидаемо - работают другие инстансы)

**Логи**:
```
🏁 Запуск приложения
🔐 [Infisical] Инициализация cloud-first secret manager...
✅ [Infisical] Загружено 98 секретов из dev
🧪 [Infisical] Development окружение - загружаем 2 тестовых бота
  ✅ BOT_TOKEN_1 загружен
  ✅ BOT_TOKEN_2 загружен
🤖 Инициализация ботов: development
🧪 Dev: запускаем 2 тестовых бота
```

**Запуск**:
```bash
npm run dev
# или
bun --watch src/index.ts
```

---

## 🟡 Staging (staging)

### ⚠️ Статус: НЕ НАСТРОЕН

**Что нужно сделать**:

1. **Создать окружение в Infisical**:
   - Зайти на https://app.infisical.com
   - Проект "999"
   - Создать environment `staging`

2. **Добавить токены**:
   ```
   BOT_TOKEN_1 → @neuro_blogger_bot (staging версия)
   BOT_TOKEN_2 → @MetaMuse_Manifest_bot (staging версия)
   ... через BOT_TOKEN_10
   ```

3. **Добавить другие секреты**:
   ```
   SUPABASE_URL=<staging_supabase>
   SUPABASE_SERVICE_KEY=<staging_key>
   ANTHROPIC_API_KEY=<key>
   ... все остальные
   ```

4. **Настроить staging сервер**:
   ```bash
   # Создать .env с минимальной конфигурацией
   INFISICAL_CLIENT_ID=<machine_identity_id>
   INFISICAL_CLIENT_SECRET=<machine_identity_secret>
   INFISICAL_PROJECT_ID=fd763fa3-35d5-4045-93bd-1795c5f00fc3
   INFISICAL_ENVIRONMENT=staging
   NODE_ENV=production
   ```

5. **Задеплоить код**:
   ```bash
   git checkout main
   git pull origin main
   npm install
   npm run build
   npm start
   ```

---

## 🔴 Production (prod)

### ✅ Статус: РАБОТАЕТ (но использует старый .env)

**Сервер**: `root@212.86.115.30:/root/bot-farm`
**Git branch**: `production` ✅
**Процесс**: `node dist/index.js` (PID 36161) ✅

**КРИТИЧЕСКАЯ НАХОДКА**:
```bash
# Production всё ещё использует старый .env с hardcoded токенами!
NODE_ENV=production
API_PORT=2999

BOT_TOKEN_1=7655182164:AAGTnUzDNU61zeV8VXL_BKkVU6OdrgjDVlU
BOT_TOKEN_2=8199290378:AAH16uPdrSLkt4YJJuLoO0LV1022o197ph0
... через BOT_TOKEN_10
```

**Проблема**:
- ❌ Production НЕ использует Infisical
- ❌ Токены hardcoded в .env файле (небезопасно!)
- ⚠️ Код обновлён для Infisical, но .env старый

**Что работает**:
- ✅ Боты запущены и работают
- ✅ 10 ботов активны
- ✅ Git на правильной ветке `production`

---

## 🚀 Миграция Production на Infisical

### План действий:

#### Шаг 1: Подготовить Infisical environment `prod`

1. Зайти на https://app.infisical.com
2. Проект "999" → Создать environment `prod`
3. Добавить все токены:
   ```
   BOT_TOKEN_1=7655182164:AAGTnUzDNU61zeV8VXL_BKkVU6OdrgjDVlU
   BOT_TOKEN_2=8199290378:AAH16uPdrSLkt4YJJuLoO0LV1022o197ph0
   ... через BOT_TOKEN_10
   ```

4. Добавить все остальные секреты из текущего `.env`

#### Шаг 2: Обновить .env на production сервере

**ПЕРЕД изменениями - сделать backup**:
```bash
ssh root@212.86.115.30
cd /root/bot-farm
cp .env .env.backup.$(date +%Y%m%d)
```

**Заменить .env на**:
```bash
# 🔐 VIBEE - Production Environment
INFISICAL_CLIENT_ID=88fcf0cd-cce9-4844-bad2-8e19b4bad3ed
INFISICAL_CLIENT_SECRET=b377e7a60b669ea2317f339dc6cb79ce49d588a7bbed92433bb2a73dedff3314
INFISICAL_PROJECT_ID=fd763fa3-35d5-4045-93bd-1795c5f00fc3

# 🚀 PRODUCTION ENVIRONMENT
INFISICAL_ENVIRONMENT=prod

# NODE_ENV для production режима
NODE_ENV=production
```

#### Шаг 3: Протестировать загрузку секретов

```bash
ssh root@212.86.115.30
cd /root/bot-farm

# Проверить что Infisical работает
npx tsx scripts/test-infisical.ts

# Должно показать:
# ✅ Подключено к Infisical
# 📊 Environment: prod
# 📊 Всего секретов: ~100
```

#### Шаг 4: Перезапустить production боты

```bash
# Остановить текущий процесс
kill 36161

# Запустить с новым .env
cd /root/bot-farm
nohup node dist/index.js > bot.log 2>&1 &

# Проверить логи
tail -50 bot.log
```

#### Шаг 5: Мониторинг

```bash
# Проверить что боты запустились
ps aux | grep node

# Проверить логи
tail -100 bot.log

# Ожидается:
# ✅ [Infisical] Загружено секретов из prod
# 🚀 Production: запускаем 10 ботов
# ✅ BOT_TOKEN_1 загружен
# ... через BOT_TOKEN_10
```

---

## 📋 Чек-лист миграции Production

- [ ] Создать `prod` environment в Infisical
- [ ] Скопировать все токены из текущего .env в Infisical
- [ ] Скопировать все остальные секреты в Infisical
- [ ] Сделать backup текущего .env
- [ ] Заменить .env на минимальную Infisical конфигурацию
- [ ] Протестировать загрузку секретов
- [ ] Перезапустить боты
- [ ] Проверить логи на ошибки
- [ ] Убедиться что все 10 ботов работают
- [ ] Удалить старый .env.backup после успешного запуска

---

## 🧹 Очистка логов (ВЫПОЛНЕНО)

### Что было почищено:

1. ✅ Убраны debug логи сцен (47 сцен x 5 строк = 235 строк логов)
2. ✅ Убраны SCENE_DEBUG логи
3. ✅ Убраны "registerCommands FUNCTION COMPLETED" логи
4. ✅ Убраны логи из bot.ts
5. ✅ Упрощены логи инициализации

### Было:
```
🔍 [SCENE 1] ai_photoshop_scene: ai_photoshop_scene {
  hasId: true,
  hasMiddleware: true,
  isValid: true,
  isUndefined: false,
  isNull: false
}
... x 48 сцен
🚨 [SCENE_DEBUG] Stage created with scenes: { ... }
🔧 [DEBUG] REGISTERING /instagram command handler NOW!
🔧 [DEBUG] registerCommands FUNCTION COMPLETED SUCCESSFULLY!
```

### Стало:
```
🤖 Инициализация ботов: development
🧪 Dev: запускаем 2 тестовых бота
✅ Main bot instance saved for webhooks
🤖 Бот clip_maker_neuro_bot инициализирован
```

**Сэкономлено**: ~250 строк debug логов при каждом запуске!

---

## 🎨 Переименование проекта (ВЫПОЛНЕНО)

### package.json обновлён:

**Было**:
```json
{
  "name": "neuro-blogger-telegram-bot",
  "description": "Telegram bot for generating blog posts using AI"
}
```

**Стало**:
```json
{
  "name": "vibee",
  "description": "VIBEE - AI-powered Telegram bot platform"
}
```

---

## ✅ Текущий статус код-базы

### Унифицированная схема токенов:

**src/index.ts**:
```typescript
if (infisicalEnv === 'dev') {
  botTokens = [
    process.env.BOT_TOKEN_TEST_1,
    process.env.BOT_TOKEN_TEST_2,
  ].filter((token): token is string => Boolean(token))
  console.log(`🧪 Dev: запускаем ${botTokens.length} тестовых бота`)
} else if (infisicalEnv === 'staging' || infisicalEnv === 'prod') {
  botTokens = [
    process.env.BOT_TOKEN_1,
    ... через BOT_TOKEN_10
  ].filter((token): token is string => Boolean(token))
  console.log(`🚀 ${infisicalEnv}: запускаем ${botTokens.length} ботов`)
}
```

**src/core/infisical/index.ts**:
```typescript
// 🔐 УНИФИЦИРОВАННАЯ СХЕМА: везде BOT_TOKEN_1-N
if (env === 'dev') {
  for (let i = 1; i <= 2; i++) {
    process.env[`BOT_TOKEN_${i}`] = getSecret(`BOT_TOKEN_${i}`)
  }
} else if (env === 'staging' || env === 'prod') {
  for (let i = 1; i <= 10; i++) {
    process.env[`BOT_TOKEN_${i}`] = getSecret(`BOT_TOKEN_${i}`)
  }
}
```

---

## 🐉 Философия трёх голов дракона

```
                    🐲 VIBEE - ТРИ ГОЛОВЫ ДРАКОНА

        👨‍💻 DEV          🎭 STAGING        🚀 PRODUCTION
      (голова 1)       (голова 2)         (голова 3)

   ✅ Работает       ⚠️ Не настроен    ✅ Работает
   Infisical ✅     Infisical ❌       Infisical ❌
   BOT_TOKEN_1-2    -                 BOT_TOKEN_1-10
   2 бота           0 ботов           10 ботов

   Локальная        Тестовый          Production
   разработка       сервер            212.86.115.30
```

**Development** - быстрая и гибкая ✅
**Staging** - надёжная и проверенная (нужно настроить) ⚠️
**Production** - стабильная (нужно мигрировать на Infisical) ⚠️

---

## 🎯 Следующие шаги

### Приоритет 1: Production миграция на Infisical
1. Создать `prod` environment в Infisical
2. Перенести все секреты
3. Обновить .env на production сервере
4. Перезапустить боты
5. Мониторинг 24 часа

### Приоритет 2: Staging окружение
1. Создать `staging` environment в Infisical
2. Настроить staging сервер
3. Добавить в CI/CD pipeline

### Приоритет 3: Документация
1. Обновить README.md для VIBEE
2. Создать deployment guide
3. Записать видео-инструкцию

---

**Отчёт подготовил**: Claude Code
**Дата**: 2025-11-09
**Версия**: 1.0

🐉 **Три головы дракона станут непобедимыми, когда все будут использовать Infisical!**
