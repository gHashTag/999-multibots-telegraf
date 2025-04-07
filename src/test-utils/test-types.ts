import { TestResult } from './interfaces'

export interface VideoTestResult extends TestResult {
  videoBuffer?: Buffer
  paymentProcessed?: boolean
}

export interface BalanceTestResult extends TestResult {
  before_balance?: number
  after_balance?: number
  spent_balance?: number
}

export interface PaymentTestResult extends TestResult {
  paymentProcessed?: boolean
  amount?: number
  type?: string
}

export interface TestMetadata {
  startTime?: number
  endTime?: number
  environment?: string
  testType?: string
}

export interface TestLogError {
  message: string
  description: string
  error: Error | string
  code?: string
  context?: Record<string, unknown>
}
