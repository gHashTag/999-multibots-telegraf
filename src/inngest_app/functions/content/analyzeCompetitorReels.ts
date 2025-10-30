/**
 * Analyze Competitor Reels Inngest Function
 * Job 2: "Мне нужно понять, какой контент популярен у конкурентов"
 * Analyzes competitor reels with metrics and saves to database
 */

import { slugify } from 'inngest'
import axios from 'axios'
import { inngest } from '@/core/inngest/clients'
import {
  InstagramContentAgentDB,
  type ReelsAnalysisData,
} from '@/core/instagram/database-v2'
import type {
  AnalyzeReelsEvent,
  AnalyzeReelsEventPayload,
} from '@/interfaces/instagram-content-agent.interface'
import {
  validateProjectInStep,
  ensureProjectsTableExists,
} from '@/core/instagram/database-validation'

// Zod schemas for validation
import { z } from 'zod'

// Validation schema for input event
const AnalyzeReelsEventSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  max_reels: z.number().min(1).max(50).default(15),
  days_back: z.number().min(1).max(30).default(14),
  project_id: z.number().positive().optional(),
  requester_telegram_id: z.string().optional(),
  telegram_user_id: z.string().optional(),
  metadata: z.record(z.any()).optional(),
})

// Simple logger
const log = {
  info: (msg: string, data?: any) =>
    console.log(`[ANALYZE-REELS] ${msg}`, data || ''),
  error: (msg: string, data?: any) =>
    console.error(`[ANALYZE-REELS] ${msg}`, data || ''),
  warn: (msg: string, data?: any) =>
    console.warn(`[ANALYZE-REELS] ${msg}`, data || ''),
}

// Helper function to transform Instagram reel to ReelsAnalysisData format
function transformReelToAnalysisData(
  reel: any,
  username: string,
  projectId?: number
): ReelsAnalysisData {
  return {
    comp_username: username,
    reel_id: reel.reel_id || reel.id || '',
    ig_reel_url: reel.shortcode
      ? `https://instagram.com/p/${reel.shortcode}/`
      : '',
    caption: reel.caption || '',
    views_count: reel.play_count || 0,
    likes_count: reel.like_count || 0,
    comments_count: reel.comment_count || 0,
    created_at_instagram: reel.taken_at_timestamp
      ? new Date(reel.taken_at_timestamp * 1000)
      : new Date(),
    project_id: projectId,
  }
}

// Helper function to calculate engagement metrics
function calculateEngagementMetrics(reels: any[]) {
  const totalViews = reels.reduce(
    (sum, reel) => sum + (reel.play_count || 0),
    0
  )
  const totalLikes = reels.reduce(
    (sum, reel) => sum + (reel.like_count || 0),
    0
  )
  const totalComments = reels.reduce(
    (sum, reel) => sum + (reel.comment_count || 0),
    0
  )

  const avgEngagement =
    reels.length > 0
      ? reels.reduce((sum, reel) => {
          const engagement =
            ((reel.like_count || 0) + (reel.comment_count || 0)) /
            Math.max(reel.play_count || 1, 1)
          return sum + engagement
        }, 0) / reels.length
      : 0

  return {
    totalViews,
    totalLikes,
    totalComments,
    avgEngagement,
  }
}

// Instagram API for reels (reused from instagramScraperV2)
class InstagramReelsAnalyzer {
  private apiKey: string
  private host: string
  private baseUrl: string

  constructor() {
    this.apiKey = process.env.RAPIDAPI_INSTAGRAM_KEY || ''
    this.host =
      process.env.RAPIDAPI_INSTAGRAM_HOST ||
      'real-time-instagram-scraper-api1.p.rapidapi.com'
    this.baseUrl = 'https://real-time-instagram-scraper-api1.p.rapidapi.com'
  }

  async getUserReels(username: string, count = 15) {
    const maxRetries = 3
    let attempt = 0

    while (attempt < maxRetries) {
      try {
        // Add delay between attempts
        if (attempt > 0) {
          const delay = Math.pow(2, attempt) * 1000
          log.warn(
            `⏳ Rate limited, waiting ${delay / 1000}s before retry ${
              attempt + 1
            }/${maxRetries}`
          )
          await new Promise(resolve => setTimeout(resolve, delay))
        }

        log.info(
          `🎬 Reels API call attempt ${
            attempt + 1
          }/${maxRetries} for: ${username}`
        )

        const response = await axios.get(`${this.baseUrl}/v1/user_reels`, {
          params: {
            username_or_id: username,
            count: count,
          },
          headers: {
            'x-rapidapi-key': this.apiKey,
            'x-rapidapi-host': this.host,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        })

        // Проверяем, что data не является строкой (ошибкой API)
        if (typeof response.data?.data === 'string') {
          log.error(`❌ API returned error: ${response.data.data}`)
          return {
            success: false,
            error: `API error: ${response.data.data}`,
            reels: [],
            total: 0,
            userId: '',
            username: username,
          }
        }

        log.info(
          `✅ Reels API Success: Found ${
            response.data?.data?.items?.length || 0
          } reels`
        )

        return {
          success: true,
          reels: response.data?.data?.items || [],
          total: response.data?.data?.items?.length || 0,
          userId: response.data?.data?.user_id || '',
          username: response.data?.data?.username || username,
        }
      } catch (error: any) {
        attempt++
        log.error(
          `❌ Reels API attempt ${attempt}/${maxRetries} failed:`,
          error.message
        )

        if (attempt >= maxRetries) {
          return {
            success: false,
            error: error.message,
            reels: [],
            total: 0,
            userId: '',
            username: username,
          }
        }
      }
    }

    return {
      success: false,
      error: 'Max retries exceeded',
      reels: [],
      total: 0,
      userId: '',
      username: username,
    }
  }
}

// Main analyzeCompetitorReels function
export const analyzeCompetitorReels = inngest.createFunction(
  {
    id: 'analyze-competitor-reels',
    name: '📈 Analyze Competitor Reels',
    concurrency: 2,
  },
  { event: 'instagram/analyze-reels' },
  async ({ event, step, runId, logger }) => {
    log.info('🚀 Analyze Competitor Reels started', {
      runId,
      eventData: event.data,
    })

    // Step 1: Validate input data
    const validationResult = (await step.run('validate-input', async () => {
      const result = AnalyzeReelsEventSchema.safeParse(event.data)

      if (!result.success) {
        const errorMessage = `Invalid event data: ${result.error.errors
          .map(e => `${e.path.join('.')}: ${e.message}`)
          .join(', ')}`
        log.error(errorMessage)
        throw new Error(errorMessage)
      }

      if (!process.env.RAPIDAPI_INSTAGRAM_KEY) {
        throw new Error('Instagram API key is not configured')
      }

      if (!process.env.NEON_DATABASE_URL) {
        throw new Error('Database URL is not configured')
      }

      log.info(`✅ Input validated: ${result.data.username}`)
      return result.data
    })) as z.infer<typeof AnalyzeReelsEventSchema>

    // Step 2: Validate project if provided
    const projectValidation = await step.run('validate-project', async () => {
      // Ensure projects table exists
      await ensureProjectsTableExists()

      // Use proper project validation
      return await validateProjectInStep(validationResult.project_id)
    })

    // Step 3: Call Instagram API to get reels
    const apiResult = await step.run('call-instagram-reels-api', async () => {
      // Add delay to avoid rate limiting
      log.info(
        '⏳ Waiting 3 seconds before reels API call to avoid rate limiting...'
      )
      await new Promise(resolve => setTimeout(resolve, 3000))

      const api = new InstagramReelsAnalyzer()
      const result = await api.getUserReels(
        validationResult.username,
        validationResult.max_reels
      )

      if (!result.success) {
        throw new Error(`Reels API call failed: ${result.error}`)
      }

      log.info(`✅ Reels API call successful: ${result.total} reels found`)
      return result
    })

    // Step 4: Filter reels by date range
    const filteredResult = await step.run('filter-reels-by-date', async () => {
      if (!apiResult.reels || apiResult.reels.length === 0) {
        log.info('⏭️ No reels to filter, returning empty result')
        return {
          filteredReels: [],
          filteredCount: 0,
          originalCount: 0,
        }
      }

      const now = new Date()
      const cutoffDate = new Date(
        now.getTime() - validationResult.days_back * 24 * 60 * 60 * 1000
      )

      const filteredReels = apiResult.reels.filter(reel => {
        if (!reel.taken_at_timestamp) return false
        const reelDate = new Date(reel.taken_at_timestamp * 1000)
        return reelDate >= cutoffDate
      })

      log.info(
        `📅 Filtered reels: ${filteredReels.length} out of ${apiResult.reels.length} reels within ${validationResult.days_back} days`
      )

      return {
        filteredReels,
        filteredCount: filteredReels.length,
        originalCount: apiResult.reels.length,
      }
    })

    // Step 5: Calculate metrics and sort by engagement
    const metricsResult = await step.run('calculate-metrics', async () => {
      if (
        !filteredResult.filteredReels ||
        filteredResult.filteredReels.length === 0
      ) {
        log.info('⏭️ No reels to analyze, returning empty metrics')
        return {
          sortedReels: [],
          totalViews: 0,
          totalLikes: 0,
          totalComments: 0,
          avgEngagement: 0,
        }
      }

      // Calculate metrics using helper function
      const metrics = calculateEngagementMetrics(filteredResult.filteredReels)
      const { totalViews, totalLikes, totalComments, avgEngagement } = metrics

      // Sort by engagement (likes + comments) descending
      const sortedReels = filteredResult.filteredReels.sort((a, b) => {
        const engagementA = (a.like_count || 0) + (a.comment_count || 0)
        const engagementB = (b.like_count || 0) + (b.comment_count || 0)
        return engagementB - engagementA
      })

      log.info(
        `📊 Metrics calculated: ${totalViews} views, ${totalLikes} likes, ${totalComments} comments, ${avgEngagement.toFixed(
          4
        )} avg engagement`
      )

      return {
        sortedReels,
        totalViews,
        totalLikes,
        totalComments,
        avgEngagement,
      }
    })

    // Step 6: Save to reels_analysis table
    const saveResult = await step.run(
      'save-to-reels-analysis-table',
      async () => {
        if (
          !metricsResult.sortedReels ||
          metricsResult.sortedReels.length === 0
        ) {
          log.warn('⚠️ No reels to save to database')
          return {
            saved: 0,
            duplicatesSkipped: 0,
            totalProcessed: 0,
          }
        }

        // Transform Instagram reels to ReelsAnalysisData format using helper function
        const reelsAnalysisData: ReelsAnalysisData[] =
          metricsResult.sortedReels.map(reel =>
            transformReelToAnalysisData(
              reel,
              validationResult.username,
              validationResult.project_id
            )
          )

        const db = new InstagramContentAgentDB()
        const result = await db.saveReelsAnalysis(reelsAnalysisData)

        log.info(
          `💾 Database save: ${result.saved} saved, ${result.duplicates} duplicates`
        )
        return {
          saved: result.saved,
          duplicatesSkipped: result.duplicates,
          totalProcessed: result.saved + result.duplicates,
        }
      }
    )

    // Step 7: Send Telegram notification (if required)
    const telegramResult = await step.run(
      'send-telegram-notification',
      async () => {
        if (!validationResult.requester_telegram_id) {
          log.info(
            '⏭️ No requester_telegram_id provided, skipping Telegram notification'
          )
          return { sent: false, reason: 'No requester_telegram_id' }
        }

        // TODO: Implement Telegram notification
        log.info(
          `📱 Telegram notification would be sent to: ${validationResult.requester_telegram_id}`
        )
        return { sent: true, messageId: 'mock-message-id' }
      }
    )

    // Final result
    const finalResult = {
      success: true,
      jobType: 'ANALYZE_COMPETITOR_REELS',
      targetUsername: validationResult.username,
      reelsFound: apiResult.total,
      reelsAnalyzed: filteredResult.filteredCount,
      reelsSaved: saveResult.saved,
      daysBack: validationResult.days_back,
      projectId: validationResult.project_id,
      metrics: {
        totalViews: metricsResult.totalViews,
        totalLikes: metricsResult.totalLikes,
        totalComments: metricsResult.totalComments,
        avgEngagement: metricsResult.avgEngagement,
      },
      topReels: metricsResult.sortedReels.slice(0, 5).map(reel => ({
        reel_id: reel.reel_id || reel.id,
        shortcode: reel.shortcode,
        likes: reel.like_count || 0,
        comments: reel.comment_count || 0,
        views: reel.play_count || 0,
        engagement: (reel.like_count || 0) + (reel.comment_count || 0),
        ig_url: reel.shortcode
          ? `https://instagram.com/p/${reel.shortcode}/`
          : '',
      })),
      completedAt: new Date(),
      runId,
      telegramNotification: telegramResult,
    }

    log.info('🎉 Analyze Competitor Reels completed successfully', {
      targetUsername: finalResult.targetUsername,
      found: finalResult.reelsFound,
      analyzed: finalResult.reelsAnalyzed,
      saved: finalResult.reelsSaved,
      projectId: finalResult.projectId,
      metrics: finalResult.metrics,
    })

    return finalResult
  }
)

// Helper function to trigger analyzeCompetitorReels
export async function triggerAnalyzeCompetitorReels(
  data: AnalyzeReelsEvent
): Promise<{ eventId: string }> {
  const validatedData = AnalyzeReelsEventSchema.parse(data)

  const result = await inngest.send({
    name: 'instagram/analyze-reels',
    data: validatedData,
  })

  return {
    eventId: result.ids[0],
  }
}
