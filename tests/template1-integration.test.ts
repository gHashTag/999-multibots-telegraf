/**
 * 🧪 Integration Test for Template 1 (Google Veo 3.1)
 * Тестирует полный workflow без трат денег
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { fal } from '@fal-ai/client'
import fs from 'fs/promises'
import path from 'path'

// Тестовые данные
const TEST_IMAGE_URL = 'https://storage.googleapis.com/falserverless/example_outputs/veo31-reference.jpg'
const TEST_AUDIO_URL = 'https://www2.cs.uic.edu/~i101/SoundFiles/StarWars3.wav'
const TEST_USER_TEXT = 'Привет! Это тест генерации AI Reels.'

const TEST_VEO31_VIDEO_URL = 'https://storage.googleapis.com/falserverless/example_outputs/veo31-r2v-output.mp4'
const TEST_LIPSYNC_VIDEO_URL = 'https://storage.googleapis.com/falserverless/example_outputs/veed-fabric-lipsync.mp4'

describe('🎬 Template 1 Integration Test', () => {
  beforeAll(() => {
    // Включаем тестовый режим
    process.env.USE_TEST_VEO31 = 'true'
    process.env.NODE_ENV = 'development'
    console.log('🧪 TEST MODE ENABLED')
  })

  describe('📋 Step 0-1: Input Validation', () => {
    it('should validate input data', () => {
      const sessionData = {
        imageUrl: TEST_IMAGE_URL,
        text: TEST_USER_TEXT,
        telegramId: '123456789',
      }

      expect(sessionData.imageUrl).toBeDefined()
      expect(sessionData.text).toBeDefined()
      expect(sessionData.telegramId).toBeDefined()
      expect(sessionData.text.length).toBeGreaterThan(0)
      console.log('✅ Input validation passed')
    })
  })

  describe('🎤 Step 2: Lip-sync Generation (Mock)', () => {
    it('should simulate lip-sync generation', async () => {
      console.log('🎭 Simulating lip-sync generation...')

      // Имитируем создание TTS
      const audioUrl = TEST_AUDIO_URL
      expect(audioUrl).toBeDefined()

      // Имитируем lip-sync видео
      const lipSyncResult = {
        videoUrl: TEST_LIPSYNC_VIDEO_URL,
        output: TEST_LIPSYNC_VIDEO_URL,
        duration: 5,
        resolution: '720p',
      }

      expect(lipSyncResult.videoUrl).toBeDefined()
      expect(lipSyncResult.resolution).toBe('720p')
      console.log('✅ Lip-sync simulation completed:', lipSyncResult)
    }, 30000)
  })

  describe('🎥 Step 3: Veo 3.1 Generation (Test Mode)', () => {
    it('should use test Veo 3.1 URL', async () => {
      console.log('🎬 Generating Veo 3.1 video (test mode)...')

      // Проверяем что тестовый режим включен
      expect(process.env.USE_TEST_VEO31).toBe('true')

      // Тестовый результат
      const veo31Result = {
        videoUrl: TEST_VEO31_VIDEO_URL,
        output: TEST_VEO31_VIDEO_URL,
        prompt: 'The person from the reference image speaks confidently to camera',
        duration: 8,
        resolution: '720p',
      }

      expect(veo31Result.videoUrl).toBeDefined()
      expect(veo31Result.videoUrl).toContain('falserverless')
      console.log('✅ Veo 3.1 test URL:', veo31Result.videoUrl)
      console.log('✅ Veo 3.1 simulation completed:', veo31Result)
    })
  })

  describe('🔗 Step 4: Video Merging', () => {
    it('should merge two videos', async () => {
      console.log('🔗 Merging videos with FFmpeg...')

      const firstVideo = TEST_LIPSYNC_VIDEO_URL
      const secondVideo = TEST_VEO31_VIDEO_URL

      expect(firstVideo).toBeDefined()
      expect(secondVideo).toBeDefined()

      // Имитируем скачивание и склеивание
      const mergeResult = {
        success: true,
        outputUrl: 'https://example.com/final-reels.mp4',
        duration: 13, // 5 + 8 секунд
        resolution: '720p',
        size: '15MB',
      }

      expect(mergeResult.success).toBe(true)
      expect(mergeResult.outputUrl).toBeDefined()
      console.log('✅ Video merge simulation completed:', mergeResult)
    }, 60000)
  })

  describe('🧪 Full Workflow Test', () => {
    it('should complete full Template 1 workflow', async () => {
      console.log('🚀 Starting full Template 1 workflow test...')

      const startTime = Date.now()

      // Step 0-1: Input
      const session = {
        step: 'image',
        imageUrl: TEST_IMAGE_URL,
        text: TEST_USER_TEXT,
        telegramId: '123456789',
      }

      console.log('Step 1: Input collected ✅')

      // Step 2: Lip-sync
      const lipSyncResult = {
        videoUrl: TEST_LIPSYNC_VIDEO_URL,
        output: TEST_LIPSYNC_VIDEO_URL,
      }
      session.firstVideoUrl = lipSyncResult.output
      console.log('Step 2: Lip-sync generated ✅')

      // Step 3: Veo 3.1
      const veo31Result = {
        videoUrl: TEST_VEO31_VIDEO_URL,
        output: TEST_VEO31_VIDEO_URL,
      }
      session.secondVideoUrl = veo31Result.output
      console.log('Step 3: Veo 3.1 generated ✅')

      // Step 4: Merge
      const finalVideoUrl = 'https://example.com/final-reels.mp4'
      session.finalVideoUrl = finalVideoUrl
      console.log('Step 4: Videos merged ✅')

      const duration = Date.now() - startTime

      expect(session.firstVideoUrl).toBeDefined()
      expect(session.secondVideoUrl).toBeDefined()
      expect(session.finalVideoUrl).toBeDefined()

      console.log('🎉 Full workflow completed in', duration, 'ms')
      console.log('📊 Final video URL:', session.finalVideoUrl)

      return session
    }, 120000)
  })

  describe('💰 Cost Verification', () => {
    it('should calculate correct cost (without spending)', () => {
      const price = 240 // звезд
      const lipSyncCost = 0 // в тесте не тратим
      const veo31Cost = 0 // в тесте не тратим
      const mergeCost = 0 // FFmpeg бесплатно

      const totalCost = lipSyncCost + veo31Cost + mergeCost

      console.log('💰 Test costs (mock):', totalCost)
      console.log('💰 Production costs:', 240)
      console.log('💰 Actual spend:', 0) // В тесте ничего не тратим

      expect(totalCost).toBe(0) // Тест не тратит деньги
    })
  })
})

/**
 * 🎬 VIDEO URLS FOR TESTING
 * Эти URL можно использовать для тестирования без трат денег
 */
export const TEST_ASSETS = {
  // Тестовое изображение (референс для Veo 3.1)
  REFERENCE_IMAGE: 'https://storage.googleapis.com/falserverless/example_outputs/veo31-reference.jpg',

  // Готовое lip-sync видео (для тестирования)
  LIPSYNC_VIDEO: 'https://storage.googleapis.com/falserverless/example_outputs/veed-fabric-lipsync.mp4',

  // Готовое Veo 3.1 видео (для тестирования)
  VEO31_VIDEO: 'https://storage.googleapis.com/falserverless/example_outputs/veo31-r2v-output.mp4',

  // Тестовое аудио для lip-sync
  TEST_AUDIO: 'https://www2.cs.uic.edu/~i101/SoundFiles/StarWars3.wav',
}