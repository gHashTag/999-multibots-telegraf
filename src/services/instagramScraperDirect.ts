import { ApifyClient } from 'apify-client'
import { logger } from '@/utils/logger'
import { supabaseAdmin } from '@/core/supabase/client'

const client = new ApifyClient({
  token: process.env.APIFY_TOKEN,
})

export interface InstagramScraperParams {
  username_or_hashtag: string
  type: 'competitor' | 'hashtag'
  maxPosts: number
  userId: string
  telegram_id: string
}

export interface InstagramScraperResult {
  success: boolean
  data?: any[]
  error?: string
  runId?: string
}

export async function scrapeInstagramDirect(
  params: InstagramScraperParams
): Promise<InstagramScraperResult> {
  const { username_or_hashtag, type, maxPosts, userId, telegram_id } = params

  logger.info('🚀 Starting direct Instagram scraping', {
    username_or_hashtag,
    type,
    maxPosts,
    userId,
  })

  try {
    // Prepare input based on type
    const input =
      type === 'competitor'
        ? {
            usernames: [username_or_hashtag],
            resultsType: 'posts',
            resultsLimit: maxPosts,
            postsLimit: maxPosts,
            includeComments: false,
            proxy: {
              useApifyProxy: true,
              apifyProxyGroups: ['RESIDENTIAL'],
            },
          }
        : {
            hashtags: [username_or_hashtag],
            resultsType: 'posts',
            resultsLimit: maxPosts,
            postsLimit: maxPosts,
            includeComments: false,
            proxy: {
              useApifyProxy: true,
              apifyProxyGroups: ['RESIDENTIAL'],
            },
          }

    console.log('📋 Apify input:', JSON.stringify(input, null, 2))

    // Run the Instagram scraper
    const run = await client.actor('apify/instagram-scraper').call(input, {
      timeout: 600, // 10 minutes timeout
      memory: 4096,
    })

    console.log(`✅ Actor run started with ID: ${run.id}`)
    console.log(`📊 Status: ${run.status}`)

    // Wait for the run to finish
    await client.run(run.id).waitForFinish()

    // Get the final status
    const finalRun = await client.run(run.id).get()
    console.log(`🏁 Final status: ${finalRun?.status}`)

    if (finalRun?.status !== 'SUCCEEDED') {
      throw new Error(`Actor failed with status: ${finalRun?.status}`)
    }

    // Get the results
    const dataset = await client.dataset(run.defaultDatasetId)
    const results = await dataset.listItems()

    console.log(`📊 Retrieved ${results.items.length} posts`)

    // Filter for reels/videos
    const reels = results.items.filter((item: any) => {
      return (
        item.type === 'Video' ||
        item.type === 'Reel' ||
        item.videoUrl ||
        (item.videos && item.videos.length > 0)
      )
    })

    console.log(`🎬 Found ${reels.length} reels/videos`)

    // Save to database
    if (reels.length > 0) {
      const { error: dbError } = await supabaseAdmin
        .from('instagram_scrapings')
        .insert({
          telegram_id,
          user_id: userId,
          target: username_or_hashtag,
          source_type: type,
          reels_count: reels.length,
          cost:
            maxPosts <= 10
              ? 3
              : maxPosts <= 25
                ? 8
                : maxPosts <= 50
                  ? 15
                  : maxPosts <= 100
                    ? 30
                    : 55,
          status: 'completed',
          result_data: reels,
          apify_run_id: run.id,
        })

      if (dbError) {
        logger.error('Failed to save scraping results to database', dbError)
      }
    }

    return {
      success: true,
      data: reels,
      runId: run.id,
    }
  } catch (error) {
    logger.error('Instagram scraping failed', { error, params })

    // Save failed attempt to database
    try {
      await supabaseAdmin.from('instagram_scrapings').insert({
        telegram_id,
        user_id: userId,
        target: username_or_hashtag,
        source_type: type,
        reels_count: 0,
        cost: 0,
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      })
    } catch (err) {
      logger.error('Failed to save error to database', err)
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}
