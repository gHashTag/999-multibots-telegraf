# 🐲 ТРИ ГОЛОВЫ ДРАКОНА - Архитектура окружений

## Концепция

Проект использует архитектуру "Три головы дракона" - три полностью изолированных окружения:

```
                    🐲 ТРИ ГОЛОВЫ ДРАКОНА

        👨‍💻 DEV          🎭 STAGING        🚀 PRODUCTION
      (голова 1)       (голова 2)         (голова 3)

   Feature ветки    ветка main      ветка production
   ─────────────    ──────────      ────────────────
   Локальная        Тестовый       Production сервер
   разработка       сервер         212.86.115.30

   🔐 УНИФИЦИРОВАННАЯ СХЕМА: везде BOT_TOKEN_1-N
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   BOT_TOKEN_1-2    BOT_TOKEN_1-10  BOT_TOKEN_1-10

   2 бота для       10 ботов        10 ботов
   разработки       (тестовые)      (боевые)
```

## 📋 Детальная структура

### 🟢 Голова 1: DEVELOPMENT (dev)

**Git ветка**: `feature/*`, любые локальные ветки
**Сервер**: Локальная машина разработчика
**Infisical окружение**: `dev`

**Конфигурация (.env)**:
```bash
INFISICAL_ENVIRONMENT=dev
NODE_ENV=development
```

**Боты** (унифицированная схема):
```
BOT_TOKEN_1 → @ai_koshey_bot или @clip_maker_neuro_bot
BOT_TOKEN_2 → @helper_999_bot
```

**Назначение**:
- Локальная разработка
- Тестирование новых фичей
- Debugging
- Быстрая итерация

**Запуск**:
```bash
npm run dev
```

---

### 🟡 Голова 2: STAGING (staging)

**Git ветка**: `main`
**Сервер**: Staging сервер (нужно настроить)
**Infisical окружение**: `staging`

**Конфигурация (.env)**:
```bash
INFISICAL_ENVIRONMENT=staging
NODE_ENV=production
```

**Боты**:
```
BOT_TOKEN_1 → @neuro_blogger_bot (staging)
BOT_TOKEN_2 → @MetaMuse_Manifest_bot (staging)
BOT_TOKEN_3 → @ZavaraBot (staging)
BOT_TOKEN_4 → @LeeSolarbot (staging)
BOT_TOKEN_5 → @NeuroLenaAssistant_bot (staging)
BOT_TOKEN_6 → @NeurostylistShtogrina_bot (staging)
BOT_TOKEN_7 → @Gaia_Kamskaia_bot (staging)
BOT_TOKEN_8 → @Kaya_easy_art_bot (staging)
BOT_TOKEN_9 → @AI_STARS_bot (staging)
BOT_TOKEN_10 → @HaimGroupMedia_bot (staging)
```

**Назначение**:
- Pre-production тестирование
- QA проверки
- Интеграционные тесты
- Проверка перед production

**Запуск**:
```bash
git checkout main
git pull origin main
npm install
npm run build
npm start
```

---

### 🔴 Голова 3: PRODUCTION (prod)

**Git ветка**: `production`
**Сервер**: `root@212.86.115.30:/root/bot-farm`
**Infisical окружение**: `prod`

**Конфигурация (.env)**:
```bash
INFISICAL_ENVIRONMENT=prod
NODE_ENV=production
```

**Боты**:
```
BOT_TOKEN_1 → @neuro_blogger_bot (production)
BOT_TOKEN_2 → @MetaMuse_Manifest_bot (production)
BOT_TOKEN_3 → @ZavaraBot (production)
BOT_TOKEN_4 → @LeeSolarbot (production)
BOT_TOKEN_5 → @NeuroLenaAssistant_bot (production)
BOT_TOKEN_6 → @NeurostylistShtogrina_bot (production)
BOT_TOKEN_7 → @Gaia_Kamskaia_bot (production)
BOT_TOKEN_8 → @Kaya_easy_art_bot (production)
BOT_TOKEN_9 → @AI_STARS_bot (production)
BOT_TOKEN_10 → @HaimGroupMedia_bot (production)
```

**Назначение**:
- Боевое окружение
- Реальные пользователи
- Максимальная стабильность
- Строгий контроль изменений

**Запуск**:
```bash
cd /root/bot-farm
git pull origin production
npm install
npm run build
npm run deploy
```

## 🔄 Workflow между головами

### 1. Development → Staging

```bash
# 1. Разработка в feature ветке
git checkout -b feature/new-awesome-feature
# ... coding ...
git add .
git commit -m "feat: new awesome feature"

# 2. Merge в main (staging)
git checkout main
git merge feature/new-awesome-feature
git push origin main

# 3. Deploy на staging сервер
# (автоматически или вручную)
```

### 2. Staging → Production

```bash
# 1. Проверка на staging прошла успешно
# 2. Merge main → production
git checkout production
git merge main
git push origin production

# 3. Deploy на production сервер
ssh root@212.86.115.30
cd /root/bot-farm
git pull origin production
npm run deploy
```

## 🔐 Infisical конфигурация

### Окружение: dev

```
🔐 УНИФИЦИРОВАННАЯ СХЕМА (везде одинаковые имена):

BOT_TOKEN_1=<токен_для_@ai_koshey_bot>
BOT_TOKEN_2=<токен_для_@helper_999_bot>
SUPABASE_URL=<dev_supabase>
... все остальные секреты для dev
```

### Окружение: staging

```
BOT_TOKEN_1=<staging_токен_1>
... через BOT_TOKEN_10
SUPABASE_URL=<staging_supabase>
... все остальные секреты для staging
```

### Окружение: prod

```
BOT_TOKEN_1=<production_токен_1>
... через BOT_TOKEN_10
SUPABASE_URL=<production_supabase>
... все остальные секреты для production
```

## 🚨 Правила безопасности

### ✅ РАЗРЕШЕНО:

1. **Dev**: Любые эксперименты, быстрые изменения
2. **Staging**: Полное тестирование перед production
3. **Production**: Только проверенный код после staging

### ❌ ЗАПРЕЩЕНО:

1. **НЕ мержить** feature → production напрямую (обязательно через staging!)
2. **НЕ тестировать** на production
3. **НЕ использовать** production токены в dev/staging
4. **НЕ коммитить** секреты в git (только в Infisical!)

## 📊 Мониторинг трех голов

### Проверка статуса всех окружений:

```bash
# 1. Dev (локально)
npm run dev
# Ожидается: 2 бота запущены

# 2. Staging (staging сервер)
ssh staging-server
cd /path/to/app
npm start
# Ожидается: 10 ботов запущены

# 3. Production (production сервер)
ssh root@212.86.115.30
cd /root/bot-farm
pm2 status
# Ожидается: 10 ботов работают
```

## 🎯 Быстрый чеклист

- [ ] Dev окружение настроено (BOT_TOKEN_TEST_1-2)
- [ ] Staging окружение создано в Infisical
- [ ] Staging сервер настроен (BOT_TOKEN_1-10)
- [ ] Production окружение настроено (BOT_TOKEN_1-10)
- [ ] Все три головы изолированы
- [ ] Workflow dev→staging→prod работает
- [ ] Мониторинг настроен для всех голов

## 🐲 Философия трех голов

> "Каждая голова дракона независима, но все работают вместе.
> Development быстрая и гибкая.
> Staging надежная и проверенная.
> Production непоколебима и стабильна."

**Вместе они создают непобедимого дракона! 🐲**
