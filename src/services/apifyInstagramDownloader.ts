import { ApifyClient } from 'apify-client'
import { logger } from '@/utils/logger'
import fs from 'fs'
import path from 'path'
import axios from 'axios'

console.log('🔧 Initializing Official Apify Instagram Scraper...')

const client = new ApifyClient({
  token: process.env.APIFY_TOKEN,
})

interface InstagramPostResult {
  id?: string
  type?: string
  shortCode?: string
  caption?: string
  url?: string
  displayUrl?: string
  videoUrl?: string
  images?: string[]
  videos?: Array<{
    videoUrl: string
    width?: number
    height?: number
  }>
  videoDuration?: number
  timestamp?: string
}

interface DownloadResult {
  success: boolean
  videoUrl?: string
  error?: string
  metadata?: {
    duration?: number
    quality?: string
    format?: string
  }
}

export async function downloadInstagramVideoViaApify(
  instagramUrl: string
): Promise<DownloadResult> {
  console.log(
    `📥 Starting official Apify Instagram scraper for: ${instagramUrl}`
  )

  try {
    const input = {
      directUrls: [instagramUrl],
      resultsType: 'posts',
      resultsLimit: 1,
      includeComments: false,
      proxy: {
        useApifyProxy: true,
        apifyProxyGroups: ['RESIDENTIAL'],
      },
    }

    console.log('🚀 Launching official Instagram Scraper actor...')

    const run = await client.actor('apify/instagram-scraper').call(input, {
      timeout: 300, // 5 minutes timeout
      memory: 2048,
    })

    console.log(`✅ Actor run completed with status: ${run.status}`)

    if (run.status !== 'SUCCEEDED') {
      console.error(`❌ Actor failed with status: ${run.status}`)
      return {
        success: false,
        error: `Actor failed with status: ${run.status}`,
      }
    }

    // Get the results from the dataset
    const dataset = await client.dataset(run.defaultDatasetId)
    const results = await dataset.listItems()

    console.log(`📊 Retrieved ${results.items.length} results from dataset`)

    if (results.items.length === 0) {
      console.error('❌ No results found in dataset')
      return {
        success: false,
        error: 'No video found for the provided URL',
      }
    }

    const postResult = results.items[0] as unknown as InstagramPostResult

    console.log(`📋 Post type: ${postResult.type}`)
    console.log(`📊 Available fields:`, Object.keys(postResult))
    console.log(`📊 Data structure:`, {
      hasDisplayUrl: !!postResult.displayUrl,
      hasVideos: !!(postResult.videos && postResult.videos.length > 0),
      hasImages: !!(postResult.images && postResult.images.length > 0),
      videoCount: postResult.videos?.length || 0,
      imageCount: postResult.images?.length || 0,
    })

    // Log the full result for debugging
    console.log(`📋 Full result:`, JSON.stringify(postResult, null, 2))

    // Look for video URL in the response
    let videoUrl: string | null = null

    if (postResult.videoUrl) {
      console.log('✅ Found videoUrl field:', postResult.videoUrl)
      videoUrl = postResult.videoUrl
    } else if (postResult.videos && postResult.videos.length > 0) {
      console.log(
        '✅ Found videos array, using first video:',
        postResult.videos[0]
      )
      videoUrl = postResult.videos[0].videoUrl
    } else if (postResult.images && postResult.images.length > 0) {
      // Check if any images are actually video files
      for (const image of postResult.images) {
        if (
          typeof image === 'string' &&
          (image.includes('.mp4') || image.includes('video'))
        ) {
          console.log('✅ Found video in images array:', image)
          videoUrl = image
          break
        }
      }
    } else if (postResult.displayUrl) {
      console.log(
        '⚠️ Using displayUrl as fallback (might be preview image):',
        postResult.displayUrl.substring(0, 100) + '...'
      )
      videoUrl = postResult.displayUrl
    }

    if (!videoUrl) {
      console.error('❌ No video URL found in result')
      console.log('📋 Available data:', JSON.stringify(postResult, null, 2))
      return {
        success: false,
        error: 'No video URL available in the scraped data',
      }
    }

    console.log(`✅ Video URL obtained: ${videoUrl.substring(0, 100)}...`)

    return {
      success: true,
      videoUrl: videoUrl,
      metadata: {
        quality: 'original',
        format: 'mp4',
      },
    }
  } catch (error) {
    console.error('❌ Official Instagram scraper failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}

// Alternative method using Instagram Reel Scraper
export async function downloadInstagramVideoViaApifyFallback(
  instagramUrl: string
): Promise<DownloadResult> {
  console.log(`📥 Starting Instagram Reel Scraper for: ${instagramUrl}`)

  try {
    const input = {
      directUrls: [instagramUrl],
      resultsLimit: 1,
      proxy: {
        useApifyProxy: true,
        apifyProxyGroups: ['RESIDENTIAL'],
      },
    }

    console.log('🚀 Launching Instagram Reel Scraper actor...')

    const run = await client.actor('apify/instagram-reel-scraper').call(input, {
      timeout: 300,
      memory: 2048,
    })

    console.log(`✅ Reel scraper run completed with status: ${run.status}`)

    if (run.status !== 'SUCCEEDED') {
      return {
        success: false,
        error: `Reel scraper failed with status: ${run.status}`,
      }
    }

    const dataset = await client.dataset(run.defaultDatasetId)
    const results = await dataset.listItems()

    if (results.items.length === 0) {
      return {
        success: false,
        error: 'No reel found in scraper results',
      }
    }

    const reelResult = results.items[0] as any

    // Check different possible field names for the video URL
    const videoUrl =
      reelResult.videoUrl ||
      reelResult.displayUrl ||
      reelResult.url ||
      (reelResult.videos && reelResult.videos[0]?.videoUrl)

    if (!videoUrl) {
      console.log(
        '📋 Reel result structure:',
        JSON.stringify(reelResult, null, 2)
      )
      return {
        success: false,
        error: 'No video URL found in reel scraper result',
      }
    }

    console.log(`✅ Reel video URL obtained`)

    return {
      success: true,
      videoUrl: videoUrl,
      metadata: {
        quality: 'original',
        format: 'mp4',
      },
    }
  } catch (error) {
    console.error('❌ Instagram Reel Scraper failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Reel scraper failed',
    }
  }
}
