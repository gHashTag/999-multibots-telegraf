---
description: При подключении к серверу используйте правила 
globs: 
alwaysApply: false
---
# 🌐 Правила подключения к серверу

## 📜 Основная информация
- Сервер: `999-multibots-u14194.vm.elestio.app`
- Путь к SSH ключу: `~/.ssh/id_rsa`
- Рабочая директория: `/opt/app/999-multibots-telegraf`

## 🔑 SSH подключение

### Базовое подключение
```bash
ssh -i ~/.ssh/id_rsa root@999-multibots-u14194.vm.elestio.app
```

### Быстрые команды

#### Перезапуск с обновлением
```bash
ssh -i ~/.ssh/id_rsa root@999-multibots-u14194.vm.elestio.app 'cd /opt/app/999-multibots-telegraf && docker-compose down && docker-compose up --build -d'
```

#### Проверка логов
```bash
ssh -i ~/.ssh/id_rsa root@999-multibots-u14194.vm.elestio.app 'cd /opt/app/999-multibots-telegraf && docker-compose logs -f'
```

#### Проверка статуса
```bash
ssh -i ~/.ssh/id_rsa root@999-multibots-u14194.vm.elestio.app 'cd /opt/app/999-multibots-telegraf && docker-compose ps'
```

## 🚀 Деплой

### Полный деплой
1. Остановить контейнеры: `docker-compose down`
2. Пересобрать образы: `docker-compose build --no-cache`
3. Запустить: `docker-compose up -d`

### Быстрый деплой
```bash
docker-compose up --build -d
```

## ⚠️ Важные замечания
- Всегда проверять статус после деплоя
- Следить за логами после перезапуска
- Убедиться, что все переменные окружения на месте
- Проверить права доступа к SSH ключу (600)

## 🔍 Проверка здоровья
- Проверить статус контейнеров
- Проверить логи на ошибки
- Убедиться, что все сервисы отвечают
- Проверить использование памяти и CPU

## 📋 Чеклист перед деплоем
1. Закоммитить все изменения
2. Проверить тесты локально
3. Убедиться, что все ENV переменные настроены
4. Проверить конфигурацию Docker
5. Сделать бэкап если необходимо
