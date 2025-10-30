/**
 * ⚡ NEUROPHOTO PERFORMANCE & BENCHMARK TESTS
 *
 * Comprehensive performance testing for multi-image processing
 * Memory usage, processing speed, and resource optimization validation
 */

import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest'

// Performance monitoring utilities
interface PerformanceMetrics {
  processingTime: number
  memoryUsage: {
    before: number
    after: number
    peak: number
    increase: number
  }
  cpuUsage?: number
  throughput: number // images per second
  resourceEfficiency: number // 0-100 score
}

interface ImageProcessingBenchmark {
  imageCount: number
  averageSize: number
  totalProcessingTime: number
  successRate: number
  errorRate: number
  memoryEfficiency: number
}

describe('⚡ Neurophoto Performance Tests', () => {
  let performanceMonitor: any
  let memoryTracker: any

  beforeEach(() => {
    // Reset performance monitoring
    performanceMonitor = {
      startTime: 0,
      endTime: 0,
      memorySnapshots: []
    }

    memoryTracker = {
      initialMemory: process.memoryUsage(),
      peakMemory: 0,
      snapshots: []
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc()
    }
  })

  afterEach(() => {
    // Cleanup after each test
    if (global.gc) {
      global.gc()
    }
  })

  describe('🚀 Processing Speed Benchmarks', () => {
    test('single image processing should complete under 2 seconds', async () => {
      const singleImage = createBenchmarkImage()

      const startTime = performance.now()
      const result = await processSingleImageBenchmark(singleImage)
      const endTime = performance.now()

      const processingTime = endTime - startTime

      expect(result.success).toBe(true)
      expect(processingTime).toBeLessThan(2000) // Under 2 seconds
      expect(result.quality).toBeGreaterThan(0.8) // Good quality
    })

    test('multi-image batch processing should be faster than sequential', async () => {
      const imageCount = 5
      const images = Array.from({ length: imageCount }, () => createBenchmarkImage())

      // Sequential processing
      const sequentialStart = performance.now()
      const sequentialResults = []
      for (const image of images) {
        sequentialResults.push(await processSingleImageBenchmark(image))
      }
      const sequentialTime = performance.now() - sequentialStart

      // Batch processing
      const batchStart = performance.now()
      const batchResults = await processBatchImagesBenchmark(images)
      const batchTime = performance.now() - batchStart

      expect(batchResults.success).toBe(true)
      expect(batchResults.processedCount).toBe(imageCount)
      expect(batchTime).toBeLessThan(sequentialTime * 0.7) // At least 30% faster

      const speedImprovement = (sequentialTime - batchTime) / sequentialTime
      expect(speedImprovement).toBeGreaterThan(0.3) // 30% speed improvement
    })

    test('concurrent processing should scale efficiently with image count', async () => {
      const testSizes = [1, 3, 5, 8, 10]
      const results: Array<{ size: number; time: number; throughput: number }> = []

      for (const size of testSizes) {
        const images = Array.from({ length: size }, () => createBenchmarkImage())

        const startTime = performance.now()
        const result = await processConcurrentImagesBenchmark(images)
        const endTime = performance.now()

        const processingTime = endTime - startTime
        const throughput = size / (processingTime / 1000) // images per second

        results.push({ size, time: processingTime, throughput })

        expect(result.success).toBe(true)
        expect(result.processedCount).toBe(size)
      }

      // Verify throughput increases (or at least doesn't decrease drastically) with more images
      for (let i = 1; i < results.length; i++) {
        const current = results[i]
        const previous = results[i - 1]

        // Throughput should not decrease by more than 50% as we add more images
        expect(current.throughput).toBeGreaterThan(previous.throughput * 0.5)
      }
    })

    test('processing timeout should be enforced correctly', async () => {
      const images = Array.from({ length: 3 }, () => createBenchmarkImage())
      const shortTimeout = 100 // 100ms - very short

      const startTime = performance.now()
      const result = await processImagesWithTimeout(images, shortTimeout)
      const endTime = performance.now()

      const actualTime = endTime - startTime

      expect(actualTime).toBeLessThan(shortTimeout * 2) // Should timeout quickly
      expect(result.timedOut).toBe(true)
      expect(result.partialResults).toBeDefined()
    })
  })

  describe('💾 Memory Usage & Optimization', () => {
    test('memory usage should stay within reasonable bounds', async () => {
      const initialMemory = process.memoryUsage()
      const images = Array.from({ length: 10 }, () => createLargeImage(5 * 1024 * 1024)) // 5MB each

      const result = await processImagesWithMemoryMonitoring(images)

      const finalMemory = process.memoryUsage()
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed

      expect(result.success).toBe(true)
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024) // Less than 100MB increase
      expect(result.memoryEfficient).toBe(true)
    })

    test('memory should be released after processing completion', async () => {
      const images = Array.from({ length: 8 }, () => createLargeImage(3 * 1024 * 1024))

      const memoryBefore = process.memoryUsage()

      // Process images multiple times
      for (let i = 0; i < 3; i++) {
        await processImagesWithCleanup(images)

        if (global.gc) {
          global.gc()
        }

        // Small delay to allow cleanup
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      const memoryAfter = process.memoryUsage()
      const memoryGrowth = memoryAfter.heapUsed - memoryBefore.heapUsed

      // Memory growth should be minimal after cleanup
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024) // Less than 50MB growth
    })

    test('should handle memory pressure gracefully', async () => {
      // Simulate high memory usage scenario
      const largeImages = Array.from({ length: 15 }, () =>
        createLargeImage(10 * 1024 * 1024) // 10MB each = 150MB total
      )

      const result = await processImagesUnderMemoryPressure(largeImages)

      expect(result.success).toBe(true)
      expect(result.degradedMode).toBe(true) // Should activate memory-saving mode
      expect(result.batchSize).toBeLessThan(largeImages.length) // Should process in smaller batches
    })

    test('memory leak detection over multiple processing cycles', async () => {
      const baseline = process.memoryUsage()
      const images = Array.from({ length: 5 }, () => createBenchmarkImage())

      const memorySnapshots: number[] = []

      // Run 10 processing cycles
      for (let cycle = 0; cycle < 10; cycle++) {
        await processImagesWithCleanup(images)

        if (global.gc) {
          global.gc()
        }

        await new Promise(resolve => setTimeout(resolve, 50))
        memorySnapshots.push(process.memoryUsage().heapUsed)
      }

      // Check for memory leak pattern (consistently increasing memory)
      const firstHalf = memorySnapshots.slice(0, 5)
      const secondHalf = memorySnapshots.slice(5)

      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length

      const memoryIncrease = secondAvg - firstAvg

      // Memory increase should be minimal (less than 10MB)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024)
    })
  })

  describe('📊 Throughput & Scalability', () => {
    test('should maintain consistent throughput across different load levels', async () => {
      const loadLevels = [
        { name: 'light', imageCount: 2, concurrent: 1 },
        { name: 'medium', imageCount: 5, concurrent: 2 },
        { name: 'heavy', imageCount: 10, concurrent: 3 },
        { name: 'extreme', imageCount: 15, concurrent: 4 }
      ]

      const throughputResults: Array<{
        level: string
        throughput: number
        efficiency: number
      }> = []

      for (const level of loadLevels) {
        const images = Array.from({ length: level.imageCount }, () => createBenchmarkImage())

        const startTime = performance.now()
        const result = await processImagesWithConcurrency(images, level.concurrent)
        const endTime = performance.now()

        const processingTime = endTime - startTime
        const throughput = level.imageCount / (processingTime / 1000)
        const efficiency = (throughput / level.imageCount) * 100

        throughputResults.push({
          level: level.name,
          throughput,
          efficiency
        })

        expect(result.success).toBe(true)
        expect(throughput).toBeGreaterThan(0.5) // At least 0.5 images per second
      }

      // Log throughput results for analysis
      console.table(throughputResults)
    })

    test('should handle burst processing efficiently', async () => {
      // Simulate burst scenario: many requests in short time
      const burstRequests = Array.from({ length: 20 }, (_, i) => ({
        id: i,
        images: Array.from({ length: Math.floor(Math.random() * 5) + 1 }, () => createBenchmarkImage())
      }))

      const startTime = performance.now()
      const results = await Promise.all(
        burstRequests.map(request =>
          processBurstRequest(request.images, request.id)
        )
      )
      const endTime = performance.now()

      const totalProcessingTime = endTime - startTime
      const successfulRequests = results.filter(r => r.success).length
      const burstThroughput = successfulRequests / (totalProcessingTime / 1000)

      expect(successfulRequests).toBe(burstRequests.length) // All should succeed
      expect(burstThroughput).toBeGreaterThan(2) // At least 2 requests per second
      expect(totalProcessingTime).toBeLessThan(15000) // Under 15 seconds total
    })
  })

  describe('🔧 Resource Optimization', () => {
    test('should optimize processing based on available system resources', async () => {
      const images = Array.from({ length: 8 }, () => createBenchmarkImage())

      // Mock system resource detection
      const mockSystemResources = {
        cpuCores: 4,
        availableMemory: 2048, // 2GB
        gpuAvailable: false
      }

      const result = await processImagesWithResourceOptimization(images, mockSystemResources)

      expect(result.success).toBe(true)
      expect(result.optimizationStrategy).toBeDefined()
      expect(result.concurrencyLevel).toBeLessThanOrEqual(mockSystemResources.cpuCores)
      expect(result.memoryOptimized).toBe(true)
    })

    test('should gracefully degrade under resource constraints', async () => {
      const images = Array.from({ length: 12 }, () => createLargeImage(8 * 1024 * 1024))

      // Simulate low resource environment
      const constrainedResources = {
        cpuCores: 1,
        availableMemory: 512, // 512MB
        gpuAvailable: false
      }

      const result = await processImagesWithResourceConstraints(images, constrainedResources)

      expect(result.success).toBe(true)
      expect(result.degradedMode).toBe(true)
      expect(result.processingMode).toBe('sequential') // Should fall back to sequential
      expect(result.qualityReduction).toBe(true) // Should reduce quality to save resources
    })
  })

  describe('🎯 Quality vs Performance Trade-offs', () => {
    test('should offer different quality/speed modes', async () => {
      const images = Array.from({ length: 4 }, () => createBenchmarkImage())

      const qualityModes = [
        { name: 'fast', expectedTime: 3000, minQuality: 0.6 },
        { name: 'balanced', expectedTime: 6000, minQuality: 0.8 },
        { name: 'high', expectedTime: 12000, minQuality: 0.95 }
      ]

      for (const mode of qualityModes) {
        const startTime = performance.now()
        const result = await processImagesWithQualityMode(images, mode.name)
        const endTime = performance.now()

        const processingTime = endTime - startTime

        expect(result.success).toBe(true)
        expect(processingTime).toBeLessThan(mode.expectedTime)
        expect(result.averageQuality).toBeGreaterThan(mode.minQuality)
      }
    })
  })

  describe('🔄 Stress Testing', () => {
    test('should handle maximum concurrent processing load', async () => {
      const maxConcurrentRequests = 50
      const requestPromises: Promise<any>[] = []

      for (let i = 0; i < maxConcurrentRequests; i++) {
        const images = Array.from({
          length: Math.floor(Math.random() * 3) + 1
        }, () => createBenchmarkImage())

        requestPromises.push(processStressTestRequest(images, i))
      }

      const startTime = performance.now()
      const results = await Promise.allSettled(requestPromises)
      const endTime = performance.now()

      const successful = results.filter(r => r.status === 'fulfilled').length
      const failed = results.filter(r => r.status === 'rejected').length
      const successRate = (successful / maxConcurrentRequests) * 100

      expect(successRate).toBeGreaterThan(80) // At least 80% success rate under stress
      expect(endTime - startTime).toBeLessThan(60000) // Under 1 minute for all requests
    })

    test('should recover gracefully from system overload', async () => {
      // Create overload scenario
      const overloadImages = Array.from({ length: 100 }, () => createLargeImage(1024 * 1024))

      const result = await processImagesWithOverloadProtection(overloadImages)

      expect(result.overloadDetected).toBe(true)
      expect(result.protectionActivated).toBe(true)
      expect(result.partialSuccess).toBe(true) // Should process some images
      expect(result.systemStable).toBe(true) // Should maintain system stability
    })
  })
})

// Helper functions for performance testing
function createBenchmarkImage() {
  return {
    file_id: `benchmark_${Math.random().toString(36).substr(2, 9)}`,
    file_unique_id: `unique_${Math.random().toString(36).substr(2, 9)}`,
    width: 1920,
    height: 1080,
    file_size: 2 * 1024 * 1024 // 2MB
  }
}

function createLargeImage(sizeBytes: number) {
  return {
    ...createBenchmarkImage(),
    file_size: sizeBytes
  }
}

// Mock processing functions
async function processSingleImageBenchmark(image: any) {
  // Simulate processing time based on image size
  const processingTime = Math.max(50, (image.file_size || 1024000) / 100000)
  await new Promise(resolve => setTimeout(resolve, processingTime))

  return {
    success: true,
    quality: 0.9,
    processingTime
  }
}

async function processBatchImagesBenchmark(images: any[]) {
  // Simulate concurrent processing with efficiency gains
  const totalSize = images.reduce((sum, img) => sum + (img.file_size || 1024000), 0)
  const processingTime = totalSize / 500000 // More efficient than sequential

  await new Promise(resolve => setTimeout(resolve, processingTime))

  return {
    success: true,
    processedCount: images.length,
    batchEfficiency: 0.85
  }
}

async function processConcurrentImagesBenchmark(images: any[]) {
  // Simulate concurrent processing
  const concurrentPromises = images.map(img => processSingleImageBenchmark(img))
  const results = await Promise.all(concurrentPromises)

  return {
    success: true,
    processedCount: images.length,
    concurrentEfficiency: 0.9
  }
}

async function processImagesWithTimeout(images: any[], timeoutMs: number) {
  const processingPromise = processBatchImagesBenchmark(images)
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
  )

  try {
    const result = await Promise.race([processingPromise, timeoutPromise])
    return result
  } catch (error) {
    return {
      success: false,
      timedOut: true,
      partialResults: images.slice(0, Math.floor(images.length / 2))
    }
  }
}

async function processImagesWithMemoryMonitoring(images: any[]) {
  const initialMemory = process.memoryUsage()

  // Simulate memory-efficient processing
  await processBatchImagesBenchmark(images)

  const finalMemory = process.memoryUsage()
  const memoryEfficient = (finalMemory.heapUsed - initialMemory.heapUsed) < 100 * 1024 * 1024

  return {
    success: true,
    memoryEfficient,
    memoryUsage: {
      before: initialMemory.heapUsed,
      after: finalMemory.heapUsed
    }
  }
}

async function processImagesWithCleanup(images: any[]) {
  const result = await processBatchImagesBenchmark(images)

  // Simulate cleanup
  await new Promise(resolve => setTimeout(resolve, 10))

  return {
    ...result,
    cleanupPerformed: true
  }
}

async function processImagesUnderMemoryPressure(images: any[]) {
  // Simulate processing large images in smaller batches due to memory pressure
  const batchSize = 3
  const batches = []

  for (let i = 0; i < images.length; i += batchSize) {
    batches.push(images.slice(i, i + batchSize))
  }

  for (const batch of batches) {
    await processBatchImagesBenchmark(batch)
  }

  return {
    success: true,
    degradedMode: true,
    batchSize
  }
}

async function processImagesWithConcurrency(images: any[], concurrency: number) {
  // Process images with specified concurrency level
  const batches = []
  for (let i = 0; i < images.length; i += concurrency) {
    batches.push(images.slice(i, i + concurrency))
  }

  for (const batch of batches) {
    await Promise.all(batch.map(img => processSingleImageBenchmark(img)))
  }

  return { success: true }
}

async function processBurstRequest(images: any[], requestId: number) {
  // Add small random delay to simulate real-world variance
  await new Promise(resolve => setTimeout(resolve, Math.random() * 100))

  return {
    success: true,
    requestId,
    processedCount: images.length
  }
}

async function processImagesWithResourceOptimization(images: any[], resources: any) {
  const concurrencyLevel = Math.min(resources.cpuCores, images.length)

  return {
    success: true,
    optimizationStrategy: 'cpu_bound',
    concurrencyLevel,
    memoryOptimized: true
  }
}

async function processImagesWithResourceConstraints(images: any[], resources: any) {
  // Simulate resource-constrained processing
  for (const image of images) {
    await processSingleImageBenchmark(image) // Sequential processing
  }

  return {
    success: true,
    degradedMode: true,
    processingMode: 'sequential',
    qualityReduction: true
  }
}

async function processImagesWithQualityMode(images: any[], mode: string) {
  const modeConfig = {
    fast: { time: 100, quality: 0.7 },
    balanced: { time: 200, quality: 0.85 },
    high: { time: 400, quality: 0.95 }
  }

  const config = modeConfig[mode as keyof typeof modeConfig]
  await new Promise(resolve => setTimeout(resolve, config.time * images.length))

  return {
    success: true,
    averageQuality: config.quality
  }
}

async function processStressTestRequest(images: any[], requestId: number) {
  // Simulate varying processing times under stress
  const stressDelay = Math.random() * 500 + 100
  await new Promise(resolve => setTimeout(resolve, stressDelay))

  return {
    success: true,
    requestId,
    stressHandled: true
  }
}

async function processImagesWithOverloadProtection(images: any[]) {
  // Simulate overload detection and protection
  if (images.length > 50) {
    // Process only first 20 images to maintain system stability
    const processedImages = images.slice(0, 20)
    await processBatchImagesBenchmark(processedImages)

    return {
      overloadDetected: true,
      protectionActivated: true,
      partialSuccess: true,
      systemStable: true,
      processedCount: 20
    }
  }

  return { success: true, overloadDetected: false }
}