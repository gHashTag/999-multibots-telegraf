# 🚀 Deployment Checklist - Infisical Migration

## ✅ Что сделано

### 1. Централизация секретов
- [x] Интеграция Infisical SDK
- [x] Lazy initialization всех API клиентов
- [x] Три изолированных окружения (dev, staging, prod)
- [x] Автоматическая загрузка токенов при старте

### 2. Безопасность
- [x] Удалены все .env.backup файлы с токенами
- [x] Обновлен .env.example - только Infisical credentials
- [x] Создан src/utils/sanitize.ts для input validation
- [x] Security audit выполнен (см. SECURITY_AUDIT_REPORT.md)
- [x] Нет секретов в git истории

### 3. Документация
- [x] INFISICAL_ENVIRONMENTS.md - гайд по окружениям
- [x] TOKENS_AUDIT.md - аудит 100+ переменных
- [x] SECURITY_AUDIT_REPORT.md - security анализ
- [x] .clinerules-global - правила для агентов

## 🎯 Следующие шаги для deployment

### Шаг 1: Проверка локально (СДЕЛАНО ✅)
```bash
# Проверить что все работает
npx tsx scripts/test-infisical.ts

# Ожидаемый результат:
# ✅ Environment: dev
# ✅ Всего секретов: 97
# ✅ BOT_TOKEN_TEST_1 найден
```

### Шаг 2: Production - добавить токены в Infisical

1. Открыть https://app.infisical.com
2. Перейти в проект "999"
3. Создать окружение `prod` (если нет)
4. Добавить все production токены:

```bash
# BOT TOKENS (из текущего production .env)
BOT_TOKEN_1=7655182164:AAGTnUzDNU61zeV8VXL_BKkVU6OdrgjDVlU
BOT_TOKEN_2=8199290378:AAH16uPdrSLkt4YJJuLoO0LV1022o197ph0
# ... через BOT_TOKEN_10

# API KEYS
DEEPSEEK_API_KEY=sk-c06ac21630134f598bc5954e03800aee
FAL_KEY=c1e974e0-fc8b-4bf9-9d65-be9c8989d8d3:d388aba401de346e45bcb12b79c1d214
REPLICATE_API_TOKEN=r8_BcAdO3Lsy4Er7XAQxmoHjrXskbdGj5m0XyaEv
KIE_AI_API_KEY=c98141e4b2b6413688fbea2a9b78f127
ELEVENLABS_API_KEY=737d2f8b185450984e1525893f0327f48736fe9e9d850d52cb63834337ca7dc4
SYNC_LABS_API_KEY=sk-Mf4D6_cfROmid6eAcffrTA.7ARklsfyhok1zT-i3LrEXkPMpmTQlt37

# SUPABASE (ТОЛЬКО ОДИН ключ!)
SUPABASE_URL=https://yuukfqcsdhkyxegfwlcb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ADMIN
ADMIN_TELEGRAM_ID=144022504
ADMIN_CHAT_ID=neuro_blogger_pulse
ADMIN_IDS=144022504,1254048880,352374518,1852726961

# INFRASTRUCTURE
SERVER_FILES_DIR=/etc/nginx/html/files/
```

### Шаг 3: Production сервер - заменить .env

На сервере `root@212.86.115.30`:

```bash
# 1. Бэкап текущего .env (на всякий случай)
cd /root/bot-farm
cp .env .env.backup.manual

# 2. Создать новый минимальный .env
cat > .env << 'EOF'
# 🔐 Infisical Cloud-First Configuration - PRODUCTION
INFISICAL_CLIENT_ID=88fcf0cd-cce9-4844-bad2-8e19b4bad3ed
INFISICAL_CLIENT_SECRET=b377e7a60b669ea2317f339dc6cb79ce49d588a7bbed92433bb2a73dedff3314
INFISICAL_PROJECT_ID=fd763fa3-35d5-4045-93bd-1795c5f00fc3

# 🚀 PRODUCTION ENVIRONMENT
INFISICAL_ENVIRONMENT=prod

# NODE_ENV
NODE_ENV=production
EOF

# 3. Проверить что файл создан правильно
cat .env

# 4. Удалить старый бэкап (содержит токены)
rm -f .env.backup.manual
```

### Шаг 4: Staging (main branch) - создать окружение

1. В Infisical создать окружение `staging`
2. Скопировать все токены из `prod` в `staging`
3. На staging сервере создать `.env`:

```bash
INFISICAL_CLIENT_ID=88fcf0cd-cce9-4844-bad2-8e19b4bad3ed
INFISICAL_CLIENT_SECRET=b377e7a60b669ea2317f339dc6cb79ce49d588a7bbed92433bb2a73dedff3314
INFISICAL_PROJECT_ID=fd763fa3-35d5-4045-93bd-1795c5f00fc3
INFISICAL_ENVIRONMENT=staging
NODE_ENV=production
```

### Шаг 5: Git Push и Deploy

```bash
# 1. Push changes
git push origin production

# 2. На production сервере
cd /root/bot-farm
git pull origin production

# 3. Rebuild
npm install
npm run build

# 4. Restart
npm run deploy  # или ваш деплой скрипт
```

### Шаг 6: Проверка после deploy

```bash
# На production сервере
tail -f /root/bot-farm/logs/app.log

# Ожидаемые логи:
# 🔐 [Infisical] Инициализация cloud-first secret manager...
# ✅ [Infisical] Загружено X секретов из prod
# 🚀 [Infisical] Production окружение - загружаем production токены
# ✅ BOT_TOKEN_1 загружен
# ... через BOT_TOKEN_10
# 🚀 [BOT INIT] Production окружение - используем production токены
```

## 🚨 Rollback план

Если что-то пойдет не так:

```bash
# 1. Восстановить старый .env
cd /root/bot-farm
mv .env.backup.manual .env

# 2. Откатить код
git reset --hard HEAD~2

# 3. Перезапустить
npm run deploy
```

## 📊 Checklist перед production deploy

- [ ] Все production токены добавлены в Infisical окружение `prod`
- [ ] Создан минимальный .env на production сервере
- [ ] Проверено что нет старых .env.backup файлов
- [ ] Git push сделан
- [ ] Backup текущей конфигурации сделан
- [ ] Monitoring настроен для отслеживания ошибок

## 🎯 После успешного deploy

1. **Удалить старые .env файлы** на сервере (кроме текущего минимального)
2. **Мониторить логи** первые 24 часа
3. **Проверить все боты** работают корректно
4. **Обновить team** что миграция завершена

## 📞 Контакты в случае проблем

- Security вопросы: см. SECURITY_AUDIT_REPORT.md
- Infisical вопросы: см. INFISICAL_ENVIRONMENTS.md
- Токены вопросы: см. TOKENS_AUDIT.md
