# Схема таблицы задач в NeuroBlogger

## Структура таблицы `autonomous_tasks`

```sql
CREATE TABLE IF NOT EXISTS public.autonomous_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id VARCHAR(255), -- Внешний ID задачи (используется для уникальной идентификации в системе агентов)
    telegram_id BIGINT NOT NULL, -- ID пользователя в Telegram
    bot_name VARCHAR(100) NOT NULL, -- Имя бота
    type VARCHAR(50) NOT NULL, -- Тип задачи (соответствует TaskType из кода)
    description TEXT NOT NULL, -- Описание задачи
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- Статус задачи
    priority INTEGER NOT NULL DEFAULT 1, -- Приоритет задачи (1-10)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), -- Дата создания
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), -- Дата обновления
    dependencies JSONB DEFAULT '[]'::jsonb, -- Зависимости от других задач (массив ID)
    metadata JSONB DEFAULT '{}'::jsonb, -- Метаданные задачи
    result JSONB DEFAULT NULL, -- Результат выполнения задачи
    parent_task_id UUID REFERENCES public.autonomous_tasks(id), -- ID родительской задачи (для подзадач)
    assigned_agent_id VARCHAR(255), -- ID агента, которому назначена задача
    is_subtask BOOLEAN DEFAULT FALSE, -- Флаг, является ли задача подзадачей
    subtask_results JSONB DEFAULT '{}'::jsonb -- Результаты выполнения подзадач
);
```

## Индексы

```sql
CREATE INDEX IF NOT EXISTS autonomous_tasks_telegram_id_bot_name_idx ON public.autonomous_tasks(telegram_id, bot_name);
CREATE INDEX IF NOT EXISTS autonomous_tasks_status_idx ON public.autonomous_tasks(status);
CREATE INDEX IF NOT EXISTS autonomous_tasks_priority_idx ON public.autonomous_tasks(priority);
CREATE INDEX IF NOT EXISTS autonomous_tasks_parent_task_id_idx ON public.autonomous_tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS autonomous_tasks_external_id_idx ON public.autonomous_tasks(external_id);
CREATE INDEX IF NOT EXISTS autonomous_tasks_assigned_agent_id_idx ON public.autonomous_tasks(assigned_agent_id);
```

## Триггеры

```sql
-- Триггер для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_autonomous_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER update_autonomous_tasks_updated_at_trigger
BEFORE UPDATE ON public.autonomous_tasks
FOR EACH ROW
EXECUTE FUNCTION update_autonomous_tasks_updated_at();

-- Триггер для автоматического обновления статуса родительской задачи
CREATE OR REPLACE TRIGGER update_parent_autonomous_task_status_trigger
AFTER UPDATE OF status ON public.autonomous_tasks
FOR EACH ROW
WHEN (OLD.status != NEW.status AND NEW.parent_task_id IS NOT NULL)
EXECUTE FUNCTION update_parent_autonomous_task_status();
```

## Основные функции для работы с задачами

### 1. Создание новой задачи

```sql
CREATE OR REPLACE FUNCTION create_autonomous_task(
    p_telegram_id BIGINT,
    p_bot_name VARCHAR(100),
    p_type VARCHAR(50),
    p_description TEXT,
    p_priority INTEGER DEFAULT 1,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_external_id VARCHAR(255) DEFAULT NULL,
    p_parent_task_id UUID DEFAULT NULL,
    p_is_subtask BOOLEAN DEFAULT FALSE,
    p_dependencies JSONB DEFAULT '[]'::jsonb
) RETURNS UUID AS $$
DECLARE
    v_task_id UUID;
BEGIN
    INSERT INTO public.autonomous_tasks (
        telegram_id,
        bot_name,
        type,
        description,
        priority,
        metadata,
        external_id,
        parent_task_id,
        is_subtask,
        dependencies
    ) VALUES (
        p_telegram_id,
        p_bot_name,
        p_type,
        p_description,
        p_priority,
        p_metadata,
        p_external_id,
        p_parent_task_id,
        p_is_subtask,
        p_dependencies
    ) RETURNING id INTO v_task_id;
    
    RETURN v_task_id;
END;
$$ LANGUAGE plpgsql;
```

### 2. Обновление статуса задачи

```sql
CREATE OR REPLACE FUNCTION update_autonomous_task_status(
    p_task_id UUID,
    p_status VARCHAR(20),
    p_result JSONB DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    UPDATE public.autonomous_tasks
    SET 
        status = p_status,
        result = COALESCE(p_result, result),
        updated_at = now()
    WHERE id = p_task_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;
```

### 3. Делегирование задачи агенту

```sql
CREATE OR REPLACE FUNCTION delegate_autonomous_task_to_agent(
    p_task_id UUID,
    p_agent_id VARCHAR(255)
) RETURNS BOOLEAN AS $$
BEGIN
    UPDATE public.autonomous_tasks
    SET 
        assigned_agent_id = p_agent_id,
        status = 'DELEGATED',
        updated_at = now()
    WHERE id = p_task_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;
```

## Расширенные функции для работы с задачами

### 1. Получение следующей задачи с учетом зависимостей

```sql
CREATE OR REPLACE FUNCTION get_next_autonomous_task(
    p_telegram_id BIGINT,
    p_bot_name VARCHAR(100)
) RETURNS JSONB AS $$
DECLARE
    v_task_id UUID;
    v_dependencies JSONB;
    v_pending_dependencies BOOLEAN;
    v_result JSONB;
BEGIN
    -- Выбираем задачи со статусом PENDING с наивысшим приоритетом
    FOR v_task_id IN 
        SELECT id
        FROM public.autonomous_tasks
        WHERE telegram_id = p_telegram_id
        AND bot_name = p_bot_name
        AND status = 'PENDING'
        ORDER BY priority DESC, created_at ASC
    LOOP
        -- Получаем зависимости задачи
        SELECT dependencies INTO v_dependencies
        FROM public.autonomous_tasks
        WHERE id = v_task_id;
        
        -- По умолчанию считаем, что нет ожидающих зависимостей
        v_pending_dependencies := FALSE;
        
        -- Если есть зависимости, проверяем их статус
        IF v_dependencies IS NOT NULL AND jsonb_array_length(v_dependencies) > 0 THEN
            -- Проверяем, есть ли незавершенные зависимости
            SELECT EXISTS (
                SELECT 1
                FROM public.autonomous_tasks
                WHERE id::text IN (
                    SELECT jsonb_array_elements_text(v_dependencies)
                )
                AND status NOT IN ('COMPLETED', 'DECOMPOSED')
            ) INTO v_pending_dependencies;
        END IF;
        
        -- Если все зависимости выполнены или их нет, возвращаем эту задачу
        IF NOT v_pending_dependencies THEN
            SELECT
                jsonb_build_object(
                    'id', t.id,
                    'external_id', t.external_id,
                    'type', t.type,
                    'description', t.description,
                    'status', t.status,
                    'priority', t.priority,
                    'created_at', t.created_at,
                    'updated_at', t.updated_at,
                    'dependencies', t.dependencies,
                    'metadata', t.metadata,
                    'parent_task_id', t.parent_task_id,
                    'is_subtask', t.is_subtask
                ) INTO v_result
            FROM public.autonomous_tasks t
            WHERE t.id = v_task_id;
            
            RETURN v_result;
        END IF;
    END LOOP;
    
    -- Если не нашли подходящих задач
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
```

### 2. Автоматическое обновление статуса родительской задачи

```sql
CREATE OR REPLACE FUNCTION update_parent_autonomous_task_status() 
RETURNS TRIGGER AS $$
DECLARE
    v_parent_id UUID;
    v_all_completed BOOLEAN;
    v_any_failed BOOLEAN;
    v_subtask_results JSONB;
BEGIN
    -- Получаем ID родительской задачи
    v_parent_id := NEW.parent_task_id;
    
    -- Если родительской задачи нет, то просто выходим
    IF v_parent_id IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- Проверяем, все ли подзадачи завершены и есть ли ошибки
    SELECT 
        (COUNT(*) FILTER (WHERE status != 'COMPLETED' AND status != 'FAILED') = 0) AS all_completed,
        (COUNT(*) FILTER (WHERE status = 'FAILED') > 0) AS any_failed,
        COALESCE(jsonb_object_agg(id::text, result), '{}'::jsonb) AS results
    INTO v_all_completed, v_any_failed, v_subtask_results
    FROM public.autonomous_tasks
    WHERE parent_task_id = v_parent_id;
    
    -- Если не все подзадачи завершены, то ничего не делаем
    IF NOT v_all_completed THEN
        RETURN NEW;
    END IF;
    
    -- Если какая-то подзадача завершилась с ошибкой, то задача считается FAILED
    -- В противном случае - COMPLETED
    IF v_any_failed THEN
        UPDATE public.autonomous_tasks
        SET 
            status = 'FAILED',
            subtask_results = v_subtask_results,
            result = jsonb_build_object(
                'status', 'FAILED',
                'message', 'One or more subtasks failed',
                'subtask_results', v_subtask_results
            )
        WHERE id = v_parent_id;
    ELSE
        UPDATE public.autonomous_tasks
        SET 
            status = 'COMPLETED',
            subtask_results = v_subtask_results,
            result = jsonb_build_object(
                'status', 'COMPLETED',
                'message', 'All subtasks completed successfully',
                'subtask_results', v_subtask_results
            )
        WHERE id = v_parent_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### 3. Декомпозиция задачи на подзадачи

```sql
CREATE OR REPLACE FUNCTION decompose_autonomous_task(
    p_parent_task_id UUID,
    p_subtasks JSONB
) RETURNS BOOLEAN AS $$
DECLARE
    v_subtask JSONB;
    v_parent_task public.autonomous_tasks%ROWTYPE;
    v_subtask_id UUID;
BEGIN
    -- Получаем родительскую задачу
    SELECT * INTO v_parent_task 
    FROM public.autonomous_tasks 
    WHERE id = p_parent_task_id;
    
    -- Если родительской задачи нет, то возвращаем ошибку
    IF v_parent_task.id IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Меняем статус родительской задачи на DECOMPOSED
    UPDATE public.autonomous_tasks
    SET 
        status = 'DECOMPOSED',
        updated_at = now()
    WHERE id = p_parent_task_id;
    
    -- Создаем все подзадачи
    FOR v_subtask IN SELECT * FROM jsonb_array_elements(p_subtasks) 
    LOOP
        -- Создаем подзадачу с ссылкой на родительскую задачу
        v_subtask_id := create_autonomous_task(
            v_parent_task.telegram_id,
            v_parent_task.bot_name,
            COALESCE(v_subtask->>'type', v_parent_task.type),
            v_subtask->>'description',
            COALESCE((v_subtask->>'priority')::integer, v_parent_task.priority),
            COALESCE(v_subtask->'metadata', '{}'::jsonb),
            v_subtask->>'external_id',
            p_parent_task_id,
            TRUE,
            COALESCE(v_subtask->'dependencies', '[]'::jsonb)
        );
    END LOOP;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
```

### 4. Получение задачи с подзадачами

```sql
CREATE OR REPLACE FUNCTION get_autonomous_task_with_subtasks(
    p_task_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_task JSONB;
    v_subtasks JSONB;
BEGIN
    -- Получаем основную задачу
    SELECT
        jsonb_build_object(
            'id', t.id,
            'external_id', t.external_id,
            'telegram_id', t.telegram_id,
            'bot_name', t.bot_name,
            'type', t.type,
            'description', t.description,
            'status', t.status,
            'priority', t.priority,
            'created_at', t.created_at,
            'updated_at', t.updated_at,
            'dependencies', t.dependencies,
            'metadata', t.metadata,
            'result', t.result,
            'assigned_agent_id', t.assigned_agent_id,
            'is_subtask', t.is_subtask,
            'parent_task_id', t.parent_task_id
        )
    INTO v_task
    FROM public.autonomous_tasks t
    WHERE t.id = p_task_id;
    
    -- Если задача не найдена, возвращаем NULL
    IF v_task IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Получаем подзадачи (если есть)
    SELECT
        jsonb_agg(
            jsonb_build_object(
                'id', st.id,
                'external_id', st.external_id,
                'type', st.type,
                'description', st.description,
                'status', st.status,
                'priority', st.priority,
                'created_at', st.created_at,
                'updated_at', st.updated_at,
                'dependencies', st.dependencies,
                'metadata', st.metadata,
                'result', st.result,
                'assigned_agent_id', st.assigned_agent_id
            )
        )
    INTO v_subtasks
    FROM public.autonomous_tasks st
    WHERE st.parent_task_id = p_task_id;
    
    -- Добавляем подзадачи к основной задаче
    v_task := v_task || jsonb_build_object('subtasks', COALESCE(v_subtasks, '[]'::jsonb));
    
    RETURN v_task;
END;
$$ LANGUAGE plpgsql;
```

### 5. Получение статистики по агентам

```sql
CREATE OR REPLACE FUNCTION get_agent_statistics(
    p_from_date TIMESTAMPTZ DEFAULT NULL,
    p_to_date TIMESTAMPTZ DEFAULT NULL
) RETURNS TABLE (
    agent_id VARCHAR(255),
    total_tasks BIGINT,
    completed_tasks BIGINT,
    failed_tasks BIGINT,
    avg_execution_time_seconds NUMERIC,
    avg_priority NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        assigned_agent_id,
        COUNT(*) AS total_tasks,
        SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_tasks,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failed_tasks,
        AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) AS avg_execution_time_seconds,
        AVG(priority) AS avg_priority
    FROM public.autonomous_tasks
    WHERE assigned_agent_id IS NOT NULL
      AND (p_from_date IS NULL OR created_at >= p_from_date)
      AND (p_to_date IS NULL OR created_at <= p_to_date)
    GROUP BY assigned_agent_id
    ORDER BY total_tasks DESC;
END;
$$ LANGUAGE plpgsql;
```

### 6. Получение статистики по задачам пользователя

```sql
CREATE OR REPLACE FUNCTION get_user_task_statistics(
    p_telegram_id BIGINT,
    p_bot_name VARCHAR(100),
    p_from_date TIMESTAMPTZ DEFAULT NULL,
    p_to_date TIMESTAMPTZ DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total_tasks', COUNT(*),
        'pending_tasks', SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END),
        'in_progress_tasks', SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END),
        'completed_tasks', SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END),
        'failed_tasks', SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END),
        'delegated_tasks', SUM(CASE WHEN status = 'DELEGATED' THEN 1 ELSE 0 END),
        'decomposed_tasks', SUM(CASE WHEN status = 'DECOMPOSED' THEN 1 ELSE 0 END),
        'avg_completion_time', (
            SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at)))
            FROM public.autonomous_tasks
            WHERE telegram_id = p_telegram_id
            AND bot_name = p_bot_name
            AND status = 'COMPLETED'
            AND (p_from_date IS NULL OR created_at >= p_from_date)
            AND (p_to_date IS NULL OR created_at <= p_to_date)
        ),
        'avg_priority', AVG(priority),
        'task_types', (
            SELECT jsonb_object_agg(type, count)
            FROM (
                SELECT type, COUNT(*) as count
                FROM public.autonomous_tasks
                WHERE telegram_id = p_telegram_id
                AND bot_name = p_bot_name
                AND (p_from_date IS NULL OR created_at >= p_from_date)
                AND (p_to_date IS NULL OR created_at <= p_to_date)
                GROUP BY type
            ) AS type_counts
        ),
        'agent_distribution', (
            SELECT jsonb_object_agg(assigned_agent_id, count)
            FROM (
                SELECT assigned_agent_id, COUNT(*) as count
                FROM public.autonomous_tasks
                WHERE telegram_id = p_telegram_id
                AND bot_name = p_bot_name
                AND assigned_agent_id IS NOT NULL
                AND (p_from_date IS NULL OR created_at >= p_from_date)
                AND (p_to_date IS NULL OR created_at <= p_to_date)
                GROUP BY assigned_agent_id
            ) AS agent_counts
        )
    ) INTO v_result
    FROM public.autonomous_tasks
    WHERE telegram_id = p_telegram_id
    AND bot_name = p_bot_name
    AND (p_from_date IS NULL OR created_at >= p_from_date)
    AND (p_to_date IS NULL OR created_at <= p_to_date);
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;
```

### 7. Массовое обновление приоритетов задач

```sql
CREATE OR REPLACE FUNCTION update_autonomous_tasks_priority(
    p_task_ids JSONB,
    p_priority INTEGER
) RETURNS INTEGER AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    -- Обновляем приоритеты для указанных задач
    WITH task_ids AS (
        SELECT jsonb_array_elements_text(p_task_ids) AS id
    )
    UPDATE public.autonomous_tasks
    SET 
        priority = p_priority,
        updated_at = now()
    FROM task_ids
    WHERE autonomous_tasks.id::text = task_ids.id
    AND status = 'PENDING';
    
    -- Возвращаем количество обновленных задач
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql;
```

## Представления для работы с задачами

### 1. Представление доступных для выполнения задач

```sql
CREATE OR REPLACE VIEW available_autonomous_tasks AS
WITH tasks_with_dependencies AS (
    SELECT 
        t.id,
        t.external_id,
        t.telegram_id,
        t.bot_name,
        t.type,
        t.description,
        t.status,
        t.priority,
        t.created_at,
        t.updated_at,
        t.metadata,
        t.dependencies,
        t.parent_task_id,
        t.assigned_agent_id,
        t.is_subtask,
        CASE 
            WHEN jsonb_array_length(t.dependencies) = 0 THEN true
            ELSE (
                SELECT 
                    COALESCE(bool_and(dep.status IN ('COMPLETED', 'DECOMPOSED')), true)
                FROM 
                    public.autonomous_tasks dep
                WHERE 
                    dep.id::text IN (SELECT jsonb_array_elements_text(t.dependencies))
            )
        END AS dependencies_met
    FROM 
        public.autonomous_tasks t
    WHERE 
        t.status = 'PENDING'
)
SELECT 
    id,
    external_id,
    telegram_id,
    bot_name,
    type,
    description,
    status,
    priority,
    created_at,
    updated_at,
    metadata,
    dependencies,
    parent_task_id,
    assigned_agent_id,
    is_subtask
FROM 
    tasks_with_dependencies
WHERE 
    dependencies_met = true
ORDER BY 
    priority DESC, created_at ASC;
```

### 2. Представление задач с незавершенными зависимостями

```sql
CREATE OR REPLACE VIEW tasks_with_pending_dependencies AS
WITH task_dependencies AS (
    SELECT 
        t.id,
        t.external_id,
        t.telegram_id,
        t.bot_name,
        t.type,
        t.description,
        t.status,
        t.priority,
        t.created_at,
        d.value AS dependency_id,
        (
            SELECT status 
            FROM public.autonomous_tasks 
            WHERE id::text = d.value::text
        ) AS dependency_status
    FROM 
        public.autonomous_tasks t,
        jsonb_array_elements_text(t.dependencies) AS d
    WHERE t.status = 'PENDING'
)
SELECT 
    td.id,
    td.external_id,
    td.telegram_id,
    td.bot_name,
    td.type,
    td.description,
    td.status,
    td.priority,
    td.created_at,
    COUNT(td.dependency_id) AS total_dependencies,
    SUM(CASE WHEN td.dependency_status IN ('COMPLETED', 'DECOMPOSED') THEN 1 ELSE 0 END) AS completed_dependencies,
    jsonb_agg(
        jsonb_build_object(
            'dependency_id', td.dependency_id,
            'status', td.dependency_status
        )
    ) AS dependencies_info
FROM 
    task_dependencies td
GROUP BY 
    td.id, td.external_id, td.telegram_id, td.bot_name, td.type, td.description, td.status, td.priority, td.created_at
HAVING 
    COUNT(td.dependency_id) > SUM(CASE WHEN td.dependency_status IN ('COMPLETED', 'DECOMPOSED') THEN 1 ELSE 0 END)
ORDER BY 
    td.priority DESC, td.created_at ASC;
```

## Статусы задач
- PENDING: Задача ожидает выполнения
- IN_PROGRESS: Задача в процессе выполнения
- COMPLETED: Задача успешно завершена
- FAILED: Задача завершилась с ошибкой
- DELEGATED: Задача делегирована агенту
- DECOMPOSED: Задача разбита на подзадачи

## Поля для приоритизации
- priority: Приоритет задачи (1-10, где 10 - наивысший приоритет)
- created_at: Дата создания задачи (для сортировки при одинаковом приоритете)

## Взаимодействие с маршрутизатором агентов
Система маршрутизации задач (Agent Router) взаимодействует с таблицей `autonomous_tasks` через функции:
1. `get_next_autonomous_task` - получение следующей задачи для обработки
2. `delegate_autonomous_task_to_agent` - назначение задачи агенту
3. `update_autonomous_task_status` - обновление статуса задачи

Представление `available_autonomous_tasks` может использоваться для эффективного получения списка задач, готовых к обработке.