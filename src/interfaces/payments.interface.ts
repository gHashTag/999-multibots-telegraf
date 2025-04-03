export interface BalanceOperationResult {
  newBalance: number
  success: boolean
  modePrice: number
  error?: string
}

export interface Payment {
  id: string
  telegram_id: string
  amount: number
  type: 'income' | 'outcome'
  description: string
  service: PaymentService
  created_at: string
  bot_name: string
  metadata?: Record<string, any>
}

export type PaymentService =
  | 'NeuroPhoto'
  | 'Text to speech'
  | 'Image to video'
  | 'Text to image'
  | 'Training'
  | 'Refund'
  | 'System'
  | 'Telegram'
  | 'Robokassa'
  | 'Unknown'
