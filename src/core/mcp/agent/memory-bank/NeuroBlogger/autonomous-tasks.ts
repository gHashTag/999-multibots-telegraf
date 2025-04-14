import { Task, TaskType, TaskStatus } from '../../../state'
import { AutonomousSystem } from '../../../autonomous-system'
import { v4 as uuidv4 } from 'uuid'

/**
 * Автономные задачи для самостоятельной работы NeuroBlogger
 */
export class AutonomousTasks {
  private system: AutonomousSystem
  private isRunning: boolean = false
  private taskQueue: Task[] = []

  constructor(system: AutonomousSystem) {
    this.system = system
    this.initializeTaskQueue()
  }

  private initializeTaskQueue() {
    // Добавляем начальные задачи для автономной работы
    this.addTask(TaskType.SELF_IMPROVEMENT, 'Анализ и оптимизация текущей кодовой базы')
    this.addTask(TaskType.CODE_GENERATION, 'Создание базовых компонентов для работы с контентом')
    this.addTask(TaskType.CODE_ANALYSIS, 'Анализ производительности системы')
  }

  private addTask(type: TaskType, description: string, priority: number = 1) {
    const task: Task = {
      id: uuidv4(),
      type,
      description,
      status: TaskStatus.PENDING,
      priority,
      created: new Date(),
      updated: new Date(),
      metadata: {
        autonomous: true,
        initiator: 'NeuroBlogger'
      }
    }
    this.taskQueue.push(task)
  }

  public async startAutonomousWork() {
    if (this.isRunning) return
    this.isRunning = true
    
    console.log('🚀 Начинаю автономную работу...')
    
    while (this.isRunning && this.taskQueue.length > 0) {
      const task = this.taskQueue.shift()
      if (!task) continue

      try {
        console.log(`📋 Выполняю задачу: ${task.description}`)
        await this.system.processTask(task)
        
        // Анализируем результат и создаем новые задачи при необходимости
        this.analyzeAndCreateNewTasks(task)
        
      } catch (error) {
        console.error(`❌ Ошибка при выполнении задачи ${task.id}:`, error)
        // Добавляем задачу обратно в очередь с меньшим приоритетом
        task.priority = Math.max(1, task.priority - 1)
        this.taskQueue.push(task)
      }
    }
  }

  private analyzeAndCreateNewTasks(completedTask: Task) {
    // На основе выполненной задачи создаем новые
    switch (completedTask.type) {
      case TaskType.SELF_IMPROVEMENT:
        this.addTask(TaskType.CODE_REFACTORING, 'Применение улучшений на основе анализа')
        break
      
      case TaskType.CODE_GENERATION:
        this.addTask(TaskType.CODE_ANALYSIS, 'Анализ сгенерированного кода')
        this.addTask(TaskType.TESTING, 'Создание тестов для новых компонентов')
        break
      
      case TaskType.CODE_ANALYSIS:
        this.addTask(TaskType.SELF_IMPROVEMENT, 'Оптимизация на основе анализа производительности')
        break
    }
  }

  public stop() {
    this.isRunning = false
    console.log('🛑 Автономная работа остановлена')
  }
} 