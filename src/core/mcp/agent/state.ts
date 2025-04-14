/**
 * Система управления состоянием автономного агента
 * Реализует долгосрочную память и контекст для агента
 */

/**
 * Типы задач для автономной системы
 */
export enum TaskType {
  SELF_IMPROVEMENT = 'SELF_IMPROVEMENT',
  CODE_GENERATION = 'CODE_GENERATION',
  CODE_ANALYSIS = 'CODE_ANALYSIS',
  CODE_REFACTORING = 'CODE_REFACTORING',
  TESTING = 'TESTING'
}

/**
 * Статусы задач
 */
export enum TaskStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

/**
 * Интерфейс задачи
 */
export interface Task {
  id: string
  type: TaskType
  description: string
  status: TaskStatus
  priority: number
  created: Date
  updated: Date
  metadata?: {
    autonomous?: boolean
    initiator?: string
    [key: string]: any
  }
}

// Интерфейс состояния агента
export interface AgentState {
  id: string
  tasks: Map<string, Task>
  context: Map<string, any>
  history: Array<{
    timestamp: Date
    action: string
    details: Record<string, any>
  }>
  currentTaskId?: string
}

// Создание нового состояния агента
export function createAgentState(id: string): AgentState {
  return {
    id,
    tasks: new Map(),
    context: new Map(),
    history: [],
  }
}

// Добавление новой задачи
export function addTask(
  state: AgentState,
  task: Omit<Task, 'id' | 'created' | 'updated' | 'status'>
): Task {
  const id = generateTaskId()
  const now = new Date()

  const newTask: Task = {
    id,
    ...task,
    status: TaskStatus.PENDING,
    created: now,
    updated: now,
    subtasks: task.subtasks || [],
    isSubtask: task.isSubtask || false,
  }

  state.tasks.set(id, newTask)

  // Логируем действие
  addToHistory(state, 'TASK_ADDED', {
    taskId: id,
    description: task.description,
  })

  return newTask
}

// Обновление статуса задачи
export function updateTaskStatus(
  state: AgentState,
  taskId: string,
  status: TaskStatus,
  result?: any
): void {
  const task = state.tasks.get(taskId)

  if (!task) {
    throw new Error(`Task with id ${taskId} not found`)
  }

  task.status = status
  task.updated = new Date()

  if (result !== undefined) {
    task.result = result
  }

  // Если задача завершена и у нее есть родительская задача, обновляем результаты в родительской задаче
  if (
    (status === TaskStatus.COMPLETED || status === TaskStatus.FAILED) &&
    task.parentTaskId
  ) {
    const parentTask = state.tasks.get(task.parentTaskId)
    if (parentTask) {
      if (!parentTask.subtaskResults) {
        parentTask.subtaskResults = {}
      }

      parentTask.subtaskResults[taskId] = {
        status,
        result: task.result,
      }

      // Проверяем, все ли подзадачи выполнены
      checkParentTaskCompletion(state, task.parentTaskId)
    }
  }

  // Логируем действие
  addToHistory(state, 'TASK_STATUS_UPDATED', {
    taskId,
    oldStatus: task.status,
    newStatus: status,
    hasResult: result !== undefined,
  })
}

/**
 * Проверяет, все ли подзадачи выполнены, и обновляет статус родительской задачи
 */
export function checkParentTaskCompletion(
  state: AgentState,
  parentTaskId: string
): void {
  const parentTask = state.tasks.get(parentTaskId)

  if (!parentTask || !parentTask.subtasks || parentTask.subtasks.length === 0) {
    return
  }

  const allSubtasksCompleted = parentTask.subtasks.every(subtaskId => {
    const subtask = state.tasks.get(subtaskId)
    return (
      subtask &&
      (subtask.status === TaskStatus.COMPLETED ||
        subtask.status === TaskStatus.FAILED)
    )
  })

  if (allSubtasksCompleted) {
    // Все подзадачи выполнены или завершились с ошибкой, объединяем результаты
    const combinedResults = parentTask.subtasks.reduce(
      (results, subtaskId) => {
        const subtask = state.tasks.get(subtaskId)
        if (subtask) {
          results[subtaskId] = {
            status: subtask.status,
            result: subtask.result,
          }
        }
        return results
      },
      {} as Record<string, any>
    )

    // Если хотя бы одна подзадача не выполнена, считаем всю задачу не выполненной
    const anyFailed = parentTask.subtasks.some(subtaskId => {
      const subtask = state.tasks.get(subtaskId)
      return subtask && subtask.status === TaskStatus.FAILED
    })

    updateTaskStatus(
      state,
      parentTaskId,
      anyFailed ? TaskStatus.FAILED : TaskStatus.COMPLETED,
      { subtaskResults: combinedResults }
    )

    // Логируем действие
    addToHistory(state, 'PARENT_TASK_COMPLETED', {
      parentTaskId,
      subtasksCount: parentTask.subtasks.length,
      anyFailed,
    })
  }
}

/**
 * Декомпозирует задачу на подзадачи (бумеранг)
 */
export function decomposeTask(
  state: AgentState,
  taskId: string,
  subtaskDescriptions: string[]
): Task[] {
  const parentTask = state.tasks.get(taskId)

  if (!parentTask) {
    throw new Error(`Task with id ${taskId} not found`)
  }

  const subtasks: Task[] = []

  // Создаем подзадачи
  for (const description of subtaskDescriptions) {
    const subtask = addTask(state, {
      type: TaskType.SUBTASK,
      description,
      priority: parentTask.priority, // Наследуем приоритет от родительской задачи
      dependencies: [], // Подзадачи не имеют зависимостей
      metadata: { parentTaskId: taskId },
      parentTaskId: taskId,
      isSubtask: true,
    })

    subtasks.push(subtask)
  }

  // Обновляем родительскую задачу
  parentTask.subtasks = subtasks.map(task => task.id)
  parentTask.status = TaskStatus.DECOMPOSED
  parentTask.updated = new Date()

  // Логируем действие
  addToHistory(state, 'TASK_DECOMPOSED', {
    taskId,
    subtasksCount: subtasks.length,
  })

  return subtasks
}

// Установка текущей задачи
export function setCurrentTask(state: AgentState, taskId: string): void {
  const task = state.tasks.get(taskId)

  if (!task) {
    throw new Error(`Task with id ${taskId} not found`)
  }

  state.currentTaskId = taskId

  // Если задача была в статусе PENDING, переводим в IN_PROGRESS
  if (task.status === TaskStatus.PENDING) {
    updateTaskStatus(state, taskId, TaskStatus.IN_PROGRESS)
  }

  // Логируем действие
  addToHistory(state, 'CURRENT_TASK_SET', { taskId })
}

// Сохранение контекста
export function setContext(state: AgentState, key: string, value: any): void {
  state.context.set(key, value)

  // Логируем действие
  addToHistory(state, 'CONTEXT_UPDATED', { key })
}

// Получение контекста
export function getContext<T>(state: AgentState, key: string): T | undefined {
  return state.context.get(key) as T | undefined
}

// Добавление записи в историю
function addToHistory(
  state: AgentState,
  action: string,
  details: Record<string, any> = {}
): void {
  state.history.push({
    timestamp: new Date(),
    action,
    details,
  })
}

// Генерация уникального ID для задачи
function generateTaskId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9)
}

// Сохранение состояния (заглушка, будет заменена на реальное сохранение в БД)
export async function saveState(state: AgentState): Promise<boolean> {
  console.log(`Saving agent state: ${state.id}`)
  // TODO: Реализовать сохранение в БД
  return true
}

// Загрузка состояния (заглушка, будет заменена на реальную загрузку из БД)
export async function loadState(stateId: string): Promise<AgentState | null> {
  console.log(`Loading agent state: ${stateId}`)
  // TODO: Реализовать загрузку из БД
  return null
}

// Вспомогательная функция для получения всех задач в виде массива
export function getAllTasks(state: AgentState): Task[] {
  return Array.from(state.tasks.values())
}

/**
 * Получение всех подзадач для указанной родительской задачи
 */
export function getSubtasks(state: AgentState, parentTaskId: string): Task[] {
  const parentTask = state.tasks.get(parentTaskId)

  if (!parentTask || !parentTask.subtasks) {
    return []
  }

  return parentTask.subtasks
    .map(subtaskId => state.tasks.get(subtaskId))
    .filter((task): task is Task => !!task)
}

/**
 * Проверяет, может ли задача быть декомпозирована
 */
export function canBeDecomposed(task: Task): boolean {
  return (
    // Задача не должна быть подзадачей
    !task.isSubtask &&
    // Задача не должна быть уже декомпозирована
    task.status !== TaskStatus.DECOMPOSED &&
    // Задача не должна быть завершена или в состоянии ошибки
    task.status !== TaskStatus.COMPLETED &&
    task.status !== TaskStatus.FAILED
  )
}

// Получение доступных задач (без зависимостей или с выполненными зависимостями)
export function getAvailableTasks(state: AgentState): Task[] {
  return getAllTasks(state).filter(task => {
    // Доступны только задачи со статусом PENDING
    if (task.status !== TaskStatus.PENDING) {
      return false
    }

    // Если у задачи нет зависимостей, она доступна
    if (task.dependencies.length === 0) {
      return true
    }

    // Проверяем, все ли зависимости выполнены
    return task.dependencies.every(depId => {
      const depTask = state.tasks.get(depId)
      return depTask && depTask.status === TaskStatus.COMPLETED
    })
  })
}

// Вспомогательная функция для получения следующей задачи с наивысшим приоритетом
export function getNextTask(state: AgentState): Task | null {
  const availableTasks = getAvailableTasks(state)

  if (availableTasks.length === 0) {
    return null
  }

  // Сортируем по приоритету (по убыванию)
  availableTasks.sort((a, b) => b.priority - a.priority)

  return availableTasks[0]
}

/**
 * Получает все делегированные задачи для указанного агента
 */
export function getDelegatedTasksForAgent(
  state: AgentState,
  agentId: string
): Task[] {
  return getAllTasks(state).filter(
    task =>
      task.assignedAgentId === agentId && task.status === TaskStatus.DELEGATED
  )
}

/**
 * Объединяет результаты всех подзадач в один результат
 */
export function combineSubtaskResults(
  state: AgentState,
  parentTaskId: string
): any {
  const parentTask = state.tasks.get(parentTaskId)

  if (!parentTask || !parentTask.subtaskResults) {
    return null
  }

  return parentTask.subtaskResults
}
