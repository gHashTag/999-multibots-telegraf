export enum TaskType {
  SELF_IMPROVEMENT = 'self_improvement',
  CODE_GENERATION = 'code_generation',
  CODE_ANALYSIS = 'code_analysis',
  CODE_REFACTORING = 'code_refactoring',
  TESTING = 'testing',
  TEST_GENERATION = 'test_generation'
}

export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export interface Task {
  id: string;
  type: TaskType;
  description: string;
  status: TaskStatus;
  priority: number;
  created: Date;
  updated: Date;
  dependencies?: string[];
  metadata?: Record<string, any>;
}

export interface TaskResult {
  success: boolean;
  data?: any;
  error?: Error;
} 