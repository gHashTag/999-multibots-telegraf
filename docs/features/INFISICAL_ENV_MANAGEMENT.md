# 🔐 Управление секретами через Infisical Cloud

## 📋 Проблема: Пустые API ключи в запросах

### Симптомы

```json
{
  "avatar_settings": {
    "heygen": {
      "api_key": "", // ❌ ПУСТО!
      "voice_id": "dc9cd149b0d741d6934a1d95e3f3ef00"
    },
    "eleven_labs_api_key": "" // ❌ ПУСТО!
  }
}
```

### Причина

**API ключи не загружаются в `process.env`**, хотя они есть в Infisical Cloud:

1. ✅ Ключи хранятся в **Infisical Cloud** (project: `fd763fa3-35d5-4045-93bd-1795c5f00fc3`, env: `prod`)
2. ❌ `.env` файл на сервере **НЕ содержит** эти ключи
3. ❌ `heygen-avatars-config.ts` читает из `process.env.HEYGEN_*` (пустые значения)
4. ❌ Запросы отправляются с пустыми `api_key`

## 🛠️ Решение

### 1. **Автоматическое восстановление .env из Infisical**

Используйте скрипт `restore-env-from-infisical.sh`:

```bash
# Локально (development)
./scripts/restore-env-from-infisical.sh

# Production
./scripts/restore-env-from-infisical.sh --prod
```

**Что делает скрипт:**

- Экспортирует все секреты из Infisical Cloud
- Удаляет кавычки (Docker Compose не понимает кавычки)
- Добавляет обратно `INFISICAL_*` credentials (они не экспортируются)
- Создает бэкап предыдущего `.env`

### 2. **Ручное восстановление (если скрипт недоступен)**

```bash
# 1. Экспорт из Infisical
infisical export \
  --projectId=fd763fa3-35d5-4045-93bd-1795c5f00fc3 \
  --env=prod \
  --path=/ \
  --format=dotenv \
  | sed "s/'//g" > /tmp/restored.env

# 2. Добавить Infisical credentials обратно
#
# Машинная учётка НЕ хранится в этом файле — она открывает доступ ко ВСЕМ
# 50+ секретам проекта. Настоящие значения взять так:
#   railway variables --kv | grep INFISICAL_
#   либо Infisical Dashboard → https://app.infisical.com → project "999"
#        → Access Control → Machine Identities → Client ID / Client Secret
#
# Сначала экспортировать их в шелл. Проверки ниже падают ГРОМКО, если
# переменная не задана, — так недозаполненный .env не уедет на production.
: "${INFISICAL_CLIENT_ID:?INFISICAL_CLIENT_ID не задан. Взять: railway variables --kv | grep INFISICAL_CLIENT_ID}"
: "${INFISICAL_CLIENT_SECRET:?INFISICAL_CLIENT_SECRET не задан. Взять: railway variables --kv | grep INFISICAL_CLIENT_SECRET}"
: "${INFISICAL_PROJECT_ID:?INFISICAL_PROJECT_ID не задан. Взять: railway variables --kv | grep INFISICAL_PROJECT_ID}"

cat >> /tmp/restored.env <<EOF

INFISICAL_CLIENT_ID=${INFISICAL_CLIENT_ID}
INFISICAL_CLIENT_SECRET=${INFISICAL_CLIENT_SECRET}
INFISICAL_PROJECT_ID=${INFISICAL_PROJECT_ID}
EOF

# 3. Загрузить на production
scp /tmp/restored.env prod999:/root/bot-farm/.env

# 4. Перезапустить контейнер
ssh prod999 "cd /root/bot-farm && docker compose down && docker compose up -d"
```

### 3. **Проверка загрузки ключей**

```bash
# Проверить переменные в контейнере
docker exec 999-multibots printenv | grep -E 'HEYGEN|ELEVENLABS'

# Должно показать:
# HEYGEN_COCOAGE_API_KEY=sk_V2_hgu_kZgKPoImFA5_...
# HEYGEN_HAIM_API_KEY=sk_V2_hgu_kBLbUbWT3dT_i0Nz...
# ELEVENLABS_API_KEY=737d2f8b185450984e1525893f0327f4...
# ELEVENLABS_HAIM_API_KEY=737d2f8b185450984e1525893f...
# ELEVENLABS_VOICE_COCOAGE=2b2e1f15157b454487f1250ffe586d7a
# ELEVENLABS_VOICE_HAIM=dc9cd149b0d741d6934a1d95e3f3ef00
```

## 🏗️ Архитектура секретов

```
┌─────────────────────┐
│  Infisical Cloud    │ ← Single Source of Truth
│  (prod environment) │
└──────────┬──────────┘
           │ export
           ↓
    ┌──────────────┐
    │   .env file  │ ← Локальная копия (70 переменных)
    └──────┬───────┘
           │ Docker Compose загружает
           ↓
┌────────────────────────┐
│ docker-compose.yml     │
│   environment:         │
│     - HEYGEN_*=${...}  │ ← Явное объявление переменных
│     - ELEVENLABS_*=... │
└──────┬─────────────────┘
       │ передает в контейнер
       ↓
┌─────────────────────────┐
│  Docker Container       │
│  process.env.HEYGEN_*   │ ← Доступны в Node.js приложении
│  process.env.ELEVENLABS_*│
└─────────────────────────┘
       │
       ↓
┌─────────────────────────┐
│ heygen-avatars-config.ts│
│ apiKey: process.env.HEYGEN_HAIM_API_KEY ← Читает из env
└─────────────────────────┘
```

## 🔒 Безопасность

### ✅ Правильные практики

1. **Хранить секреты ТОЛЬКО в Infisical Cloud**
   - Не коммитить `.env` в git
   - Использовать `.env.example` для документации

2. **Автоматизировать восстановление**
   - Использовать скрипт `restore-env-from-infisical.sh`
   - Добавить в CI/CD pipeline

3. **Регулярно ротировать ключи**

   ```bash
   # Обновить в Infisical
   infisical secrets set HEYGEN_HAIM_API_KEY='new_key_here' \
     --projectId=fd763fa3-35d5-4045-93bd-1795c5f00fc3 \
     --env=prod \
     --path=/

   # Восстановить .env
   ./scripts/restore-env-from-infisical.sh --prod

   # Перезапустить
   ssh prod999 "cd /root/bot-farm && docker compose restart app"
   ```

### ❌ Плохие практики

1. **НЕ хардкодить ключи в код**

   ```typescript
   // ❌ ПЛОХО
   const apiKey = 'sk_V2_hgu_kBLbUbWT3dT_...'

   // ✅ ХОРОШО
   const apiKey = process.env.HEYGEN_HAIM_API_KEY || ''
   ```

2. **НЕ коммитить .env**

   ```gitignore
   # .gitignore
   .env
   .env.local
   .env.production
   ```

3. **НЕ использовать кавычки в .env** (Docker Compose не понимает)

   ```bash
   # ❌ ПЛОХО
   HEYGEN_API_KEY='sk_V2_hgu_...'

   # ✅ ХОРОШО
   HEYGEN_API_KEY=sk_V2_hgu_...
   ```

## 📝 Регулярные задачи

### Еженедельно

- [ ] Проверить, что все ключи в Infisical актуальны
- [ ] Проверить логи на ошибки аутентификации

### Ежемесячно

- [ ] Ротировать критичные API ключи (HeyGen, ElevenLabs)
- [ ] Проверить права доступа в Infisical

### При деплое

- [ ] Восстановить `.env` из Infisical
- [ ] Проверить, что все переменные загрузились в контейнер
- [ ] Проверить работу API с новыми ключами

## 🆘 Troubleshooting

### Проблема: "api_key is empty" в логах

**Причина:** `.env` файл не содержит ключи или Docker Compose не прочитал файл.

**Решение:**

```bash
# 1. Проверить .env на сервере
ssh prod999 "grep 'HEYGEN_HAIM_API_KEY' /root/bot-farm/.env"

# 2. Если пусто - восстановить из Infisical
./scripts/restore-env-from-infisical.sh --prod

# 3. Перезапустить контейнер
ssh prod999 "cd /root/bot-farm && docker compose restart app"

# 4. Проверить переменные в контейнере
ssh prod999 "docker exec 999-multibots printenv | grep HEYGEN"
```

### Проблема: "INFISICAL\_\* variable is not set" в Docker Compose

**Причина:** `INFISICAL_*` credentials не добавлены в `docker-compose.yml`

**Решение:**

```yaml
# docker-compose.yml
services:
  app:
    environment:
      - INFISICAL_CLIENT_ID=${INFISICAL_CLIENT_ID}
      - INFISICAL_CLIENT_SECRET=${INFISICAL_CLIENT_SECRET}
      - INFISICAL_PROJECT_ID=${INFISICAL_PROJECT_ID}
```

### Проблема: Infisical export пустой

**Причина:** Неправильные credentials или нет доступа к проекту.

**Решение:**

```bash
# Проверить credentials
echo $INFISICAL_CLIENT_ID
echo $INFISICAL_PROJECT_ID

# Проверить доступ к проекту
infisical secrets list \
  --projectId=fd763fa3-35d5-4045-93bd-1795c5f00fc3 \
  --env=prod \
  --path=/
```

## 📚 Полезные ссылки

- [Infisical CLI Docs](https://infisical.com/docs/cli/overview)
- [Docker Compose Environment Variables](https://docs.docker.com/compose/environment-variables/)
- [HeyGen API Docs](https://docs.heygen.com/)
- [ElevenLabs API Docs](https://elevenlabs.io/docs/)
- [Avatar API Keys Mapping](./AVATAR_API_KEYS.md)

---

**Последнее обновление**: 2025-11-12
**Автор**: DevOps Team / Claude AI Assistant
