# Руководство по работе с утилитами логирования

## Обзор утилит

В этом проекте реализованы следующие утилиты для работы с логами:

1. **save-logs.sh** - сохраняет текущие логи в файл с временной меткой
2. **view-logs.sh** - интерактивное меню для управления и просмотра логов
3. **monitor-errors.sh** - анализирует логи на наличие ошибок и создаёт отчёт
4. **setup-log-collection.sh** - настраивает автоматический сбор логов

## Установка

1. Скопируйте все скрипты на сервер:
   ```bash
   scp -i ~/.ssh/id_rsa save-logs.sh view-logs.sh setup-log-collection.sh root@999-multibots-u14194.vm.elestio.app:/root/
   ```

2. Запустите скрипт настройки:
   ```bash
   ssh -i ~/.ssh/id_rsa root@999-multibots-u14194.vm.elestio.app
   cd /root
   chmod +x setup-log-collection.sh
   ./setup-log-collection.sh
   ```

## Ежедневное использование

### Просмотр логов

Самый удобный способ - использовать интерактивное меню:

```bash
ssh -i ~/.ssh/id_rsa root@999-multibots-u14194.vm.elestio.app
cd /root
./view-logs.sh
```

### Основные команды

| Команда | Описание |
|---------|----------|
| `./save-logs.sh` | Сохранить текущие логи в файл |
| `cat /root/logs/errors-summary.txt` | Проверить последний отчёт об ошибках |
| `ls -lt /root/logs` | Просмотреть список файлов с логами |

## Автоматизация

Система настроена на:
- Автоматическое сохранение логов каждый час
- Проверку на наличие ошибок каждые 30 минут
- Хранение истории логов в директории /root/logs/

## Поиск ошибок

Для быстрого поиска ошибок в логах:

```bash
grep -i "error\|exception\|critical" /root/logs/latest-logs.txt
```

## Настройка хранения

По умолчанию хранятся 10 последних файлов логов. Изменить это количество можно в функции `clean_old_logs` в скрипте `view-logs.sh`.

## Примеры использования

### Пример 1: Ежедневная проверка ошибок

```bash
ssh -i ~/.ssh/id_rsa root@999-multibots-u14194.vm.elestio.app "cat /root/logs/errors-summary.txt"
```

### Пример 2: Сохранение и скачивание логов локально

```bash
ssh -i ~/.ssh/id_rsa root@999-multibots-u14194.vm.elestio.app "./save-logs.sh"
scp -i ~/.ssh/id_rsa root@999-multibots-u14194.vm.elestio.app:/root/logs/latest-logs.txt ./local-logs.txt
```

### Пример 3: Поиск конкретного события

```bash
ssh -i ~/.ssh/id_rsa root@999-multibots-u14194.vm.elestio.app "grep 'payment/process' /root/logs/latest-logs.txt"
``` 