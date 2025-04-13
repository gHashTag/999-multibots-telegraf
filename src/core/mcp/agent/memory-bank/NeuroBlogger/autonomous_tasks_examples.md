# Примеры использования таблицы autonomous_tasks

## 1. Создание новой задачи

```typescript
// TypeScript пример создания задачи с использованием Supabase
const createTask = async (
  telegramId: number,
  botName: string,
  taskType: string,
  description: string,
  priority: number = 5,
  metadata: Record<string, any> = {}
) => {
  const { data, error } = await supabase.rpc('create_autonomous_task', {
    p_telegram_id: telegramId,
    p_bot_name: botName,
    p_type: taskType,
    p_description: description,
    p_priority: priority,
    p_metadata: metadata
  });

  if (error) {
    console.error('Error creating task:', error);
    return null;
  }

  return data; // Вернет UUID новой задачи
};
```

```sql
-- SQL пример создания задачи напрямую
SELECT create_autonomous_task(
  123456789, -- telegram_id
  'my_bot', -- bot_name
  'CODE_GENERATION', -- type
  'Generate a function to parse JSON data', -- description
  8, -- priority
  '{"language": "typescript", "framework": "express"}' -- metadata
);
```

## 2. Получение следующей задачи с учетом зависимостей

```typescript
// TypeScript пример получения следующей задачи для пользователя
const getNextTask = async (telegramId: number, botName: string) => {
  const { data, error } = await supabase.rpc('get_next_autonomous_task', {
    p_telegram_id: telegramId,
    p_bot_name: botName
  });

  if (error) {
    console.error('Error getting next task:', error);
    return null;
  }

  return data; // Вернет задачу в формате JSON или null, если нет доступных задач
};
```

```sql
-- SQL пример получения следующей задачи
SELECT get_next_autonomous_task(123456789, 'my_bot');
```

## 3. Декомпозиция задачи на подзадачи

```typescript
// TypeScript пример декомпозиции задачи
const decomposeTask = async (parentTaskId: string, subtasks: any[]) => {
  const { data, error } = await supabase.rpc('decompose_autonomous_task', {
    p_parent_task_id: parentTaskId,
    p_subtasks: subtasks
  });

  if (error) {
    console.error('Error decomposing task:', error);
    return false;
  }

  return data; // Вернет true при успешной декомпозиции
};

// Пример массива подзадач
const subtasks = [
  {
    type: 'RESEARCH',
    description: 'Research best practices for API design',
    priority: 7,
    metadata: { stage: 'planning' }
  },
  {
    type: 'CODE_GENERATION',
    description: 'Generate API endpoints based on research',
    priority: 6,
    dependencies: [], // Может содержать ID других подзадач
    metadata: { stage: 'implementation' }
  },
  {
    type: 'TESTING',
    description: 'Write tests for the generated API',
    priority: 5,
    metadata: { stage: 'testing' }
  }
];
```

```sql
-- SQL пример декомпозиции задачи
SELECT decompose_autonomous_task(
  'e4b5e567-7dcd-4e7a-8504-1a53d9d4e8f2', -- parent_task_id
  '[
    {
      "type": "RESEARCH",
      "description": "Research best practices for API design",
      "priority": 7,
      "metadata": {"stage": "planning"}
    },
    {
      "type": "CODE_GENERATION",
      "description": "Generate API endpoints based on research",
      "priority": 6,
      "metadata": {"stage": "implementation"}
    },
    {
      "type": "TESTING",
      "description": "Write tests for the generated API",
      "priority": 5,
      "metadata": {"stage": "testing"}
    }
  ]'::jsonb
);
```

## 4. Обновление статуса задачи

```typescript
// TypeScript пример обновления статуса задачи
const updateTaskStatus = async (
  taskId: string,
  status: string,
  result: Record<string, any> = null
) => {
  const { data, error } = await supabase.rpc('update_autonomous_task_status', {
    p_task_id: taskId,
    p_status: status,
    p_result: result
  });

  if (error) {
    console.error('Error updating task status:', error);
    return false;
  }

  return data; // Вернет true при успешном обновлении
};
```

```sql
-- SQL пример обновления статуса задачи
SELECT update_autonomous_task_status(
  'e4b5e567-7dcd-4e7a-8504-1a53d9d4e8f2', -- task_id
  'COMPLETED', -- status
  '{"output": "Function successfully generated", "code": "function parseData(json) {...}"}' -- result
);
```

## 5. Делегирование задачи агенту

```typescript
// TypeScript пример делегирования задачи агенту
const delegateTaskToAgent = async (taskId: string, agentId: string) => {
  const { data, error } = await supabase.rpc('delegate_autonomous_task_to_agent', {
    p_task_id: taskId,
    p_agent_id: agentId
  });

  if (error) {
    console.error('Error delegating task to agent:', error);
    return false;
  }

  return data; // Вернет true при успешном делегировании
};
```

```sql
-- SQL пример делегирования задачи агенту
SELECT delegate_autonomous_task_to_agent(
  'e4b5e567-7dcd-4e7a-8504-1a53d9d4e8f2', -- task_id
  'code-gen-agent-001' -- agent_id
);
```

## 6. Получение задачи с её подзадачами

```typescript
// TypeScript пример получения задачи с подзадачами
const getTaskWithSubtasks = async (taskId: string) => {
  const { data, error } = await supabase.rpc('get_autonomous_task_with_subtasks', {
    p_task_id: taskId
  });

  if (error) {
    console.error('Error getting task with subtasks:', error);
    return null;
  }

  return data; // Вернет задачу с массивом подзадач
};
```

```sql
-- SQL пример получения задачи с подзадачами
SELECT get_autonomous_task_with_subtasks('e4b5e567-7dcd-4e7a-8504-1a53d9d4e8f2');
```

## 7. Получение статистики по агентам

```typescript
// TypeScript пример получения статистики по агентам
const getAgentStatistics = async (fromDate?: Date, toDate?: Date) => {
  const { data, error } = await supabase.rpc('get_agent_statistics', {
    p_from_date: fromDate?.toISOString(),
    p_to_date: toDate?.toISOString()
  });

  if (error) {
    console.error('Error getting agent statistics:', error);
    return null;
  }

  return data; // Вернет массив статистики по агентам
};
```

```sql
-- SQL пример получения статистики по агентам за последние 30 дней
SELECT * FROM get_agent_statistics(now() - interval '30 days', now());
```

## 8. Получение статистики по задачам пользователя

```typescript
// TypeScript пример получения статистики по задачам пользователя
const getUserTaskStatistics = async (
  telegramId: number,
  botName: string,
  fromDate?: Date,
  toDate?: Date
) => {
  const { data, error } = await supabase.rpc('get_user_task_statistics', {
    p_telegram_id: telegramId,
    p_bot_name: botName,
    p_from_date: fromDate?.toISOString(),
    p_to_date: toDate?.toISOString()
  });

  if (error) {
    console.error('Error getting user task statistics:', error);
    return null;
  }

  return data; // Вернет JSON-объект со статистикой
};
```

```sql
-- SQL пример получения статистики по задачам пользователя
SELECT get_user_task_statistics(123456789, 'my_bot');
```

## 9. Массовое обновление приоритетов задач

```typescript
// TypeScript пример массового обновления приоритетов задач
const updateTasksPriority = async (taskIds: string[], priority: number) => {
  const { data, error } = await supabase.rpc('update_autonomous_tasks_priority', {
    p_task_ids: JSON.stringify(taskIds),
    p_priority: priority
  });

  if (error) {
    console.error('Error updating tasks priority:', error);
    return 0;
  }

  return data; // Вернет количество обновленных задач
};
```

```sql
-- SQL пример массового обновления приоритетов задач
SELECT update_autonomous_tasks_priority(
  '["e4b5e567-7dcd-4e7a-8504-1a53d9d4e8f2", "a1b2c3d4-e5f6-4a5b-9c0d-1e2f3a4b5c6d"]'::jsonb, 
  10
);
```

## 10. Использование представления доступных задач

```typescript
// TypeScript пример использования представления доступных задач
const getAvailableTasks = async (telegramId: number, botName: string) => {
  const { data, error } = await supabase
    .from('available_autonomous_tasks')
    .select('*')
    .eq('telegram_id', telegramId)
    .eq('bot_name', botName)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error getting available tasks:', error);
    return [];
  }

  return data; // Вернет массив доступных задач
};
```

```sql
-- SQL пример использования представления доступных задач
SELECT * 
FROM available_autonomous_tasks
WHERE telegram_id = 123456789
AND bot_name = 'my_bot'
LIMIT 10;
```

## 11. Получение задач с незавершенными зависимостями

```typescript
// TypeScript пример получения задач с незавершенными зависимостями
const getTasksWithPendingDependencies = async (telegramId: number, botName: string) => {
  const { data, error } = await supabase
    .from('tasks_with_pending_dependencies')
    .select('*')
    .eq('telegram_id', telegramId)
    .eq('bot_name', botName)
    .order('priority', { ascending: false });

  if (error) {
    console.error('Error getting tasks with pending dependencies:', error);
    return [];
  }

  return data; // Вернет массив задач с незавершенными зависимостями
};
```

```sql
-- SQL пример получения задач с незавершенными зависимостями
SELECT * 
FROM tasks_with_pending_dependencies
WHERE telegram_id = 123456789
AND bot_name = 'my_bot';
```

## 12. Получение всех задач по типу для пользователя

```typescript
// TypeScript пример получения всех задач определенного типа
const getTasksByType = async (telegramId: number, botName: string, taskType: string) => {
  const { data, error } = await supabase
    .from('autonomous_tasks')
    .select('*')
    .eq('telegram_id', telegramId)
    .eq('bot_name', botName)
    .eq('type', taskType)
    .order('status');

  if (error) {
    console.error('Error getting tasks by type:', error);
    return [];
  }

  return data; // Вернет массив задач определенного типа
};
```

```sql
-- SQL пример получения всех задач определенного типа
SELECT * 
FROM autonomous_tasks
WHERE telegram_id = 123456789
AND bot_name = 'my_bot'
AND type = 'CODE_GENERATION'
ORDER BY status, priority DESC;
```