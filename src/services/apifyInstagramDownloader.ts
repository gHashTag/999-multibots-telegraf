import { ApifyClient } from 'apify-client'
import { logger } from '@/utils/logger'
import fs from 'fs'
import path from 'path'
import axios from 'axios'

interface ApifyInstagramResult {
  url: string
  source: string
  author: string
  title: string
  thumbnail: string
  duration: number
  medias: Array<{
    url: string
    quality: string
    type: string
    extension: string
  }>
  type: string
  error: boolean
}

interface DownloadResult {
  success: boolean
  videoPath?: string
  error?: string
}

export class ApifyInstagramDownloader {
  private client: ApifyClient
  private actorId = 'easyapi/instagram-reels-downloader'

  constructor() {
    const apifyToken = process.env.APIFY_TOKEN
    if (!apifyToken) {
      throw new Error('APIFY_TOKEN environment variable is required')
    }

    this.client = new ApifyClient({
      token: apifyToken,
    })
  }

  async downloadInstagramVideo(
    url: string,
    outputDir: string,
    filePrefix: string
  ): Promise<DownloadResult> {
    try {
      logger.info(
        '[ApifyInstagramDownloader] Starting Instagram video download',
        {
          url,
          outputDir,
          filePrefix,
        }
      )

      // Запускаем Apify актор
      const run = await this.client.actor(this.actorId).call({
        links: [url],
      })

      logger.info('[ApifyInstagramDownloader] Apify run completed', {
        runId: run.id,
        status: run.status,
      })

      // Получаем результаты
      const { items } = await this.client
        .dataset(run.defaultDatasetId)
        .listItems()

      if (!items || items.length === 0) {
        throw new Error('No results returned from Apify actor')
      }

      const result = items[0] as unknown as ApifyInstagramResult

      if (result.error) {
        throw new Error('Apify actor returned an error')
      }

      if (!result.medias || result.medias.length === 0) {
        throw new Error('No video media found in Apify result')
      }

      // Находим лучшее качество видео
      const videoMedia = result.medias
        .filter(media => media.type === 'video')
        .sort((a, b) => {
          // Сортируем по качеству (предпочитаем более высокое)
          const qualityA = this.extractQuality(a.quality)
          const qualityB = this.extractQuality(b.quality)
          return qualityB - qualityA
        })[0]

      if (!videoMedia) {
        throw new Error('No video media found in results')
      }

      logger.info('[ApifyInstagramDownloader] Found video media', {
        quality: videoMedia.quality,
        extension: videoMedia.extension,
        url: videoMedia.url.substring(0, 100) + '...',
      })

      // Скачиваем видео файл
      const videoPath = await this.downloadVideoFile(
        videoMedia.url,
        outputDir,
        filePrefix,
        videoMedia.extension
      )

      logger.info('[ApifyInstagramDownloader] Video downloaded successfully', {
        videoPath,
        size: fs.statSync(videoPath).size,
      })

      return {
        success: true,
        videoPath,
      }
    } catch (error) {
      logger.error(
        '[ApifyInstagramDownloader] Error downloading Instagram video',
        {
          url,
          error: error.message,
          stack: error.stack,
        }
      )

      return {
        success: false,
        error: error.message,
      }
    }
  }

  private extractQuality(qualityString: string): number {
    // Извлекаем числовое значение качества из строки типа "640-1136p"
    const match = qualityString.match(/(\d+)/)
    return match ? parseInt(match[1], 10) : 0
  }

  private async downloadVideoFile(
    videoUrl: string,
    outputDir: string,
    filePrefix: string,
    extension: string
  ): Promise<string> {
    const fileName = `${filePrefix}.${extension}`
    const filePath = path.join(outputDir, fileName)

    logger.info('[ApifyInstagramDownloader] Downloading video file', {
      videoUrl: videoUrl.substring(0, 100) + '...',
      filePath,
    })

    const response = await axios({
      method: 'GET',
      url: videoUrl,
      responseType: 'stream',
      timeout: 60000, // 60 секунд таймаут
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    })

    const writer = fs.createWriteStream(filePath)
    response.data.pipe(writer)

    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(filePath))
      writer.on('error', reject)
    })
  }
}
