export interface TestResult {
  success: boolean
  name: string
  message: string
}

export interface TestUser {
  id: string
  telegram_id: string
  balance: number
}
