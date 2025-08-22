import { ApifyClient } from 'apify-client'
import { logger } from '@/utils/logger'
import { supabaseAdmin } from '@/core/supabase/client'

const client = new ApifyClient({
  token: process.env.APIFY_TOKEN,
})

// Проверяем что токен существует
if (!process.env.APIFY_TOKEN) {
  logger.error('APIFY_TOKEN is not configured')
}

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
  hasResults?: boolean
  totalItemsProcessed?: number
  reelsFiltered?: number
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
    // Проверяем что Apify токен настроен
    if (!process.env.APIFY_TOKEN) {
      throw new Error('APIFY_TOKEN не настроен. Парсинг невозможен.')
    }

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

    if (!run || !run.id) {
      throw new Error('Apify не вернул корректный run объект. Возможно, сервис недоступен.')
    }

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
    
    if (!dataset) {
      throw new Error('Не удалось получить dataset. Возможно, проблема с Apify API.')
    }
    
    const results = await dataset.listItems()
    
    if (!results || !Array.isArray(results.items)) {
      throw new Error('Apify вернул некорректные данные. Возможно, проблема с API.')
    }

    console.log(`📊 Retrieved ${results.items.length} posts`)
    
    // Логируем детали для диагностики
    logger.info('Apify parsing results details', {
      totalItems: results.items.length,
      runId: run.id,
      finalStatus: finalRun?.status,
      hasDataset: !!dataset,
      target: username_or_hashtag,
      type
    })

    // Debug: log first item structure
    if (results.items.length > 0) {
      console.log('🔍 DEBUG: First item structure:', JSON.stringify(results.items[0], null, 2))
    }

    // Filter for reels/videos
    const reels = results.items.filter((item: any) => {
      const isVideo = item.type === 'Video' || 
                     item.type === 'Reel' || 
                     item.videoUrl ||
                     (item.videos && item.videos.length > 0) ||
                     item.isVideo ||
                     item.__typename === 'GraphVideo' ||
                     item.media_type === 2  // Instagram API: 2 = video

      console.log(`🔍 Item type: ${item.type}, isVideo: ${isVideo}, hasVideoUrl: ${!!item.videoUrl}, videos: ${item.videos?.length || 0}`)
      return isVideo
    })

    console.log(`🎬 Found ${reels.length} reels/videos`)

    // Определяем статус операции на основе результатов
    const hasValidResults = reels.length > 0
    const operationStatus = hasValidResults ? 'completed' : 'completed_no_results'
    
    // Save to database - всегда сохраняем результат для аудита
    const costCalculation = maxPosts <= 10 ? 3 : maxPosts <= 25 ? 8 : maxPosts <= 50 ? 15 : maxPosts <= 100 ? 30 : 55
    
    const { error: dbError } = await supabaseAdmin
      .from('instagram_scrapings')
      .insert({
        telegram_id,
        user_id: userId,
        target: username_or_hashtag,
        source_type: type,
        reels_count: reels.length,
        cost: costCalculation,
        status: operationStatus,
        result_data: reels,
        apify_run_id: run.id,
      })

    if (dbError) {
      logger.error('Failed to save scraping results to database', dbError)
    }

    // Возвращаем результат с детальной информацией
    return {
      success: true,
      data: reels,
      runId: run.id,
      hasResults: hasValidResults,
      totalItemsProcessed: results.items.length,
      reelsFiltered: reels.length
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
