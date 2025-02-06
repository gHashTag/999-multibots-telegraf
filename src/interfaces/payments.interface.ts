export interface BalanceOperationResult {
  newBalance: number
  success: boolean
  modePrice: number
  error?: string
}
export interface Payment {
  id: string
  amount: number
  date: string
}
