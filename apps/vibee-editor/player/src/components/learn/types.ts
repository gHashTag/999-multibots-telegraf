export interface Lesson {
  id: string;
  worldId: string;
  title: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  honeyReward: number;
  vibeeCode: string;
  gleamCode: string;
  expectedOutput: string;
  hints: string[];
  explanation: string;
  challengeType: 'fill-blank' | 'fix-bug' | 'from-scratch' | 'optimize';
}

export interface World {
  id: string;
  title: string;
  description: string;
  requiredLevel: number;
  lessons: Lesson[];
  unlocked: boolean;
}

export interface CompilationResult {
  success: boolean;
  vibeeCode: string;
  gleamCode: string;
  output: string;
  errors: CompilationError[];
}

export interface CompilationError {
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning';
}

export type BeeLevel =
  | 'larva'      // 0-50 honey
  | 'worker'     // 51-150
  | 'guard'      // 151-300
  | 'forager'    // 301-500
  | 'queen';     // 501+
