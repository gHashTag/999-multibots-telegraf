/**
 * Планировщик задач для автономного агента
 * Отвечает за планирование и распределение задач
 */

import {
  AgentState,
  Task,
  TaskStatus,
  getNextTask,
  updateTaskStatus,
  setCurrentTask,
} from './state.js'

// Максимальное количество параллельных задач
const DEFAULT_MAX_CONCURRENT_TASKS = 3

// Интерфейс обработчика задач
export interface TaskHandler {
  canHandle(task: Task): boolean
  handle(task: Task, state: AgentState): Promise<any>
}

// Интерфейс планировщика
export interface Scheduler {
  registerHandler(handler: TaskHandler): void
  start(): Promise<void>
  stop(): Promise<void>
  isRunning(): boolean
}

// Реализация планировщика задач
export class TaskScheduler implements Scheduler {
  private handlers: TaskHandler[] = []
  private state: AgentState
  private running: boolean = false
  private activeTasksCount: number = 0
  private maxConcurrentTasks: number
  private pollingInterval: number
  private intervalId?: NodeJS.Timeout

  constructor(
    state: AgentState,
    options: {
      maxConcurrentTasks?: number
      pollingInterval?: number // в миллисекундах
    } = {}
  ) {
    this.state = state
    this.maxConcurrentTasks =
      options.maxConcurrentTasks || DEFAULT_MAX_CONCURRENT_TASKS
    this.pollingInterval = options.pollingInterval || 1000 // 1 секунда по умолчанию
  }

  registerHandler(handler: TaskHandler): void {
    this.handlers.push(handler)
  }

  async start(): Promise<void> {
    if (this.running) {
      return
    }

    this.running = true
    console.log(`Task scheduler started for agent ${this.state.id}`)

    // Запускаем цикл обработки задач
    this.intervalId = setInterval(
      () => this.processTasks(),
      this.pollingInterval
    )
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return
    }

    this.running = false
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = undefined
    }

    console.log(`Task scheduler stopped for agent ${this.state.id}`)
  }

  isRunning(): boolean {
    return this.running
  }

  private async processTasks(): Promise<void> {
    if (this.activeTasksCount >= this.maxConcurrentTasks) {
      return
    }

    // Получаем следующую доступную задачу
    const nextTask = getNextTask(this.state)
    if (!nextTask) {
      return
    }

    // Находим подходящий обработчик
    const handler = this.findHandler(nextTask)
    if (!handler) {
      console.warn(
        `No handler found for task ${nextTask.id} of type ${nextTask.type}`
      )
      updateTaskStatus(this.state, nextTask.id, TaskStatus.FAILED, {
        error: 'No handler found for task',
      })
      return
    }

    // Запускаем обработку задачи
    this.executeTask(nextTask, handler)
  }

  private findHandler(task: Task): TaskHandler | undefined {
    return this.handlers.find(handler => handler.canHandle(task))
  }

  private async executeTask(task: Task, handler: TaskHandler): Promise<void> {
    this.activeTasksCount++
    setCurrentTask(this.state, task.id)

    try {
      console.log(`Executing task ${task.id} of type ${task.type}`)
      const result = await handler.handle(task, this.state)

      updateTaskStatus(this.state, task.id, TaskStatus.COMPLETED, result)
      console.log(`Task ${task.id} completed successfully`)
    } catch (error) {
      console.error(`Error executing task ${task.id}:`, error)
      updateTaskStatus(this.state, task.id, TaskStatus.FAILED, {
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      this.activeTasksCount--
    }
  }
}

// Функция для создания планировщика задач
export function createTaskScheduler(
  state: AgentState,
  options?: {
    maxConcurrentTasks?: number
    pollingInterval?: number
  }
): TaskScheduler {
  return new TaskScheduler(state, options)
}
