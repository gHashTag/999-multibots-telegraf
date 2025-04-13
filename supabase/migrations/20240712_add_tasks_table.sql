-- Создаем таблицу задач для автономных агентов
CREATE TABLE IF NOT EXISTS public.tasks (
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
    parent_task_id UUID REFERENCES public.tasks(id), -- ID родительской задачи (для подзадач)
    assigned_agent_id VARCHAR(255), -- ID агента, которому назначена задача
    is_subtask BOOLEAN DEFAULT FALSE, -- Флаг, является ли задача подзадачей
    subtask_results JSONB DEFAULT '{}'::jsonb, -- Результаты выполнения подзадач
    
    -- Внешний ключ на пользователя
    CONSTRAINT tasks_telegram_id_bot_name_fkey 
        FOREIGN KEY (telegram_id, bot_name) 
        REFERENCES users(telegram_id, bot_name)
);

-- Создаем индексы для оптимизации запросов
CREATE INDEX IF NOT EXISTS tasks_telegram_id_bot_name_idx ON public.tasks(telegram_id, bot_name);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON public.tasks(status);
CREATE INDEX IF NOT EXISTS tasks_priority_idx ON public.tasks(priority);
CREATE INDEX IF NOT EXISTS tasks_parent_task_id_idx ON public.tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS tasks_external_id_idx ON public.tasks(external_id);
CREATE INDEX IF NOT EXISTS tasks_assigned_agent_id_idx ON public.tasks(assigned_agent_id);

-- Триггер для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER update_tasks_updated_at_trigger
BEFORE UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION update_tasks_updated_at();

-- Добавляем комментарии к таблице и полям для документации
COMMENT ON TABLE public.tasks IS 'Таблица для хранения задач автономных агентов';
COMMENT ON COLUMN public.tasks.id IS 'Уникальный идентификатор задачи';
COMMENT ON COLUMN public.tasks.external_id IS 'Внешний ID задачи, используемый внутри системы агентов';
COMMENT ON COLUMN public.tasks.telegram_id IS 'ID пользователя в Telegram';
COMMENT ON COLUMN public.tasks.bot_name IS 'Имя бота, в контексте которого создана задача';
COMMENT ON COLUMN public.tasks.type IS 'Тип задачи (CODE_GENERATION, DOCUMENTATION, и т.д.)';
COMMENT ON COLUMN public.tasks.description IS 'Описание задачи';
COMMENT ON COLUMN public.tasks.status IS 'Статус задачи (PENDING, IN_PROGRESS, COMPLETED, и т.д.)';
COMMENT ON COLUMN public.tasks.priority IS 'Приоритет задачи от 1 до 10';
COMMENT ON COLUMN public.tasks.dependencies IS 'JSON массив ID задач, от которых зависит текущая задача';
COMMENT ON COLUMN public.tasks.metadata IS 'Дополнительные метаданные задачи в формате JSON';
COMMENT ON COLUMN public.tasks.result IS 'Результат выполнения задачи в формате JSON';
COMMENT ON COLUMN public.tasks.parent_task_id IS 'ID родительской задачи (если это подзадача)';
COMMENT ON COLUMN public.tasks.assigned_agent_id IS 'ID агента, которому назначена задача';
COMMENT ON COLUMN public.tasks.is_subtask IS 'Флаг, указывающий является ли задача подзадачей';
COMMENT ON COLUMN public.tasks.subtask_results IS 'Результаты выполнения подзадач в формате JSON';

-- Создаем функции для работы с задачами

-- Функция для создания новой задачи
CREATE OR REPLACE FUNCTION create_task(
    p_telegram_id BIGINT,
    p_bot_name VARCHAR(100),
    p_type VARCHAR(50),
    p_description TEXT,
    p_priority INTEGER DEFAULT 1,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_external_id VARCHAR(255) DEFAULT NULL,
    p_parent_task_id UUID DEFAULT NULL,
    p_is_subtask BOOLEAN DEFAULT FALSE
) RETURNS UUID AS $$
DECLARE
    v_task_id UUID;
BEGIN
    INSERT INTO public.tasks (
        telegram_id,
        bot_name,
        type,
        description,
        priority,
        metadata,
        external_id,
        parent_task_id,
        is_subtask
    ) VALUES (
        p_telegram_id,
        p_bot_name,
        p_type,
        p_description,
        p_priority,
        p_metadata,
        p_external_id,
        p_parent_task_id,
        p_is_subtask
    ) RETURNING id INTO v_task_id;
    
    RETURN v_task_id;
END;
$$ LANGUAGE plpgsql;

-- Функция для обновления статуса задачи
CREATE OR REPLACE FUNCTION update_task_status(
    p_task_id UUID,
    p_status VARCHAR(20),
    p_result JSONB DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    UPDATE public.tasks
    SET 
        status = p_status,
        result = COALESCE(p_result, result),
        updated_at = now()
    WHERE id = p_task_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Функция для делегирования задачи агенту
CREATE OR REPLACE FUNCTION delegate_task_to_agent(
    p_task_id UUID,
    p_agent_id VARCHAR(255)
) RETURNS BOOLEAN AS $$
BEGIN
    UPDATE public.tasks
    SET 
        assigned_agent_id = p_agent_id,
        status = 'DELEGATED',
        updated_at = now()
    WHERE id = p_task_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Функция для получения доступных задач с наивысшим приоритетом
CREATE OR REPLACE FUNCTION get_next_task(
    p_telegram_id BIGINT,
    p_bot_name VARCHAR(100)
) RETURNS JSONB AS $$
DECLARE
    v_task JSONB;
BEGIN
    -- Выбираем задачу со статусом PENDING с наивысшим приоритетом
    -- и без незавершенных зависимостей
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
        )
    INTO v_task
    FROM public.tasks t
    WHERE t.telegram_id = p_telegram_id
    AND t.bot_name = p_bot_name
    AND t.status = 'PENDING'
    -- Дополнительно здесь можно добавить проверку зависимостей
    ORDER BY t.priority DESC, t.created_at ASC
    LIMIT 1;
    
    RETURN v_task;
END;
$$ LANGUAGE plpgsql;

-- Представление для получения статистики по задачам
CREATE OR REPLACE VIEW task_statistics AS
SELECT 
    telegram_id,
    bot_name,
    COUNT(*) AS total_tasks,
    SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending_tasks,
    SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) AS in_progress_tasks,
    SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_tasks,
    SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failed_tasks,
    SUM(CASE WHEN status = 'DELEGATED' THEN 1 ELSE 0 END) AS delegated_tasks,
    SUM(CASE WHEN status = 'DECOMPOSED' THEN 1 ELSE 0 END) AS decomposed_tasks,
    AVG(priority) AS avg_priority,
    SUM(CASE WHEN is_subtask THEN 1 ELSE 0 END) AS subtasks_count
FROM public.tasks
GROUP BY telegram_id, bot_name; 