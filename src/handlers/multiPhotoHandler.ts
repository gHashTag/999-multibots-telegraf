/**
 * Multi-Photo Handler - Detects and processes multiple photo uploads for Neurophoto
 * Handles media groups (albums) and sequential photo uploads
 */
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { logger } from '@/utils/logger'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { ModeEnum } from '@/interfaces/modes'

export interface PhotoQueueItem {
  fileId: string
  fileUrl: string
  timestamp: number
  mediaGroupId?: string
  messageId: number
}

// Global photo queue manager
class PhotoQueueManager {
  private queues = new Map<string, PhotoQueueItem[]>()
  private timers = new Map<string, NodeJS.Timeout>()
  private readonly PROCESSING_DELAY = 2000 // 2 seconds to wait for more photos

  addPhoto(userId: string, photo: PhotoQueueItem): void {
    if (!this.queues.has(userId)) {
      this.queues.set(userId, [])
    }

    const queue = this.queues.get(userId)!
    queue.push(photo)

    logger.info('📸 Multi-photo: Added photo to queue', {
      userId,
      queueSize: queue.length,
      mediaGroupId: photo.mediaGroupId,
      timestamp: photo.timestamp
    })

    // Clear existing timer and set new one
    if (this.timers.has(userId)) {
      clearTimeout(this.timers.get(userId)!)
    }

    this.timers.set(userId, setTimeout(() => {
      this.processQueue(userId)
    }, this.PROCESSING_DELAY))
  }

  private async processQueue(userId: string): Promise<void> {
    const queue = this.queues.get(userId)
    if (!queue || queue.length === 0) return

    logger.info('🔄 Multi-photo: Processing queue', {
      userId,
      queueSize: queue.length
    })

    // Group photos by media_group_id
    const mediaGroups = new Map<string, PhotoQueueItem[]>()
    const singlePhotos: PhotoQueueItem[] = []

    for (const photo of queue) {
      if (photo.mediaGroupId) {
        if (!mediaGroups.has(photo.mediaGroupId)) {
          mediaGroups.set(photo.mediaGroupId, [])
        }
        mediaGroups.get(photo.mediaGroupId)!.push(photo)
      } else {
        singlePhotos.push(photo)
      }
    }

    // Process media groups (multiple photos)
    for (const [groupId, photos] of mediaGroups) {
      if (photos.length > 1) {
        await this.triggerMultiPhotoNeurophoto(userId, photos)
      } else {
        // Single photo in group, treat as regular photo
        singlePhotos.push(photos[0])
      }
    }

    // Process single photos normally
    if (singlePhotos.length > 0) {
      logger.info('📷 Multi-photo: Found single photos, processing normally', {
        userId,
        singlePhotosCount: singlePhotos.length
      })
    }

    // Clear queue and timer
    this.queues.delete(userId)
    this.timers.delete(userId)
  }

  private async triggerMultiPhotoNeurophoto(userId: string, photos: PhotoQueueItem[]): Promise<void> {
    logger.info('🎯 Multi-photo: Triggering multi-image neurophoto', {
      userId,
      photoCount: photos.length,
      mediaGroupId: photos[0].mediaGroupId
    })

    // Emit event for multi-photo neurophoto
    // This will be handled by the bot's photo handler
    const event = {
      type: 'multi_photo_neurophoto',
      userId,
      photos: photos.sort((a, b) => a.timestamp - b.timestamp), // Sort by timestamp
      photoCount: photos.length
    }

    // Store in global context for pickup by photo handler
    global.multiPhotoEvents = global.multiPhotoEvents || new Map()
    global.multiPhotoEvents.set(userId, event)
  }

  hasQueuedPhotos(userId: string): boolean {
    return this.queues.has(userId) && this.queues.get(userId)!.length > 0
  }

  getQueueSize(userId: string): number {
    return this.queues.get(userId)?.length || 0
  }
}

export const photoQueueManager = new PhotoQueueManager()

/**
 * Detects if multiple photos were uploaded and prepares them for neurophoto processing
 */
export async function detectMultiPhotoUpload(ctx: MyContext): Promise<boolean> {
  if (!ctx.message || !('photo' in ctx.message)) return false

  const userId = ctx.from?.id?.toString()
  if (!userId) return false

  const photo = ctx.message.photo?.pop() // Get highest resolution
  if (!photo) return false

  try {
    const fileLink = await ctx.telegram.getFileLink(photo.file_id)
    const mediaGroupId = 'media_group_id' in ctx.message ? ctx.message.media_group_id : undefined

    const photoItem: PhotoQueueItem = {
      fileId: photo.file_id,
      fileUrl: fileLink.href,
      timestamp: Date.now(),
      mediaGroupId,
      messageId: ctx.message.message_id
    }

    // Add to queue for processing
    photoQueueManager.addPhoto(userId, photoItem)

    // Check if this might be part of a multi-photo upload
    const queueSize = photoQueueManager.getQueueSize(userId)

    logger.info('📸 Multi-photo: Photo detected', {
      userId,
      fileId: photo.file_id,
      mediaGroupId,
      queueSize,
      isMultiPhoto: !!mediaGroupId || queueSize > 1
    })

    return !!mediaGroupId || queueSize > 1
  } catch (error) {
    logger.error('❌ Multi-photo: Error processing photo', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    return false
  }
}

/**
 * Handles multi-photo neurophoto generation
 */
export async function handleMultiPhotoNeurophoto(ctx: MyContext, photos: PhotoQueueItem[]): Promise<void> {
  const userId = ctx.from?.id?.toString()
  if (!userId) return

  const isRu = isRussianFromState(ctx)
  const photoCount = photos.length

  logger.info('🎨 Multi-photo: Starting multi-image neurophoto', {
    userId,
    photoCount,
    photos: photos.map(p => ({ fileId: p.fileId, timestamp: p.timestamp }))
  })

  try {
    // Send confirmation message
    await ctx.reply(
      isRu
        ? `✨ Обнаружено ${photoCount} изображений! Создаю серию нейрофото...\n\n📸 Будет сгенерировано: ${photoCount} нейрофото\n💎 Стоимость: ${photoCount * 7.5} ⭐`
        : `✨ Detected ${photoCount} images! Creating neurophoto series...\n\n📸 Will generate: ${photoCount} neurophotos\n💎 Cost: ${photoCount * 7.5} ⭐`,
      {
        reply_markup: {
          inline_keyboard: [
            [{
              text: isRu ? '✅ Продолжить' : '✅ Continue',
              callback_data: `multi_neurophoto_${userId}_${photoCount}`
            }],
            [{
              text: isRu ? '❌ Отмена' : '❌ Cancel',
              callback_data: 'multi_neurophoto_cancel'
            }]
          ]
        }
      }
    )

    // Store photos in session for processing
    if (ctx.session) {
      ctx.session.multiPhotoUrls = photos.map(p => p.fileUrl)
      ctx.session.multiPhotoCount = photoCount
      ctx.session.awaitingMultiPhotoConfirmation = true
    }

  } catch (error) {
    logger.error('❌ Multi-photo: Error handling multi-photo neurophoto', {
      userId,
      photoCount,
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    await ctx.reply(
      isRu
        ? '❌ Произошла ошибка при обработке изображений. Попробуйте отправить их по одному.'
        : '❌ Error processing images. Please try sending them one by one.'
    )
  }
}

/**
 * Checks for pending multi-photo events and processes them
 */
export async function checkMultiPhotoEvents(ctx: MyContext): Promise<boolean> {
  const userId = ctx.from?.id?.toString()
  if (!userId) return false

  const events = global.multiPhotoEvents as Map<string, any> || new Map()
  const event = events.get(userId)

  if (event && event.type === 'multi_photo_neurophoto') {
    logger.info('🎯 Multi-photo: Processing pending multi-photo event', {
      userId,
      photoCount: event.photoCount
    })

    events.delete(userId)
    await handleMultiPhotoNeurophoto(ctx, event.photos)
    return true
  }

  return false
}