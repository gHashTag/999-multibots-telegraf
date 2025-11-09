# 🔐 Аудит токенов проекта

## ✅ АКТИВНЫЕ ТОКЕНЫ (нужны в Infisical)

### Telegram Bot Tokens
```
BOT_TOKEN_1 через BOT_TOKEN_10  # Production боты
BOT_TOKEN_TEST_1, BOT_TOKEN_TEST_2  # Test боты для dev
```

### Supabase (База данных)
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY  # ✅ ОСНОВНОЙ ключ
SUPABASE_SERVICE_KEY  # ⚠️ ДУБЛИКАТ - удалить
SUPABASE_KEY  # ⚠️ ДУБЛИКАТ - удалить
```

### AI/ML Сервисы
```
# OpenAI/DeepSeek
DEEPSEEK_API_KEY  # ✅ ИСПОЛЬЗУЕТСЯ
OPENAI_API_KEY  # ⚠️ СТАРЫЙ - проверить использование
OPENROUTER_API_KEY  # ⚠️ Альтернатива - проверить

# ElevenLabs (голос)
ELEVENLABS_API_KEY  # ✅ ОСНОВНОЙ
ELEVENLABS_API_KEY_HEYGEN  # ⚠️ Специфичный для HeyGen - проверить

# Video Generation
FAL_KEY  # ✅ ИСПОЛЬЗУЕТСЯ
KIE_AI_API_KEY  # ✅ ИСПОЛЬЗУЕТСЯ
REPLICATE_API_TOKEN  # ✅ ИСПОЛЬЗУЕТСЯ
SYNC_LABS_API_KEY  # ✅ ИСПОЛЬЗУЕТСЯ

# HeyGen
HEYGEN_COCOAGE_API_KEY
HEYGEN_HAIM_API_KEY
HEYGEN_COCOAGE_VOICE_ID
HEYGEN_HAIM_VOICE_ID

# Другие
APIFY_TOKEN  # Instagram scraping
HUGGINGFACE_TOKEN
```

### System/Infrastructure
```
ADMIN_TELEGRAM_ID  # ✅ НУЖЕН
ADMIN_CHAT_ID  # ✅ НУЖЕН
ADMIN_IDS  # ✅ НУЖЕН
SERVER_FILES_DIR  # ✅ НУЖЕН
NODE_ENV  # ✅ НУЖЕН
```

## ❌ МЕРТВЫЕ ТОКЕНЫ (удалить)

### Дубликаты Telegram
```
BOT_TOKEN  # Дубликат BOT_TOKEN_1
BOT_TOKENS  # Устаревший массив
BOT_TOKEN_TEST_3  # Не используется
TEST_BOT_NAME  # Захардкожено в коде
```

### Дубликаты Supabase
```
SUPABASE_SERVICE_KEY  # Дубликат SUPABASE_SERVICE_ROLE_KEY
SUPABASE_KEY  # Дубликат SUPABASE_SERVICE_ROLE_KEY
```

### Устаревшие/неиспользуемые сервисы
```
# Robokassa (payment - неактуален?)
MERCHANT_LOGIN
ROBOKASSA_PASSWORD_1
ROBOKASSA_PASSWORD_2
RESULT_URL2
TEST_PASSWORD1
TEST_PASSWORD2

# Pinata (IPFS - неактуален?)
PINATA_JWT
PINATA_GATEWAY

# Credentials (что это?)
CREDENTIALS
SECRET_KEY
SECRET_API_KEY

# GitHub (нужен ли?)
GITHUB_TOKEN
GITHUB_USERNAME
GITHUB_WEBHOOK_SECRET

# Docker (development only?)
DOCKER_SOCKET
DOCKER_HOST
DOCKER_NETWORK
DOCKER_CONFIG
ALLOWED_DIR
ALLOWED_COMMANDS
ALLOWED_FLAGS
MAX_COMMAND_LENGTH
COMMAND_TIMEOUT

# NPM (зачем?)
NPM_TOKEN

# Glama/ZEP (что это?)
GLAMA_API_KEY
ZEP_API_KEY

# MCP (нужен ли?)
MCP_MODE

# E2B (используется?)
E2B_API_KEY
BOT_OWNER_ID  # Дубликат ADMIN_TELEGRAM_ID

# Anthropic (используется?)
ANTHROPIC_API_KEY

# Neon (используется?)
DATABASE_URL  # Дубликат Supabase?

# Render (что это?)
RENDER_INNGEST_EVENT_KEY
RENDER_INNGEST_SIGNING_KEY

# Telegram API (зачем?)
TELEGRAM_API_HASH
TELEGRAM_API_ID
API_ID  # Дубликат
API_HASH  # Дубликат
PHONE_NUMBER  # Зачем?

# Feature flags (устарели?)
DEV_SIMULATE_SUBSCRIPTION
FORCE_DEV_MODE
FORCE_START
USE_PLAN_A
USE_TEST_LIPSYNC
USE_TEST_VEO31
AUTOFIXER_NOTIFICATION_ENABLED
AUTO_FIX_ENABLED
BOT_AUTOFIXER_ENABLED

# Webhook (устарело?)
SECRET_TOKEN
WEBHOOK_PATH
BOT_PATH
MODE
BASE_WEBHOOK_URL
WEBHOOK_DOMAIN
WEBHOOK_ENABLED
WEBHOOK_PORT
USE_POLLING

# Server URLs (дубликаты)
LOCAL_SERVER_URL  # Только для dev
AI_SERVER_API_KEY
AI_SERVER_URL
API_SERVER_URL
SERVER_API_URL
TMA_RENDER_URL

# Inngest (дубликаты)
BOT_INNGEST_BASE_URL
BOT_INNGEST_EVENT_KEY
BOT_INNGEST_SIGNING_KEY
INNGEST_DEV_URL
INNGEST_PROD_URL
USE_SERVE

# Monitoring
MONITORING_BOT_TOKEN  # Что это?

# Others
CRYPTOBOT_API_TOKEN  # Используется?
FAL_API_KEY  # Дубликат FAL_KEY?
HEDRA_API_KEY  # Используется?
MIDJOURNEY_API_KEY  # Используется?
NGROK  # Только для dev
ORIGIN  # Что это?
PORT  # Только для dev
PROXY_PORT  # Только для dev
REPLICATE_USERNAME  # Нужен ли?
REPLICATE_WEBHOOK_URL  # Нужен ли?
SYNC_API_KEY  # Дубликат SYNC_LABS_API_KEY?
SUPPORT_CHAT_ID  # Нужен ли?
GROUP_ID  # Что это?
LOG_LEVEL  # Только для dev
DOTENV_CONFIGURATION  # Что это?
DEV_CHANNEL_ID  # Что это?
ALERT_CHAT_ID  # Что это?
GITHUB_REPO_NAME  # Нужен ли?
GITHUB_REPO_OWNER  # Нужен ли?
```

## 🔧 РЕКОМЕНДАЦИИ

### 1. Немедленно удалить
- Все дубликаты (BOT_TOKEN, SUPABASE_KEY и т.д.)
- Неиспользуемые feature flags
- Устаревшие сервисы (Pinata, некоторые Robokassa если не используются)

### 2. Проверить использование
- Payment токены (Robokassa, CryptoBot)
- GitHub токены
- Anthropic, E2B, Neon токены
- Telegram API credentials (API_ID, API_HASH)

### 3. Централизовать в Infisical
Создать три окружения:
- `dev`: тестовые токены + dev-specific
- `staging`: production токены + staging URLs
- `prod`: production токены + production URLs

### 4. Оставить в .env ТОЛЬКО
```
INFISICAL_CLIENT_ID
INFISICAL_CLIENT_SECRET
INFISICAL_PROJECT_ID
INFISICAL_ENVIRONMENT
NODE_ENV
```

## 📊 Статистика
- **Всего найдено**: ~100 переменных
- **Активных (нужны)**: ~30
- **Дубликатов**: ~15
- **Мертвых/проверить**: ~55
- **Экономия**: 70% переменных можно удалить!
