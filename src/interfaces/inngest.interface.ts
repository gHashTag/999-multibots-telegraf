export interface VideoWebhookEvent {
  id: string
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
  output?: string
  error?: string
  telegram_id: string
  bot_name: string
  is_ru: boolean
  videoModel: string
  prompt: string
}
