/**
 * Optimized Notification Processor
 *
 * Memory-efficient notification processing with batching, throttling,
 * and automatic memory management to prevent memory leaks.
 */

import { logger } from './logger'
import { supabase } from '@/core/supabase'
import { databaseMonitor } from './databaseMonitor'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'

interface PendingMessage {
  id: string
  telegram_id: string
  message: string
  message_type: string
  created_at: string
  priority: 'high' | 'medium' | 'low'
  attempts: number
  last_attempt?: string
  sent: boolean
  error?: string
}

interface ProcessingMetrics {
  totalProcessed: number
  successful: number
  failed: number
  batchCount: number
  averageResponseTime: number
  memoryUsageStart: number
  memoryUsagePeak: number
  startTime: number
}

interface NotificationBatch {
  messages: PendingMessage[]
  priority: 'high' | 'medium' | 'low'
  batchId: string
}

export class OptimizedNotificationProcessor {
  private bot: Telegraf<MyContext>
  private isProcessing = false
  private batchSize: number = 10
  private maxConcurrentBatches: number = 3
  private processingQueue: Map<string, NotificationBatch> = new Map()
  private metrics: ProcessingMetrics
  private memoryCheckInterval: NodeJS.Timeout | null = null
  private readonly maxMemoryThreshold = 200 * 1024 * 1024 // 200MB

  constructor(bot: Telegraf<MyContext>, options: {
    batchSize?: number
    maxConcurrentBatches?: number
  } = {}) {
    this.bot = bot
    this.batchSize = options.batchSize || 10
    this.maxConcurrentBatches = options.maxConcurrentBatches || 3

    this.metrics = {
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      batchCount: 0,
      averageResponseTime: 0,
      memoryUsageStart: 0,
      memoryUsagePeak: 0,
      startTime: 0
    }
  }

  /**
   * Main notification processing method with memory optimization
   */
  async processNotificationQueue(): Promise<ProcessingMetrics> {
    if (this.isProcessing) {
      logger.warn('[OptimizedNotificationProcessor] Processing already in progress')
      return this.metrics
    }

    this.isProcessing = true
    this.startMemoryMonitoring()

    try {
      // Initialize metrics
      this.metrics = {
        totalProcessed: 0,
        successful: 0,
        failed: 0,
        batchCount: 0,
        averageResponseTime: 0,
        memoryUsageStart: this.getCurrentMemoryUsage(),
        memoryUsagePeak: this.getCurrentMemoryUsage(),
        startTime: Date.now()
      }

      logger.info('[OptimizedNotificationProcessor] Starting optimized notification processing', {
        batchSize: this.batchSize,
        maxConcurrentBatches: this.maxConcurrentBatches,
        initialMemory: this.metrics.memoryUsageStart
      })

      // Process messages in memory-efficient batches
      await this.processBatchedMessages()

      // Final metrics calculation
      this.metrics.averageResponseTime = this.metrics.totalProcessed > 0
        ? (Date.now() - this.metrics.startTime) / this.metrics.totalProcessed
        : 0

      logger.info('[OptimizedNotificationProcessor] Processing completed', {
        ...this.metrics,
        processingTime: Date.now() - this.metrics.startTime,
        memoryEfficiency: this.calculateMemoryEfficiency()
      })

      return this.metrics

    } catch (error) {
      logger.error('[OptimizedNotificationProcessor] Processing failed', {
        error: error instanceof Error ? error.message : String(error),
        metrics: this.metrics
      })

      throw error

    } finally {
      this.isProcessing = false
      this.stopMemoryMonitoring()
      await this.performMemoryCleanup()
    }
  }

  /**
   * Process messages in optimized batches
   */
  private async processBatchedMessages(): Promise<void> {
    let hasMoreMessages = true
    let offset = 0

    while (hasMoreMessages && this.isMemoryUsageAcceptable()) {
      // Fetch messages in small chunks to avoid memory spikes
      const messages = await this.fetchMessageBatch(offset)

      if (!messages || messages.length === 0) {
        hasMoreMessages = false
        break
      }

      // Group messages by priority for efficient processing
      const priorityBatches = this.groupMessagesByPriority(messages)

      // Process each priority group concurrently
      await this.processPriorityBatches(priorityBatches)

      offset += this.batchSize

      // Periodic memory cleanup
      if (this.metrics.batchCount % 5 === 0) {
        await this.performMemoryCleanup()
      }

      // Check if we should continue based on memory usage
      const currentMemory = this.getCurrentMemoryUsage()
      if (currentMemory > this.maxMemoryThreshold) {
        logger.warn('[OptimizedNotificationProcessor] Memory threshold reached, pausing processing', {
          currentMemory,
          threshold: this.maxMemoryThreshold
        })

        await this.performMemoryCleanup()

        // Wait briefly for garbage collection
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
  }

  /**
   * Fetch a batch of messages from the database
   */
  private async fetchMessageBatch(offset: number): Promise<PendingMessage[]> {
    return databaseMonitor.monitorQuery('fetch_pending_messages', async () => {
      const { data, error } = await supabase
        .from('pending_messages')
        .select('*')
        .eq('sent', false)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true })
        .range(offset, offset + this.batchSize - 1)

      if (error) throw error
      return data || []
    })
  }

  /**
   * Group messages by priority for efficient processing
   */
  private groupMessagesByPriority(messages: PendingMessage[]): Map<string, NotificationBatch> {
    const batches = new Map<string, NotificationBatch>()

    messages.forEach(message => {
      const priority = message.priority
      const batchKey = `${priority}_${Math.floor(Math.random() * 1000)}`

      if (!batches.has(priority)) {
        batches.set(priority, {
          messages: [],
          priority,
          batchId: batchKey
        })
      }

      const batch = batches.get(priority)!
      batch.messages.push(message)
    })

    return batches
  }

  /**
   * Process priority batches concurrently with memory management
   */
  private async processPriorityBatches(batches: Map<string, NotificationBatch>): Promise<void> {
    const batchPromises: Promise<void>[] = []

    for (const [priority, batch] of batches) {
      // Limit concurrent batches to prevent memory spikes
      if (batchPromises.length >= this.maxConcurrentBatches) {
        await Promise.race(batchPromises)
      }

      const batchPromise = this.processSingleBatch(batch)
        .then(() => {
          // Remove from queue when done to free memory
          this.processingQueue.delete(batch.batchId)
        })

      batchPromises.push(batchPromise)
      this.processingQueue.set(batch.batchId, batch)
    }

    // Wait for all remaining batches to complete
    await Promise.all(batchPromises)
  }

  /**
   * Process a single batch of messages
   */
  private async processSingleBatch(batch: NotificationBatch): Promise<void> {
    const batchStartTime = Date.now()

    try {
      logger.debug('[OptimizedNotificationProcessor] Processing batch', {
        batchId: batch.batchId,
        priority: batch.priority,
        messageCount: batch.messages.length
      })

      // Process messages in the batch with throttling
      const results = await Promise.allSettled(
        batch.messages.map(message => this.processSingleMessage(message))
      )

      // Update metrics
      this.metrics.batchCount++

      results.forEach((result, index) => {
        this.metrics.totalProcessed++

        if (result.status === 'fulfilled') {
          this.metrics.successful++
        } else {
          this.metrics.failed++
          logger.error('[OptimizedNotificationProcessor] Message processing failed', {
            messageId: batch.messages[index].id,
            error: result.reason
          })
        }
      })

      logger.debug('[OptimizedNotificationProcessor] Batch completed', {
        batchId: batch.batchId,
        processingTime: Date.now() - batchStartTime,
        successRate: this.metrics.successful / this.metrics.totalProcessed
      })

    } catch (error) {
      logger.error('[OptimizedNotificationProcessor] Batch processing failed', {
        batchId: batch.batchId,
        error: error instanceof Error ? error.message : String(error)
      })

      // Mark all messages in batch as failed
      this.metrics.failed += batch.messages.length
      this.metrics.totalProcessed += batch.messages.length
    } finally {
      // Clear batch from memory immediately
      batch.messages.length = 0
    }
  }

  /**
   * Process a single message with error handling
   */
  private async processSingleMessage(message: PendingMessage): Promise<void> {
    try {
      // Send the message
      await this.bot.telegram.sendMessage(message.telegram_id, message.message)

      // Mark as sent in database
      await databaseMonitor.monitorQuery('mark_message_sent', async () => {
        const { error } = await supabase
          .from('pending_messages')
          .update({
            sent: true,
            last_attempt: new Date().toISOString(),
            attempts: message.attempts + 1
          })
          .eq('id', message.id)

        if (error) throw error
      })

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      // Update message with error info
      await databaseMonitor.monitorQuery('update_message_error', async () => {
        const { error: updateError } = await supabase
          .from('pending_messages')
          .update({
            error: errorMessage,
            last_attempt: new Date().toISOString(),
            attempts: message.attempts + 1
          })
          .eq('id', message.id)

        if (updateError) {
          logger.error('[OptimizedNotificationProcessor] Failed to update message error', {
            messageId: message.id,
            updateError: updateError.message
          })
        }
      })

      throw error
    }
  }

  /**
   * Memory monitoring and management
   */
  private startMemoryMonitoring(): void {
    this.memoryCheckInterval = setInterval(() => {
      const currentMemory = this.getCurrentMemoryUsage()

      if (currentMemory > this.metrics.memoryUsagePeak) {
        this.metrics.memoryUsagePeak = currentMemory
      }

      if (currentMemory > this.maxMemoryThreshold) {
        logger.warn('[OptimizedNotificationProcessor] High memory usage detected', {
          currentMemory,
          peak: this.metrics.memoryUsagePeak,
          threshold: this.maxMemoryThreshold
        })
      }
    }, 5000) // Check every 5 seconds
  }

  private stopMemoryMonitoring(): void {
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval)
      this.memoryCheckInterval = null
    }
  }

  private getCurrentMemoryUsage(): number {
    return process.memoryUsage().heapUsed
  }

  private isMemoryUsageAcceptable(): boolean {
    return this.getCurrentMemoryUsage() < this.maxMemoryThreshold
  }

  private calculateMemoryEfficiency(): number {
    const memoryUsed = this.metrics.memoryUsagePeak - this.metrics.memoryUsageStart
    return this.metrics.totalProcessed > 0 ? memoryUsed / this.metrics.totalProcessed : 0
  }

  /**
   * Aggressive memory cleanup
   */
  private async performMemoryCleanup(): Promise<void> {
    // Clear processing queue
    this.processingQueue.clear()

    // Force garbage collection if available
    if (global.gc) {
      global.gc()
    }

    // Small delay to allow cleanup
    await new Promise(resolve => setTimeout(resolve, 100))

    logger.debug('[OptimizedNotificationProcessor] Memory cleanup performed', {
      currentMemory: this.getCurrentMemoryUsage()
    })
  }

  /**
   * Get current processing metrics
   */
  getMetrics(): ProcessingMetrics {
    return { ...this.metrics }
  }

  /**
   * Get processing status
   */
  isCurrentlyProcessing(): boolean {
    return this.isProcessing
  }

  /**
   * Emergency stop processing
   */
  emergencyStop(): void {
    this.isProcessing = false
    this.processingQueue.clear()
    this.stopMemoryMonitoring()

    logger.warn('[OptimizedNotificationProcessor] Emergency stop initiated')
  }
}

/**
 * Factory function to create optimized processor
 */
export function createOptimizedNotificationProcessor(
  bot: Telegraf<MyContext>,
  options?: {
    batchSize?: number
    maxConcurrentBatches?: number
  }
): OptimizedNotificationProcessor {
  return new OptimizedNotificationProcessor(bot, options)
}

/**
 * Process notifications with automatic memory management
 */
export async function processNotificationsOptimized(
  bot: Telegraf<MyContext>
): Promise<ProcessingMetrics> {
  const processor = createOptimizedNotificationProcessor(bot, {
    batchSize: 20, // Optimal batch size for memory efficiency
    maxConcurrentBatches: 5 // Balanced concurrency
  })

  return processor.processNotificationQueue()
}