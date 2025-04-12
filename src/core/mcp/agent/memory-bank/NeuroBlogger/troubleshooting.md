# Руководство по устранению неполадок

## Проблемы с запуском проекта

### Ошибка: Module not found

**Симптомы**: При запуске проекта появляется ошибка `Error: Cannot find module 'некий_модуль'`.

**Решение**:
1. Убедитесь, что все зависимости установлены:
   ```bash
   npm install
   ```
2. Проверьте наличие модуля в `package.json`.
3. Проверьте, нет ли опечаток в имени модуля при импорте.
4. При необходимости установите модуль вручную:
   ```bash
   npm install некий_модуль
   ```

### Ошибка: Port is already in use

**Симптомы**: При запуске появляется ошибка `Error: listen EADDRINUSE: address already in use :::PORT`.

**Решение**:
1. Найдите процесс, использующий порт:
   ```bash
   # На Linux/Mac
   lsof -i :PORT
   
   # На Windows
   netstat -ano | findstr :PORT
   ```
2. Завершите процесс:
   ```bash
   # На Linux/Mac (PID - ID процесса)
   kill PID
   
   # На Windows
   taskkill /F /PID PID
   ```
3. Или измените порт в настройках приложения.

### Ошибка: Cannot connect to Docker daemon

**Симптомы**: При запуске Docker появляется ошибка `Cannot connect to the Docker daemon`.

**Решение**:
1. Убедитесь, что Docker запущен:
   ```bash
   # Проверка статуса
   docker info
   
   # Запуск Docker (на Linux)
   sudo systemctl start docker
   ```
2. Проверьте права пользователя:
   ```bash
   # Добавление пользователя в группу docker
   sudo usermod -aG docker $USER
   
   # Применение изменений
   newgrp docker
   ```

## Проблемы с базой данных

### Ошибка: Cannot connect to database

**Симптомы**: Приложение не может подключиться к базе данных Supabase.

**Решение**:
1. Проверьте переменные окружения `SUPABASE_URL` и `SUPABASE_SERVICE_KEY`.
2. Убедитесь, что база данных доступна:
   ```bash
   curl -I "$SUPABASE_URL/health"
   ```
3. Проверьте сетевые настройки и блокировку портов.
4. Проверьте статус сервиса Supabase в панели управления.

### Ошибка: Invalid relation "table_name"

**Симптомы**: При выполнении SQL-запроса появляется ошибка `relation "table_name" does not exist`.

**Решение**:
1. Проверьте наличие таблицы в схеме базы данных:
   ```sql
   SELECT EXISTS (
     SELECT FROM information_schema.tables 
     WHERE table_schema = 'public' 
     AND table_name = 'table_name'
   );
   ```
2. Создайте таблицу, если она отсутствует (SQL миграции можно найти в `/supabase/migrations/`).
3. Убедитесь, что вы используете правильное название таблицы (с учетом регистра).
4. Проверьте настройки схемы в запросе.

### Ошибка: Function get_user_balance does not exist

**Симптомы**: При вызове функции `get_user_balance` появляется ошибка.

**Решение**:
1. Проверьте наличие функции в базе данных:
   ```sql
   SELECT EXISTS (
     SELECT FROM pg_proc
     WHERE proname = 'get_user_balance'
   );
   ```
2. Создайте функцию, если она отсутствует:
   ```sql
   CREATE OR REPLACE FUNCTION public.get_user_balance(user_telegram_id text)
   RETURNS numeric
   LANGUAGE plpgsql
   AS $function$
   -- код функции из документации
   $function$
   ```
3. Проверьте правильность аргументов при вызове функции.

## Проблемы с Telegram ботом

### Бот не отвечает на сообщения

**Симптомы**: Бот не реагирует на отправленные сообщения.

**Решение**:
1. Проверьте, запущен ли бот:
   ```bash
   docker logs 999-multibots | grep "Bot started"
   ```
2. Проверьте статус вебхука:
   ```bash
   curl -s https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo
   ```
3. Проверьте логи на наличие ошибок:
   ```bash
   docker logs 999-multibots | grep "ERROR"
   ```
4. Выполните повторную настройку вебхука:
   ```bash
   curl -s -X POST https://api.telegram.org/bot$BOT_TOKEN/setWebhook?url=https://999-multibots-telegraf-u14194.vm.elestio.app/BOT_NAME
   ```

### Ошибка: Wrong response from the webhook

**Симптомы**: В логах Telegram API появляется ошибка `Wrong response from the webhook`.

**Решение**:
1. Проверьте Nginx-конфигурацию:
   ```bash
   docker exec bot-proxy nginx -t
   ```
2. Проверьте обработчик вебхуков в коде бота.
3. Проверьте соответствие путей URL вебхука и обработчика в коде.
4. Перезапустите контейнеры:
   ```bash
   docker-compose down
   docker-compose up -d
   ```

### Ошибка: Failed to fetch updates

**Симптомы**: В логах бота появляется ошибка `Failed to fetch updates`.

**Решение**:
1. Проверьте правильность токена бота.
2. Убедитесь, что бот не запущен одновременно в режиме webhook и polling.
3. Сбросите вебхук перед использованием polling:
   ```bash
   curl -s -X POST https://api.telegram.org/bot$BOT_TOKEN/deleteWebhook
   ```
4. Проверьте соединение с серверами Telegram API.

## Проблемы с платежной системой

### Ошибка: Duplicate payment

**Симптомы**: В логах появляется ошибка о дублировании платежа.

**Решение**:
1. Проверьте уникальность `operation_id` и `inv_id`:
   ```sql
   SELECT COUNT(*) FROM payments_v2 WHERE operation_id = '123456';
   ```
2. Убедитесь, что используется функция `generateUniqueShortInvId` для генерации идентификаторов.
3. Реализуйте дополнительную проверку на существующие платежи перед созданием новых.

### Неправильный расчет баланса

**Симптомы**: Баланс пользователя рассчитывается неправильно.

**Решение**:
1. Проверьте SQL-функцию `get_user_balance`:
   ```sql
   SELECT get_user_balance('123456789');
   ```
2. Проверьте записи в таблице `payments_v2`:
   ```sql
   SELECT * FROM payments_v2 WHERE telegram_id = '123456789';
   ```
3. Убедитесь, что все транзакции имеют правильный статус и тип.
4. Проверьте, нет ли дублирующихся записей для одной операции.

### Ошибка: Insufficient funds

**Симптомы**: Пользователь получает ошибку о недостаточном балансе при наличии средств.

**Решение**:
1. Проверьте баланс пользователя:
   ```sql
   SELECT get_user_balance('123456789');
   ```
2. Проверьте сумму списания и валидацию в коде.
3. Убедитесь, что нет задержек между проверкой баланса и списанием средств.
4. Проверьте, правильно ли указан тип транзакции (`money_expense`).

## Проблемы с Docker и Nginx

### Ошибка: nginx: [emerg] host not found in upstream

**Симптомы**: Nginx не может найти upstream-хост.

**Решение**:
1. Проверьте IP-адреса контейнеров:
   ```bash
   docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 999-multibots
   ```
2. Обновите конфигурацию Nginx с правильными IP-адресами:
   ```bash
   ./update-nginx-config.sh
   ```
3. Перезапустите Nginx:
   ```bash
   docker exec bot-proxy nginx -s reload
   ```

### Ошибка: Docker контейнер завершается сразу после запуска

**Симптомы**: Контейнер не остаётся запущенным, статус "Exited".

**Решение**:
1. Проверьте логи контейнера:
   ```bash
   docker logs 999-multibots
   ```
2. Убедитесь, что в `Dockerfile` правильно указана команда запуска.
3. Проверьте, не завершается ли основной процесс из-за ошибок.
4. Проверьте настройки Docker Compose на наличие опции `restart: unless-stopped`.

### Ошибка: Permission denied for volumes

**Симптомы**: Docker не может монтировать тома из-за ошибок прав доступа.

**Решение**:
1. Проверьте права доступа на директории:
   ```bash
   ls -la /opt/app/999-multibots-telegraf/
   ```
2. Установите нужные права:
   ```bash
   sudo chmod -R 755 /opt/app/999-multibots-telegraf/
   ```
3. Создайте необходимые директории с правильными правами:
   ```bash
   mkdir -p /opt/app/999-multibots-telegraf/logs
   chmod 777 /opt/app/999-multibots-telegraf/logs
   ```

## Проблемы с тестированием

### Ошибка: Test timeout

**Симптомы**: Тесты превышают время ожидания и завершаются с ошибкой.

**Решение**:
1. Увеличьте таймаут в конфигурации тестов:
   ```typescript
   // В файле src/test-utils/test-config.ts
   export const TEST_CONFIG = {
     timeout: 30000, // 30 секунд
     // другие настройки...
   };
   ```
2. Проверьте наличие бесконечных циклов или длительных операций в тестах.
3. Используйте асинхронные операции правильно, с корректной обработкой Promise.

### Ошибка: Test database connection failed

**Симптомы**: Тесты не могут подключиться к тестовой базе данных.

**Решение**:
1. Проверьте переменные окружения для тестовой БД в `.env.test`.
2. Убедитесь, что тестовая база данных существует и доступна.
3. Используйте моки для изоляции тестов от реальной базы данных:
   ```typescript
   // Создание мока для функции supabase.from
   const mockFrom = createMockFn().mockReturnValue({
     select: createMockFn().mockReturnValue({
       eq: createMockFn().mockReturnValue({
         single: createMockFn().mockResolvedValue({
           data: { id: 1, name: 'Test User' },
           error: null
         })
       })
     })
   });
   ```