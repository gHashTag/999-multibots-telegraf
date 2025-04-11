/**
 * Система управления состоянием автономного агента
 * Реализует долгосрочную память и контекст для агента
 */

// Типы задач
export enum TaskType {
  CODE_GENERATION = 'CODE_GENERATION',
  CODE_REFACTORING = 'CODE_REFACTORING',
  CODE_ANALYSIS = 'CODE_ANALYSIS',
  TEST_GENERATION = 'TEST_GENERATION',
  DOCUMENTATION = 'DOCUMENTATION',
  DEPENDENCY_MANAGEMENT = 'DEPENDENCY_MANAGEMENT',
  GIT_OPERATIONS = 'GIT_OPERATIONS',
  SELF_IMPROVEMENT = 'SELF_IMPROVEMENT',
  BACKGROUND_IMPROVEMENT = 'BACKGROUND_IMPROVEMENT',
}

// Статусы задач
export enum TaskStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  BLOCKED = 'BLOCKED',
}

// Интерфейс задачи
export interface Task {
  id: string;
  type: TaskType;
  description: string;
  status: TaskStatus;
  priority: number;
  created: Date;
  updated: Date;
  dependencies: string[]; // ID задач, от которых зависит текущая
  metadata: Record<string, any>;
  result?: any;
}

// Интерфейс состояния агента
export interface AgentState {
  id: string;
  tasks: Map<string, Task>;
  context: Map<string, any>;
  history: Array<{
    timestamp: Date;
    action: string;
    details: Record<string, any>;
  }>;
  currentTaskId?: string;
}

// Создание нового состояния агента
export function createAgentState(id: string): AgentState {
  return {
    id,
    tasks: new Map(),
    context: new Map(),
    history: [],
  };
}

// Добавление новой задачи
export function addTask(state: AgentState, task: Omit<Task, 'id' | 'created' | 'updated' | 'status'>): Task {
  const id = generateTaskId();
  const now = new Date();
  
  const newTask: Task = {
    id,
    ...task,
    status: TaskStatus.PENDING,
    created: now,
    updated: now,
  };
  
  state.tasks.set(id, newTask);
  
  // Логируем действие
  addToHistory(state, 'TASK_ADDED', { taskId: id, description: task.description });
  
  return newTask;
}

// Обновление статуса задачи
export function updateTaskStatus(state: AgentState, taskId: string, status: TaskStatus, result?: any): void {
  const task = state.tasks.get(taskId);
  
  if (!task) {
    throw new Error(`Task with id ${taskId} not found`);
  }
  
  task.status = status;
  task.updated = new Date();
  
  if (result !== undefined) {
    task.result = result;
  }
  
  // Логируем действие
  addToHistory(state, 'TASK_STATUS_UPDATED', { 
    taskId,
    oldStatus: task.status,
    newStatus: status,
    hasResult: result !== undefined
  });
}

// Установка текущей задачи
export function setCurrentTask(state: AgentState, taskId: string): void {
  const task = state.tasks.get(taskId);
  
  if (!task) {
    throw new Error(`Task with id ${taskId} not found`);
  }
  
  state.currentTaskId = taskId;
  
  // Если задача была в статусе PENDING, переводим в IN_PROGRESS
  if (task.status === TaskStatus.PENDING) {
    updateTaskStatus(state, taskId, TaskStatus.IN_PROGRESS);
  }
  
  // Логируем действие
  addToHistory(state, 'CURRENT_TASK_SET', { taskId });
}

// Сохранение контекста
export function setContext(state: AgentState, key: string, value: any): void {
  state.context.set(key, value);
  
  // Логируем действие
  addToHistory(state, 'CONTEXT_UPDATED', { key });
}

// Получение контекста
export function getContext<T>(state: AgentState, key: string): T | undefined {
  return state.context.get(key) as T | undefined;
}

// Добавление записи в историю
function addToHistory(state: AgentState, action: string, details: Record<string, any> = {}): void {
  state.history.push({
    timestamp: new Date(),
    action,
    details,
  });
}

// Генерация уникального ID для задачи
function generateTaskId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

// Сохранение состояния (заглушка, будет заменена на реальное сохранение в БД)
export async function saveState(state: AgentState): Promise<boolean> {
  console.log(`Saving agent state: ${state.id}`);
  // TODO: Реализовать сохранение в БД
  return true;
}

// Загрузка состояния (заглушка, будет заменена на реальную загрузку из БД)
export async function loadState(stateId: string): Promise<AgentState | null> {
  console.log(`Loading agent state: ${stateId}`);
  // TODO: Реализовать загрузку из БД
  return null;
}

// Вспомогательная функция для получения всех задач в виде массива
export function getAllTasks(state: AgentState): Task[] {
  return Array.from(state.tasks.values());
}

// Получение доступных задач (без зависимостей или с выполненными зависимостями)
export function getAvailableTasks(state: AgentState): Task[] {
  return getAllTasks(state).filter(task => {
    if (task.status !== TaskStatus.PENDING) {
      return false;
    }
    
    // Если у задачи нет зависимостей, она доступна
    if (task.dependencies.length === 0) {
      return true;
    }
    
    // Проверяем, все ли зависимости выполнены
    return task.dependencies.every(depId => {
      const depTask = state.tasks.get(depId);
      return depTask && depTask.status === TaskStatus.COMPLETED;
    });
  });
}

// Вспомогательная функция для получения следующей задачи с наивысшим приоритетом
export function getNextTask(state: AgentState): Task | null {
  const availableTasks = getAvailableTasks(state);
  
  if (availableTasks.length === 0) {
    return null;
  }
  
  // Сортируем по приоритету (по убыванию)
  availableTasks.sort((a, b) => b.priority - a.priority);
  
  return availableTasks[0];
} 