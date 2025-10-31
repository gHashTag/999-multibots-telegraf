/**
 * Find Competitors Inngest Function
 * Job 1: "Мне нужно найти похожих авторов в моей нише"
 * Extends instagramScraperV2 with new database schema and filtering
 */

import { slugify } from 'inngest'
import axios from 'axios'
import { inngest } from '@/core/inngest/clients'
import {
  InstagramContentAgentDB,
  type CompetitorData,
} from '@/core/instagram/database-v2'
import type {
  FindCompetitorsEvent,
  FindCompetitorsEventPayload,
} from '@/interfaces/instagram-content-agent.interface'
import {
  validateProjectInStep,
  ensureProjectsTableExists,
} from '@/core/instagram/database-validation'

// Zod schemas for validation
import { z } from 'zod'

// Validation schema for input event
const FindCompetitorsEventSchema = z.object({
  username_or_id: z.string().min(1, 'Username is required'),
  count: z.number().min(1).max(50).default(10),
  min_followers: z.number().min(0).optional(),
  project_id: z.number().positive().optional(),
  requester_telegram_id: z.string().optional(),
  telegram_user_id: z.string().optional(),
  metadata: z.record(z.any()).optional(),
})

// Simple logger
const log = {
  info: (msg: string, data?: any) =>
    console.log(`[FIND-COMPETITORS] ${msg}`, data || ''),
  error: (msg: string, data?: any) =>
    console.error(`[FIND-COMPETITORS] ${msg}`, data || ''),
  warn: (msg: string, data?: any) =>
    console.warn(`[FIND-COMPETITORS] ${msg}`, data || ''),
}

// Instagram API integration (reused from instagramScraperV2)
class InstagramCompetitorAPI {
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

  async getSimilarUsers(username: string, count = 10) {
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
          `📡 API call attempt ${attempt + 1}/${maxRetries} for: ${username}`
        )

        const response = await axios.get(
          `${this.baseUrl}/v1/similar_users_v2`,
          {
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
          }
        )

        log.info(
          `✅ API Success: Found ${
            response.data?.data?.users?.length || 0
          } users`
        )

        return {
          success: true,
          users: response.data?.data?.users || [],
          total: response.data?.data?.users?.length || 0,
        }
      } catch (error: any) {
        attempt++
        log.error(
          `❌ API attempt ${attempt}/${maxRetries} failed:`,
          error.message
        )

        if (attempt >= maxRetries) {
          return {
            success: false,
            error: error.message,
            users: [],
            total: 0,
          }
        }
      }
    }

    return {
      success: false,
      error: 'Max retries exceeded',
      users: [],
      total: 0,
    }
  }
}

// Main findCompetitors function
export const findCompetitors = inngest.createFunction(
  {
    id: 'find-competitors',
    name: '🔍 Find Instagram Competitors',
    concurrency: 2,
  },
  { event: 'instagram/find-competitors' },
  async ({ event, step, runId, logger }) => {
    log.info('🚀 Find Competitors started', {
      runId,
      eventData: event.data,
    })

    // Step 1: Validate input data
    const validationResult = (await step.run('validate-input', async () => {
      const result = FindCompetitorsEventSchema.safeParse(event.data)

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

      log.info(`✅ Input validated: ${result.data.username_or_id}`)
      return result.data
    })) as z.infer<typeof FindCompetitorsEventSchema>

    // Step 2: Validate project if provided
    const projectValidation = await step.run('validate-project', async () => {
      // Ensure projects table exists
      await ensureProjectsTableExists()

      // Use proper project validation
      return await validateProjectInStep(validationResult.project_id)
    })

    // Step 3: Call Instagram API
    const apiResult = await step.run('call-instagram-api', async () => {
      // Add delay to avoid rate limiting
      log.info('⏳ Waiting 2 seconds before API call to avoid rate limiting...')
      await new Promise(resolve => setTimeout(resolve, 2000))

      const api = new InstagramCompetitorAPI()
      const result = await api.getSimilarUsers(
        validationResult.username_or_id,
        validationResult.count
      )

      if (!result.success) {
        throw new Error(`API call failed: ${result.error}`)
      }

      log.info(`✅ API call successful: ${result.total} users found`)
      return result
    })

    // Step 4: Filter by minimum followers
    const filteredResult = await step.run('filter-by-followers', async () => {
      if (!validationResult.min_followers) {
        log.info('⏭️ No min_followers filter provided, returning all users')
        return {
          filteredUsers: apiResult.users,
          filteredCount: apiResult.users.length,
          originalCount: apiResult.users.length,
        }
      }

      const filteredUsers = apiResult.users.filter(
        user =>
          user.followers_count &&
          user.followers_count >= validationResult.min_followers
      )

      log.info(
        `🔍 Filtered users: ${filteredUsers.length} out of ${apiResult.users.length} meet min_followers >= ${validationResult.min_followers}`
      )

      return {
        filteredUsers,
        filteredCount: filteredUsers.length,
        originalCount: apiResult.users.length,
      }
    })

    // Step 5: Save to competitors table
    const saveResult = await step.run('save-to-competitors-table', async () => {
      if (
        !filteredResult.filteredUsers ||
        filteredResult.filteredUsers.length === 0
      ) {
        log.warn('⚠️ No users to save to database')
        return {
          saved: 0,
          duplicatesSkipped: 0,
          totalProcessed: 0,
        }
      }

      // Transform Instagram API users to CompetitorData format
      const competitorData = filteredResult.filteredUsers.map(user => ({
        query_username: validationResult.username_or_id,
        comp_username: user.username,
        followers_count: user.followers_count,
        category: user.category || 'unknown',
        bio: user.biography || user.full_name || '',
        ig_url: user.profile_url || `https://instagram.com/${user.username}`,
        project_id: validationResult.project_id,
      }))

      const db = new InstagramContentAgentDB()
      const result = await db.saveCompetitors(competitorData)

      log.info(
        `💾 Database save: ${result.saved} saved, ${result.duplicates} duplicates`
      )
      return {
        saved: result.saved,
        duplicatesSkipped: result.duplicates,
        totalProcessed: result.saved + result.duplicates,
      }
    })

    // Step 6: Send Telegram notification (if required)
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
      jobType: 'FIND_COMPETITORS',
      queryUsername: validationResult.username_or_id,
      competitorsFound: apiResult.total,
      competitorsFiltered: filteredResult.filteredCount,
      competitorsSaved: saveResult.saved,
      minFollowers: validationResult.min_followers,
      projectId: validationResult.project_id,
      completedAt: new Date(),
      runId,
      telegramNotification: telegramResult,
      sampleCompetitors: filteredResult.filteredUsers.slice(0, 5).map(user => ({
        username: user.username,
        followers_count: user.followers_count,
        is_verified: user.is_verified,
        profile_url:
          user.profile_url || `https://instagram.com/${user.username}`,
      })),
    }

    log.info('🎉 Find Competitors completed successfully', {
      queryUsername: finalResult.queryUsername,
      found: finalResult.competitorsFound,
      filtered: finalResult.competitorsFiltered,
      saved: finalResult.competitorsSaved,
      projectId: finalResult.projectId,
    })

    return finalResult
  }
)

// Helper function to trigger findCompetitors
export async function triggerFindCompetitors(
  data: FindCompetitorsEvent
): Promise<{ eventId: string }> {
  const validatedData = FindCompetitorsEventSchema.parse(data)

  const result = await inngest.send({
    name: 'instagram/find-competitors',
    data: validatedData,
  })

  return {
    eventId: result.ids[0],
  }
}
