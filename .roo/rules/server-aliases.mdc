---
description: Алис и полезные команды для сервера 
globs: 
alwaysApply: false
---
# 🛠️ Алиасы и полезные команды для сервера

## 🔄 Алиасы для .zshrc или .bashrc
```bash
# Базовое подключение к серверу
alias nb-ssh='ssh -i ~/.ssh/id_rsa root@999-multibots-u14194.vm.elestio.app'

# Быстрый деплой
alias nb-deploy='ssh -i ~/.ssh/id_rsa root@999-multibots-u14194.vm.elestio.app "cd /opt/app/999-multibots-telegraf && docker-compose down && docker-compose up --build -d"'

# Просмотр логов
alias nb-logs='ssh -i ~/.ssh/id_rsa root@999-multibots-u14194.vm.elestio.app "cd /opt/app/999-multibots-telegraf && docker-compose logs -f"'

# Проверка статуса
alias nb-status='ssh -i ~/.ssh/id_rsa root@999-multibots-u14194.vm.elestio.app "cd /opt/app/999-multibots-telegraf && docker-compose ps"'
```

## 📋 Полезные команды

### Копирование файлов на сервер
```bash
# Копировать файл
scp -i ~/.ssh/id_rsa ./local-file.txt root@999-multibots-u14194.vm.elestio.app:/opt/app/999-multibots-telegraf/

# Копировать директорию
scp -r -i ~/.ssh/id_rsa ./local-dir root@999-multibots-u14194.vm.elestio.app:/opt/app/999-multibots-telegraf/
```

### Мониторинг ресурсов
```bash
# Использование CPU и памяти
nb-ssh 'docker stats'

# Место на диске
nb-ssh 'df -h'
```

### Работа с Docker
```bash
# Очистка неиспользуемых образов
nb-ssh 'docker system prune -a'

# Просмотр всех контейнеров
nb-ssh 'docker ps -a'

# Просмотр логов конкретного контейнера
nb-ssh 'docker logs -f container_name'
```

## 🔍 Отладка

### Проверка сети
```bash
# Проверка портов
nb-ssh 'netstat -tulpn'

# Проверка DNS
nb-ssh 'nslookup domain.com'
```

### Проверка логов
```bash
# Системные логи
nb-ssh 'journalctl -f'

# Логи Docker
nb-ssh 'docker-compose logs -f --tail=100'
```

## 🚀 Скрипты для автоматизации

### Быстрый бэкап
```bash
#!/bin/bash
timestamp=$(date +%Y%m%d_%H%M%S)
nb-ssh "cd /opt/app/999-multibots-telegraf && tar -czf backup_${timestamp}.tar.gz data/"
```

### Проверка здоровья
```bash
#!/bin/bash
echo "Checking server health..."
nb-status
nb-ssh 'df -h && free -h && docker stats --no-stream'
```
