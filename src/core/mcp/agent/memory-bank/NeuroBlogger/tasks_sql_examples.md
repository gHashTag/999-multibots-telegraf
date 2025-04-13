# Примеры SQL-запросов для работы с таблицей задач

## Получение всех задач пользователя

```sql
SELECT *
FROM public.tasks
WHERE telegram_id = 123456789
AND bot_name = 'my_bot'
ORDER BY priority DESC, created_at ASC;
```

## Получение всех задач в статусе PENDING

```sql
SELECT *
FROM public.tasks
WHERE status = 'PENDING'
ORDER BY priority DESC, created_at ASC;
```

## Получение задач, назначенных конкретному агенту

```sql
SELECT *
FROM public.tasks
WHERE assigned_agent_id = 'agent_id_123'
AND status = 'IN_PROGRESS';
```

## Получение количества задач по статусам

```sql
SELECT 
    status,
    COUNT(*) AS task_count
FROM public.tasks
GROUP BY status
ORDER BY task_count DESC;
```

## Получение задач с высоким приоритетом

```sql
SELECT *
FROM public.tasks
WHERE priority >= 8
ORDER BY priority DESC, created_at ASC;
```

## Получение подзадач для конкретной родительской задачи

```sql
SELECT *
FROM public.tasks
WHERE parent_task_id = 'parent_task_uuid'
ORDER BY priority DESC, created_at ASC;
```

## Обновление статуса задачи

```sql
UPDATE public.tasks
SET 
    status = 'COMPLETED',
    result = '{"message": "Task completed successfully", "data": {}}'::jsonb,
    updated_at = now()
WHERE id = 'task_uuid';
```

## Делегирование задачи агенту

```sql
UPDATE public.tasks
SET 
    assigned_agent_id = 'agent_id_123',
    status = 'DELEGATED',
    updated_at = now()
WHERE id = 'task_uuid';
```

## Получение задач с пустыми зависимостями

```sql
SELECT *
FROM public.tasks
WHERE dependencies = '[]'::jsonb
AND status = 'PENDING'
ORDER BY priority DESC, created_at ASC;
```

## Получение задач, созданных за последние 24 часа

```sql
SELECT *
FROM public.tasks
WHERE created_at >= now() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

## Получение информации о выполненных задачах

```sql
SELECT 
    t.id,
    t.description,
    t.result,
    t.updated_at,
    t.created_at,
    (t.updated_at - t.created_at) AS execution_time
FROM public.tasks t
WHERE t.status = 'COMPLETED'
ORDER BY (t.updated_at - t.created_at) ASC;
```

## Получение статистики по времени выполнения задач

```sql
SELECT 
    type,
    COUNT(*) AS task_count,
    AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) AS avg_execution_time_seconds,
    MIN(EXTRACT(EPOCH FROM (updated_at - created_at))) AS min_execution_time_seconds,
    MAX(EXTRACT(EPOCH FROM (updated_at - created_at))) AS max_execution_time_seconds
FROM public.tasks
WHERE status = 'COMPLETED'
GROUP BY type
ORDER BY avg_execution_time_seconds DESC;
```

## Получение задач с ошибками

```sql
SELECT *
FROM public.tasks
WHERE status = 'FAILED'
ORDER BY updated_at DESC;
```

## Получение задач с определенным типом

```sql
SELECT *
FROM public.tasks
WHERE type = 'CODE_GENERATION'
ORDER BY priority DESC, created_at ASC;
```

## Получение задач с определенными метаданными

```sql
SELECT *
FROM public.tasks
WHERE metadata @> '{"language": "python"}'::jsonb
ORDER BY priority DESC, created_at ASC;
```

## Очистка старых завершенных задач

```sql
DELETE FROM public.tasks
WHERE status IN ('COMPLETED', 'FAILED')
AND updated_at < now() - INTERVAL '30 days';
```

## Назначение подзадач конкретному агенту

```sql
UPDATE public.tasks
SET 
    assigned_agent_id = 'agent_id_123',
    status = 'DELEGATED',
    updated_at = now()
WHERE parent_task_id = 'parent_task_uuid'
AND status = 'PENDING';
```

## Изменение приоритета задачи

```sql
UPDATE public.tasks
SET 
    priority = 10,
    updated_at = now()
WHERE id = 'task_uuid';
```

## Получение статистики по агентам

```sql
SELECT 
    assigned_agent_id,
    COUNT(*) AS total_tasks,
    SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_tasks,
    SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failed_tasks,
    AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) AS avg_execution_time_seconds
FROM public.tasks
WHERE assigned_agent_id IS NOT NULL
GROUP BY assigned_agent_id
ORDER BY total_tasks DESC;
```