# 🤖 Telegram Admin Bot - Quick Setup

Быстрая настройка и запуск Telegram бота для управления Autonomous Monitor.

## ✅ Что уже настроено

- ✅ Бот создан: `AGENT_TELEGRAM_BOT`
- ✅ Токен: `8309813696:AAG2QWKlmUSQ3BBDupoEv1RQ0m63KcKS-IQ`
- ✅ Токен сохранен в Infisical
- ✅ Код бота готов: `.claude/mcp-servers/autonomous-monitor/admin-bot.ts`

## 🚀 Запуск за 3 шага

### Шаг 1: Добавить ADMIN_TELEGRAM_ID в Infisical

```bash
# 1. Узнать свой Telegram ID
# Написать @userinfobot в Telegram
# Скопировать ID (например: 123456789)

# 2. Добавить в Infisical
# Зайти в Infisical Dashboard
# Project: 999-agents-telegraf
# Environment: dev
# Добавить секрет:
#   Key: ADMIN_TELEGRAM_ID
#   Value: <ваш-telegram-id>
```

### Шаг 2: Установить зависимости

```bash
cd .claude/mcp-servers/autonomous-monitor

# Установить пакеты
npm install

# Собрать TypeScript
npm run build
```

### Шаг 3: Запустить бота

```bash
# Из корня проекта
./scripts/start-admin-bot.sh
```

**Ожидаемый вывод:**
```
🤖 Starting Autonomous Monitor Admin Bot
========================================
🚀 Starting bot with Infisical secrets...
✅ Using Infisical CLI
🔐 Loading secrets from Infisical...
✅ Secrets loaded from Infisical
✅ Bot is running!
📱 Bot: @your_bot_name
🔑 Admin ID: 123456789
🖥️  Server: 212.86.115.30
🐳 Container: 999-multibots

💬 Send /start to begin!
```

## 💬 Первый запуск

1. Найти своего бота в Telegram (из вывода выше)
2. Написать `/start`
3. Увидеть главное меню

**Главное меню:**
```
🤖 Autonomous Monitor Admin Bot

Добро пожаловать в панель управления production сервером!

Сервер: 212.86.115.30
Контейнер: 999-multibots

Выбери действие:
[📊 Статус] [📋 Логи]
[🚨 Ошибки] [📈 Метрики]
[🔄 Рестарт] [🚀 Деплой]
[❓ Помощь]
```

## 📱 Основные команды

### Мониторинг
```
/status  - Статус сервера и контейнера
/logs    - Просмотр логов (50/100/200/500 строк)
/errors  - Поиск ошибок в логах
/metrics - CPU, Memory, Network метрики
```

### Управление
```
/restart - Перезапуск контейнера (с подтверждением)
/deploy  - Полный деплой (git pull + rebuild)
```

### Помощь
```
/help    - Список команд
/start   - Главное меню
```

## 🔍 Примеры использования

### Пример 1: Проверить статус

**Ты:** `/status`

**Бот:**
```
🟢 Production Status

Container: 999-multibots
Status: Up 2 hours

📊 Resources:

CPU Usage:
🟢 ▓▓▓▓▓░░░░░ 45.2%

Memory Usage:
🟡 ▓▓▓▓▓▓▓░░░ 68.3%

Memory: 2.5 GiB / 4 GiB
Network: 1.2 MB / 850 kB

Обновлено: 10.11.2025, 15:30:45

[🔄 Обновить] [📋 Логи]
```

### Пример 2: Посмотреть логи

**Ты:** `/logs`

**Бот:**
```
📋 Выбери количество строк для просмотра:

[📄 50 строк] [📄 100 строк]
[📄 200 строк] [📄 500 строк]
[🔍 Только ошибки]
[🔄 Live tail]
```

**Нажимаешь:** `📄 100 строк`

**Бот отправляет:**
```
```
[последние 100 строк логов из Docker]
```
```

### Пример 3: Найти ошибки

**Ты:** `/errors`

**Бот:**
```
🚨 Обнаружено ошибок: 2 типов

🔴 MODULE_NOT_FOUND
Найдено: 3 вхождений
Пример:
`Error: Cannot find module '@/services/video'`

🟠 TYPE_ERROR
Найдено: 1 вхождений
Пример:
`TypeError: Cannot read property 'map' of undefined`

[🔧 Auto-Fix] [📋 Полные логи]
```

### Пример 4: Перезапустить контейнер

**Ты:** `/restart`

**Бот:**
```
⚠️ Подтверждение перезапуска

Контейнер: 999-multibots
Сервер: 212.86.115.30

Это приведет к кратковременному downtime (~10-20 секунд).

Вы уверены?

[✅ Да, перезапустить] [❌ Отмена]
```

**Нажимаешь:** `✅ Да, перезапустить`

**Бот:**
```
🔄 Начинаю перезапуск контейнера...
✅ Контейнер перезапущен успешно!

📊 Новый статус:
`Up 5 seconds`
```

### Пример 5: Деплой

**Ты:** `/deploy`

**Бот:**
```
🚀 Deploy to Production

Это запустит полный цикл деплоя:
1. Git pull
2. npm install
3. npm run build
4. Docker rebuild (--no-cache)
5. Container restart

Время выполнения: ~3-5 минут
Downtime: ~20-30 секунд

Продолжить?

[✅ Да, деплой] [❌ Отмена]
```

**Нажимаешь:** `✅ Да, деплой`

**Бот:**
```
🚀 Деплой начат

Это займет ~3-5 минут...
📥 Git pull...
🔨 Docker build...
🔄 Restart container...

✅ Деплой завершен!

Проверяю логи...
📋 Логи:
```
[логи запуска]
```

✅ Деплой прошел успешно, ошибок не обнаружено!
```

## 🎯 Natural Language

Бот понимает обычные фразы:

```
Ты: статус
Бот: [показывает статус]

Ты: покажи логи
Бот: [меню выбора логов]

Ты: ошибки
Бот: [ищет ошибки]

Ты: перезапусти
Бот: [запрашивает подтверждение]
```

## 🔒 Безопасность

### Только для админа

Бот проверяет `ADMIN_TELEGRAM_ID` перед каждым действием. Все остальные пользователи получат:

```
❌ Unauthorized. This bot is for admin use only.
```

### Подтверждения

Критичные действия требуют подтверждения:
- ✅ Restart (требует нажатия кнопки)
- ✅ Deploy (требует нажатия кнопки)

### Все в Infisical

Секреты не хранятся локально:
- ✅ `AGENT_TELEGRAM_BOT` - токен бота
- ✅ `ADMIN_TELEGRAM_ID` - ID админа

## 🔧 Troubleshooting

### Бот не запускается

**Проблема:** `INFISICAL_CLIENT_ID not set`

**Решение:**
```bash
# Проверить .env
cat .env | grep INFISICAL

# Должно быть:
# INFISICAL_CLIENT_ID=88fcf0cd-cce9-4844-bad2-8e19b4bad3ed
# INFISICAL_CLIENT_SECRET=b377e7a60b669ea2317f339dc6cb79ce49d588a7bbed92433bb2a73dedff3314
# INFISICAL_PROJECT_ID=fd763fa3-35d5-4045-93bd-1795c5f00fc3
```

### Бот не отвечает

**Проблема:** Бот не отвечает на команды

**Решение:**
```bash
# 1. Проверить что бот запущен
ps aux | grep admin-bot

# 2. Проверить логи
# Должно быть: ✅ Bot is running!

# 3. Проверить что ты - админ
echo $ADMIN_TELEGRAM_ID
# Должно совпадать с твоим ID

# 4. Перезапустить бота
pkill -f admin-bot
./scripts/start-admin-bot.sh
```

### Нет доступа к серверу

**Проблема:** `Permission denied (publickey)`

**Решение:**
```bash
# Проверить SSH ключ
ls -la ~/.ssh/zomro

# Проверить права
chmod 600 ~/.ssh/zomro

# Тестовое подключение
ssh -i ~/.ssh/zomro root@212.86.115.30 'echo OK'
```

### ADMIN_TELEGRAM_ID не найден

**Проблема:** Бот пишет "ADMIN_TELEGRAM_ID not set"

**Решение:**
```bash
# 1. Добавить в Infisical
# Dashboard → 999-agents-telegraf → dev
# Секрет: ADMIN_TELEGRAM_ID = <твой-id>

# 2. Проверить что секрет загрузился
# При запуске должно быть:
# ✅ Secrets loaded from Infisical
```

## 🎓 Дополнительно

### Добавить меню в Telegram

Бот автоматически устанавливает меню команд при запуске. Если не видишь меню:

1. Отправь `/start` боту
2. Нажми на иконку меню (☰) рядом с полем ввода
3. Увидишь список команд

### Автозапуск при старте системы

```bash
# Создать systemd service
sudo nano /etc/systemd/system/autonomous-bot.service

# Добавить:
[Unit]
Description=Autonomous Monitor Admin Bot
After=network.target

[Service]
Type=simple
User=playra
WorkingDirectory=/Users/playra/999-agents-telegraf
ExecStart=/Users/playra/999-agents-telegraf/scripts/start-admin-bot.sh
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target

# Включить
sudo systemctl enable autonomous-bot
sudo systemctl start autonomous-bot

# Проверить статус
sudo systemctl status autonomous-bot
```

## 📚 Связанные документы

- **Telegram Bot Guide**: `docs/TELEGRAM_BOT_GUIDE.md`
- **Quick Start**: `docs/AUTONOMOUS_MONITOR_QUICKSTART.md`
- **System Summary**: `docs/AUTONOMOUS_SYSTEM_SUMMARY.md`

---

✅ **Готово!** Теперь у тебя полноценная двухсторонняя связь с production сервером через Telegram.

🤖 **Autonomous Monitor Admin Bot** - Your Production Control Center
