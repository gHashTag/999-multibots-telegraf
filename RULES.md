# 🚨 ПРАВИЛА ПРОЕКТА - ТОКЕНЫ И СЕКРЕТЫ

## 🔐 КРИТИЧЕСКИ ВАЖНО: НЕ ЗАМЕНЯТЬ ТОКЕНЫ НА ФЕЙКОВЫЕ!

### ❌ СТРОГО ЗАПРЕЩЕНО:
1. **Заменять реальные токены ботов** (`BOT_TOKEN_*`) на плейсхолдеры типа `YOUR_BOT_TOKEN_HERE`
2. **Коммитить токены в репозиторий** - они должны быть только в `.env` файле (который в `.gitignore`)
3. **Заменять реальные API ключи** на `placeholder_token`
4. **Удалять или изменять** переменные окружения production сервера

### ✅ ОБЯЗАТЕЛЬНО ДЛЯ ВСЕХ РАЗРАБОТЧИКОВ:
1. **Поддерживать реальные токены** в `.env` файле
2. **Копировать реальные токены** из production в локальную разработку при необходимости
3. **НЕ ИСПОЛЬЗОВАТЬ** `.env.example` или подобные файлы для production
4. **Проверять** что все `BOT_TOKEN_*` переменные содержат действительные токены Telegram

### 📋 АКТУАЛЬНЫЕ ТОКЕНЫ (НЕ ЗАМЕНЯТЬ!):
```bash
# @neuro_blogger_bot
BOT_TOKEN_1=7655182164:AAGTnUzDNU61zeV8VXL_BKkVU6OdrgjDVlU

# @MetaMuse_Manifest_bot
BOT_TOKEN_2=8199290378:AAH16uPdrSLkt4YJJuLoO0LV1022o197ph0

# @ZavaraBot
BOT_TOKEN_3=7699001347:AAFyO6bsmoa0nzZ4_Aww3GHtRBEJgEh9pkU

# @LeeSolarbot
BOT_TOKEN_4=7415778573:AAGqFwTgEg5t3rO_21CL4bAR3A9FsW-MC58

# @NeuroLenaAssistant_bot
BOT_TOKEN_5=8032830593:AAFUQYjgS2wMud5hpdcWz8xaAZsDuGOmlMk

# @NeurostylistShtogrina_bot
BOT_TOKEN_6=7614375306:AAE8I4ArdrxVQuc1oXuxpcfeYLZsrPxbXmk

# @Gaia_Kamskaia_bot
BOT_TOKEN_7=7137641587:AAHsU_WRwSmMOrfPwdYQnd4Tq_ITXkbcveo

# @Kaya_easy_art_bot
BOT_TOKEN_8=7291523285:AAFvO9d9CRjOvW0C7jOAF6tI8WygsjAeGlY

# @AI_STARS_bot
BOT_TOKEN_9=8064644741:AAHHqEgK2K_svYEhUDZUsZos7YWjS9EGIo4

# @HaimGroupMedia_bot
BOT_TOKEN_10=7312934643:AAHG89LHFoeAU6pEUfsGJDLePUPn8RjD4gE

# Тестовые боты
BOT_TOKEN_TEST_1=6389824290:AAG3qm-tK2vBM5yaqvSRe4Kuf8Xk-g-MwyE
BOT_TOKEN_TEST_2=5081334256:AAFWhPq2prN8L4daCWAVaxPVCyU_g1OTx6U

# ID Администратора
ADMIN_TELEGRAM_ID=144022504
```

### 🚨 ПОСЛЕДСТВИЯ НАРУШЕНИЯ:
- **Боты перестанут работать** на production
- **Пользователи не смогут** использовать функционал
- **Больше 404 ошибок** "token not found"
- **Простой системы** до исправления

### 📝 ПРОВЕРКА ПЕРЕД DEPLOY:
1. Убедиться что `BOT_TOKEN_*` содержат действительные токены
2. Проверить что нет `YOUR_BOT_TOKEN_HERE` в production
3. Проверить что `ADMIN_TELEGRAM_ID` установлен правильно

### 🔄 ЕСЛИ НУЖНО ОБНОВИТЬ ТОКЕНЫ:
1. Получить новый токен у [@BotFather](https://t.me/botfather)
2. Обновить в `.env` файле
3. Закоммитить `.env` (он в `.gitignore`, так что не попадет в репозиторий)
4. Задеплоить на production

---

**⚠️ ПОМНИТЕ: Токены - это не конфигурация, это секретные данные, необходимые для работы бота!**
