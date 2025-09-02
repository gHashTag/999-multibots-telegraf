# 🚀 БЫСТРЫЕ SSH КОМАНДЫ ДЛЯ МОНИТОРИНГА PRODUCTION

## 📋 КОПИ-ПАСТ КОМАНДЫ

### 1️⃣ БЫСТРАЯ ПРОВЕРКА СТАТУСА (5 секунд)
```bash
ssh -i ~/.ssh/selectel root@185.161.67.53 "pm2 list && pm2 logs bot-farm --lines 10 --nostream"
```

### 2️⃣ ПОЛНАЯ ДИАГНОСТИКА (30 секунд)
```bash
ssh -i ~/.ssh/selectel root@185.161.67.53 'bash -s' < scripts/ssh-quick-commands.sh
```

### 3️⃣ БЫСТРЫЙ РЕСТАРТ
```bash
ssh -i ~/.ssh/selectel root@185.161.67.53 "cd /root/999-agents-telegraf && pm2 restart bot-farm"
```

### 4️⃣ СМОТРЕТЬ ЛОГИ В РЕАЛЬНОМ ВРЕМЕНИ
```bash
ssh -i ~/.ssh/selectel root@185.161.67.53 "pm2 logs bot-farm"
```
Нажмите `Ctrl+C` чтобы выйти

### 5️⃣ ПОЛНОЕ ВОССТАНОВЛЕНИЕ (2-3 минуты)
```bash
ssh -i ~/.ssh/selectel root@185.161.67.53 'bash -s' < scripts/fix-production-bots.sh
```

## 🔍 СПЕЦИФИЧНЫЕ ПРОВЕРКИ

### Проверить последние ошибки
```bash
ssh -i ~/.ssh/selectel root@185.161.67.53 "pm2 logs bot-farm --err --lines 50 --nostream"
```

### Проверить статус сборки
```bash
ssh -i ~/.ssh/selectel root@185.161.67.53 "ls -la /root/999-agents-telegraf/dist/ | head -10"
```

### Проверить git статус
```bash
ssh -i ~/.ssh/selectel root@185.161.67.53 "cd /root/999-agents-telegraf && git status && git log -5 --oneline"
```

### Проверить память и CPU
```bash
ssh -i ~/.ssh/selectel root@185.161.67.53 "free -h && top -bn1 | head -10"
```

### Проверить вебхуки
```bash
ssh -i ~/.ssh/selectel root@185.161.67.53 "cd /root/999-agents-telegraf && node scripts/setup-webhooks.js"
```

## 📊 ПОНИМАНИЕ ПРОЦЕССА СБОРКИ

### Что происходит при деплое:

1. **GIT PULL** - Получение кода из GitHub (5-10 секунд)
   ```bash
   git pull origin production
   ```

2. **NPM INSTALL** - Установка зависимостей (30-60 секунд)
   ```bash
   npm install --production
   ```

3. **BUILD** - Компиляция TypeScript → JavaScript (20-40 секунд)
   ```bash
   npm run build:prod
   ```
   - Создаёт папку `dist/` с JS файлами
   - Компилирует все `.ts` файлы

4. **PM2 START** - Запуск процесса (2-5 секунд)
   ```bash
   pm2 start dist/index.js --name bot-farm
   ```

5. **WEBHOOKS** - Регистрация вебхуков (5-10 секунд)
   ```bash
   node scripts/setup-webhooks.js
   ```

## 🚨 ЧАСТЫЕ ПРОБЛЕМЫ И РЕШЕНИЯ

### ❌ Боты не отвечают
```bash
# 1. Проверить статус
ssh -i ~/.ssh/selectel root@185.161.67.53 "pm2 list"

# 2. Если статус "stopped" или "errored"
ssh -i ~/.ssh/selectel root@185.161.67.53 "pm2 restart bot-farm"

# 3. Если не помогает - полное восстановление
ssh -i ~/.ssh/selectel root@185.161.67.53 'bash -s' < scripts/fix-production-bots.sh
```

### ❌ Ошибка "dist folder not found"
```bash
# Пересобрать проект
ssh -i ~/.ssh/selectel root@185.161.67.53 "cd /root/999-agents-telegraf && npm run build:prod && pm2 restart bot-farm"
```

### ❌ Вебхуки не работают
```bash
# Переустановить вебхуки
ssh -i ~/.ssh/selectel root@185.161.67.53 "cd /root/999-agents-telegraf && node scripts/setup-webhooks.js"
```

### ❌ Out of memory
```bash
# Рестарт с лимитом памяти
ssh -i ~/.ssh/selectel root@185.161.67.53 "pm2 delete bot-farm && pm2 start /root/999-agents-telegraf/dist/index.js --name bot-farm --max-memory-restart 1G"
```

## 📈 МОНИТОРИНГ В РЕАЛЬНОМ ВРЕМЕНИ

### Открыть 3 терминала одновременно:

**Терминал 1 - Общие логи:**
```bash
ssh -i ~/.ssh/selectel root@185.161.67.53 "pm2 logs bot-farm"
```

**Терминал 2 - Только ошибки:**
```bash
ssh -i ~/.ssh/selectel root@185.161.67.53 "pm2 logs bot-farm --err"
```

**Терминал 3 - Статус системы:**
```bash
ssh -i ~/.ssh/selectel root@185.161.67.53 "watch -n 5 'pm2 list && echo && free -h'"
```

## 🎯 АЛИАСЫ ДЛЯ БЫСТРОГО ДОСТУПА

Добавьте в ваш `~/.zshrc` или `~/.bashrc`:

```bash
# Production Bot Commands
alias bot-status="ssh -i ~/.ssh/selectel root@185.161.67.53 'pm2 list'"
alias bot-logs="ssh -i ~/.ssh/selectel root@185.161.67.53 'pm2 logs bot-farm'"
alias bot-restart="ssh -i ~/.ssh/selectel root@185.161.67.53 'pm2 restart bot-farm'"
alias bot-fix="ssh -i ~/.ssh/selectel root@185.161.67.53 'bash -s' < ~/999-agents-telegraf/scripts/fix-production-bots.sh"
alias bot-deploy="cd ~/999-agents-telegraf && git push origin production && bot-fix"
```

После добавления выполните:
```bash
source ~/.zshrc  # или source ~/.bashrc
```

Теперь можно использовать:
- `bot-status` - проверить статус
- `bot-logs` - смотреть логи
- `bot-restart` - перезапустить
- `bot-fix` - полное восстановление
- `bot-deploy` - деплой из локальной машины