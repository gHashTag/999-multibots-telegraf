import { inngest } from '@/inngest_app/client'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'

export interface InstagramScrapingRequest {
  username_or_id: string
  project_id: number
  max_users?: number
  max_reels_per_user?: number
  scrape_reels?: boolean
  requester_telegram_id: string
}

export interface InstagramScrapingResponse {
  success: boolean
  eventId?: string
  message: string
  error?: string
}

export async function generateInstagramScraping(
  username_or_id: string,
  project_id: number,
  max_users: number = 50,
  max_reels_per_user: number = 50,
  scrape_reels: boolean = false,
  telegram_id: string,
  ctx: MyContext,
  botName: string
): Promise<InstagramScrapingResponse | null> {
  // Используем новый универсальный сервис
  const { startInstagramScraping } = await import('./instagramScrapingService')
  
  const result = await startInstagramScraping({
    username_or_id,
    project_id,
    max_users,
    max_reels_per_user,
    scrape_reels,
    requester_telegram_id: telegram_id,
    bot_name: botName
  }, ctx)

  // Отправляем сообщение пользователю если запрос успешен
  if (result.success && ctx.reply) {
    await ctx.reply(result.message, { parse_mode: 'Markdown' })
  }

  return result
}
