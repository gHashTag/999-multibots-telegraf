---
description: 
globs: 
alwaysApply: true
---
# Server Deployment Protocol 🚀

## 📡 Параметры сервера
```bash
SSH_KEY=~/.ssh/id_rsa
SERVER=root@999-multibots-u14194.vm.elestio.app
PROJECT_PATH=/opt/app/bot-farm
```

## 📜 Священный порядок развертывания

### 1️⃣ Подключение к серверу
```bash
ssh -i $SSH_KEY $SERVER
```

### 2️⃣ Установка PM2 глобально
```bash
npm install -g pm2
pm2 startup # Автозапуск при перезагрузке
```

### 3️⃣ Обновление кода
```bash
cd $PROJECT_PATH
git pull origin main
```

### 4️⃣ Установка зависимостей
```bash
pnpm install
```

### 5️⃣ Сборка проекта
```bash
pnpm build
```

### 6️⃣ Запуск через PM2
```bash
pm2 delete all # Останавливаем старые процессы
NODE_ENV=production pm2 start dist/bot.js --name neuroblogger
pm2 save # Сохраняем конфигурацию
```

### 7️⃣ Проверка логов и статуса
```bash
pm2 logs neuroblogger
pm2 status
pm2 monit # Мониторинг в реальном времени
```

## 🔍 Чек-лист проверки
- [ ] PM2 установлен глобально
- [ ] Код обновлен из репозитория
- [ ] Зависимости установлены
- [ ] Проект собран
- [ ] Процесс запущен через PM2
- [ ] Порт 2999 прослушивается
- [ ] Логи не содержат ошибок
- [ ] PM2 автозапуск настроен

## ⚠️ Известные проблемы
1. Если PM2 не установлен:
   ```bash
   curl -sL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh -o install_nvm.sh
   bash install_nvm.sh
   source ~/.bashrc
   nvm install 20
   nvm use 20
   npm install -g pm2
   ```

2. Если порт занят:
   ```bash
   lsof -i :2999
   kill -9 <PID>
   ```

## 🛠️ Полезные команды
```bash
# Проверка статуса сервера
pm2 status

# Просмотр логов
pm2 logs neuroblogger

# Перезапуск сервера
pm2 restart neuroblogger

# Мониторинг
pm2 monit

# Сохранение конфигурации PM2
pm2 save

# Очистка логов
pm2 flush

# Информация о процессе
pm2 show neuroblogger
```
