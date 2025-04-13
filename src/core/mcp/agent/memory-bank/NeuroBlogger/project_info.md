# NeuroBlogger

## Описание проекта
NeuroBlogger - это проект для создания и управления контентом блога с использованием нейронных сетей и интеграцией с Telegram.

## Ключевые технологии
- Node.js
- Telegraf.js
- Supabase
- Docker
- Inngest

## Структура проекта
- Телеграм-бот для управления блогом
- База данных Supabase для хранения данных
- Интеграция с платежной системой
- Система тестирования
- Маршрутизатор задач для автономных агентов

## Supabase конфигурация
- ID: yuukfqcsdhkyxegfwlcb
- Organization ID: hlenjgpkwenatqlfwzlg
- Регион: eu-central-2
- Статус: ACTIVE_HEALTHY
- БД хост: db.yuukfqcsdhkyxegfwlcb.supabase.co
- Версия БД: 15.8.1.021

## Таблица задач (tasks)
Структура таблицы:
- id (UUID PRIMARY KEY): Уникальный идентификатор задачи
- external_id (VARCHAR): Внешний ID задачи для идентификации в системе агентов
- telegram_id (BIGINT): ID пользователя в Telegram
- bot_name (VARCHAR): Имя бота
- type (VARCHAR): Тип задачи
- description (TEXT): Описание задачи
- status (VARCHAR): Статус задачи (PENDING, IN_PROGRESS, COMPLETED, и т.д.)
- priority (INTEGER): Приоритет задачи (1-10)
- created_at (TIMESTAMPTZ): Дата создания
- updated_at (TIMESTAMPTZ): Дата обновления
- dependencies (JSONB): Зависимости от других задач (массив ID)
- metadata (JSONB): Метаданные задачи
- result (JSONB): Результат выполнения задачи
- parent_task_id (UUID): ID родительской задачи (для подзадач)
- assigned_agent_id (VARCHAR): ID агента, которому назначена задача
- is_subtask (BOOLEAN): Флаг, является ли задача подзадачей
- subtask_results (JSONB): Результаты выполнения подзадач

### Функции для работы с задачами
- create_task(): Создание новой задачи
- update_task_status(): Обновление статуса задачи
- delegate_task_to_agent(): Делегирование задачи агенту
- get_next_task(): Получение следующей доступной задачи с наивысшим приоритетом

## Команды для развертывания
```bash
ssh -i ~/.ssh/id_rsa root@999-multibots-u14194.vm.elestio.app
cd /opt/app/999-multibots-telegraf
docker compose down
docker-compose up --build -d
```

## MCP конфигурация
```json
{
  "mcpServers": {
    "googlesheets_composio": {
      "url": "https://mcp.composio.dev/googlesheets/sour-old-lion-KK2T7-"
    },
    "googlesuper_composio": {
      "url": "https://mcp.composio.dev/googlesuper/calm-damp-magician-B-f2iC"
    },
    "supabase_composio": {
      "url": "https://mcp.composio.dev/supabase/calm-damp-magician-B-f2iC"
    },
    "gmail_composio": {
      "url": "https://mcp.composio.dev/gmail/calm-damp-magician-B-f2iC"
    },
    "telegram-mcp": {
      "command": "telegram-mcp",
      "env": {
        "TG_APP_ID": "94892",
        "TG_API_HASH": "cacf9ad137d228611b49b2ecc6d68d43"
      }
    },
    "googlemeet_composio": {
      "url": "https://mcp.composio.dev/googlemeet/calm-damp-magician-B-f2iC"
    },
    "youtube_composio": {
      "url": "https://mcp.composio.dev/youtube/calm-damp-magician-B-f2iC"
    },
    "github_composio": {
      "url": "https://mcp.composio.dev/github/calm-damp-magician-B-f2iC"
    }
  }
}
```

## Платежная система
Для работы с балансом пользователей используется специальная SQL-функция `get_user_balance`, которая вычисляет баланс на основе записей в таблице `payments_v2`.

### Правила обработки платежей
1. Все платежи должны проходить через централизованный процессор payment/process
2. Никогда не изменять напрямую баланс пользователя в базе данных
3. Всегда использовать только одну запись в payments_v2 на транзакцию
4. Всегда проверять наличие существующего платежа по полям operation_id или inv_id

### Типы транзакций
1. money_income - пополнение баланса (положительное значение)
2. money_expense - списание средств (отрицательное значение)

## Тестирование
Проект использует собственную систему тестирования в директории `src/test-utils`.
НИКОГДА не использовать Jest или другие сторонние фреймворки для тестирования!

## Система маршрутизации задач (Agent Router)
В проекте реализована система маршрутизации задач (Agent Router), которая:
- Распределяет задачи между агентами на основе их возможностей
- Учитывает приоритеты задач при маршрутизации
- Обеспечивает выбор следующей задачи для обработки с учетом приоритета

## Последнее обновление
12.04.2025