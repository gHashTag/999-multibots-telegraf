/**
 * Instagram Scraper v2 - Simplified Version for Testing Reels
 * Temporary version without strict typing to test reels functionality
 */

import { slugify } from 'inngest'
import axios from 'axios'
// ✅ Используем единый клиент из @/inngest_app/client
import { inngest as instagramInngest } from '@/inngest_app/client'

// Simple logger
const log = {
  info: (msg: string, data?: any) =>
    console.log(`[IG-INFO] ${msg}`, data || ''),
  error: (msg: string, data?: any) =>
    console.error(`[IG-ERROR] ${msg}`, data || ''),
  warn: (msg: string, data?: any) =>
    console.warn(`[IG-WARN] ${msg}`, data || ''),
}

// Simple Instagram API class
class SimpleInstagramAPI {
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

  async getUserReels(username: string, count = 10) {
    try {
      log.info(`🎬 Getting reels for: ${username} (count: ${count})`)

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

      log.info(`✅ Reels API response status: ${response.status}`)
      log.info(`📊 Response data:`, JSON.stringify(response.data, null, 2))

      return {
        success: true,
        data: response.data,
        status: response.status,
      }
    } catch (error: any) {
      log.error(`❌ Reels API Error:`, error.message)

      if (error.response) {
        log.error(`   Status: ${error.response.status}`)
        log.error(`   Data:`, error.response.data)
      }

      return {
        success: false,
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
      }
    }
  }
}

// Main test function
// Export with both names for compatibility
const instagramReelsTest = instagramInngest.createFunction(
  {
    id: slugify('instagram-reels-test'),
    name: '🧪 Instagram Reels Test Function',
    concurrency: 1,
  },
  { event: 'instagram/test-reels' },
  async ({ event, step, runId, logger: log }) => {
    const { username = 'cristiano', count = 5 } = event.data || {}

    log.info('🚀 Instagram Reels Test started', { runId, username, count })

    // Step 1: Test reels API
    const reelsResult = await step.run('test-reels-api', async () => {
      const api = new SimpleInstagramAPI()
      const result = await api.getUserReels(username, count)

      if (!result.success) {
        throw new Error(`Reels API failed: ${result.error}`)
      }

      return result
    })

    log.info('🎉 Reels test completed successfully', {
      username,
      success: reelsResult.success,
      status: reelsResult.status,
    })

    return {
      success: true,
      username,
      count,
      apiResponse: reelsResult,
      runId,
    }
  }
)

// Export with the expected name
export const instagramScraperV2Simple = instagramReelsTest
export { instagramReelsTest }

// Trigger function
export async function triggerReelsTest(username = 'cristiano', count = 5) {
  const result = await instagramInngest.send({
    name: 'instagram/test-reels',
    data: { username, count },
  })

  return {
    eventId: result.ids[0],
  }
}
