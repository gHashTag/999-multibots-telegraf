/**
 * 🎬 E2E Test для Template 1 с реальными видео
 * Использует существующие ассеты для тестирования workflow
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { downloadFile } from '../src/helpers/file-helpers'
import { combineVideos } from '../src/helpers/video-helpers'

// Реальные тестовые URL (существующие ассеты)
const TEST_ASSETS = {
  // Используем тестовые видео от Fal.ai
  LIPSYNC_VIDEO: 'https://storage.googleapis.com/falserverless/example_outputs/veed-fabric-lipsync.mp4',
  VEO31_VIDEO: 'https://storage.googleapis.com/falserverless/example_outputs/veo31-r2v-output.mp4',
}

const SESSION_DATA = {
  telegramId: '123456789',
  imageUrl: 'https://storage.googleapis.com/falserverless/example_outputs/veo31-reference.jpg',
  text: 'Привет! Это тест AI Reels генерации.',
  isRu: true,
}

describe('🎬 Template 1 E2E Test - Real Assets', () => {
  it('should download and verify test videos exist', async () => {
    console.log('📥 Downloading test videos...')

    const tempDir = path.join(os.tmpdir(), `template1-test-${Date.now()}`)
    await fs.mkdir(tempDir, { recursive: true })

    try {
      // Скачиваем тестовые видео
      const lipSyncPath = path.join(tempDir, 'lipsync.mp4')
      const veo31Path = path.join(tempDir, 'veo31.mp4')

      await Promise.all([
        downloadFile(TEST_ASSETS.LIPSYNC_VIDEO, lipSyncPath),
        downloadFile(TEST_ASSETS.VEO31_VIDEO, veo31Path),
      ])

      // Проверяем что файлы скачались
      const lipSyncStats = await fs.stat(lipSyncPath)
      const veo31Stats = await fs.stat(veo31Path)

      expect(lipSyncStats.size).toBeGreaterThan(0)
      expect(veo31Stats.size).toBeGreaterThan(0)

      console.log('✅ Videos downloaded successfully')
      console.log('📊 Lip-sync size:', lipSyncStats.size, 'bytes')
      console.log('📊 Veo 3.1 size:', veo31Stats.size, 'bytes')

      return { lipSyncPath, veo31Path, tempDir }
    } catch (error) {
      console.error('❌ Download failed:', error)
      throw error
    }
  })

  it('should simulate Template 1 workflow with real videos', async () => {
    console.log('🚀 Starting Template 1 E2E workflow...')

    const tempDir = path.join(os.tmpdir(), `template1-e2e-${Date.now()}`)
    await fs.mkdir(tempDir, { recursive: true })

    const startTime = Date.now()

    try {
      // Step 1: Имитируем данные session
      const session = {
        aiReels: {
          step: 'processing',
          imageUrl: SESSION_DATA.imageUrl,
          text: SESSION_DATA.text,
          telegramId: SESSION_DATA.telegramId,
          startTime,
        },
      }

      console.log('Step 1: Session initialized ✅')

      // Step 2: Имитируем получение lip-sync видео
      const lipSyncPath = path.join(tempDir, 'lipsync.mp4')
      await downloadFile(TEST_ASSETS.LIPSYNC_VIDEO, lipSyncPath)

      const lipSyncStats = await fs.stat(lipSyncPath)
      session.aiReels.firstVideoUrl = lipSyncPath

      console.log('Step 2: Lip-sync video prepared ✅')
      console.log('📹 Lip-sync:', lipSyncStats.size, 'bytes')

      // Step 3: Имитируем получение Veo 3.1 видео
      const veo31Path = path.join(tempDir, 'veo31.mp4')
      await downloadFile(TEST_ASSETS.VEO31_VIDEO, veo31Path)

      const veo31Stats = await fs.stat(veo31Path)
      session.aiReels.secondVideoUrl = veo31Path

      console.log('Step 3: Veo 3.1 video prepared ✅')
      console.log('📹 Veo 3.1:', veo31Stats.size, 'bytes')

      // Step 4: Склеивание видео
      const finalPath = path.join(tempDir, 'final-reels.mp4')

      console.log('Step 4: Starting video merge...')
      const mergeResult = await combineVideos(
        [lipSyncPath, veo31Path],
        finalPath,
        {
          resolution: '720p',
          fps: 30,
        }
      )

      console.log('✅ Video merge completed')

      // Проверяем результат
      const finalStats = await fs.stat(finalPath)
      expect(finalStats.size).toBeGreaterThan(0)

      console.log('🎬 Final video created:')
      console.log('📊 Size:', finalStats.size, 'bytes')
      console.log('📁 Path:', finalPath)

      // Проверяем session
      expect(session.aiReels.firstVideoUrl).toBeDefined()
      expect(session.aiReels.secondVideoUrl).toBeDefined()
      expect(session.aiReels.finalVideoUrl).toBeUndefined() // Пока не установлен

      const duration = Date.now() - startTime

      console.log('🎉 E2E workflow completed!')
      console.log('⏱️ Duration:', Math.round(duration / 1000), 'seconds')

      // Сохраняем результат
      session.aiReels.finalVideoUrl = finalPath
      session.aiReels.finalVideoSize = finalStats.size
      session.aiReels.finalVideoDuration = mergeResult.duration || 13 // примерно 5 + 8

      return {
        session,
        finalVideoPath: finalPath,
        finalVideoSize: finalStats.size,
        duration,
      }
    } finally {
      // Очищаем temp файлы
      try {
        await fs.rm(tempDir, { recursive: true, force: true })
        console.log('🧹 Temp files cleaned up')
      } catch (error) {
        console.warn('⚠️ Failed to clean temp files:', error)
      }
    }
  }, 120000)

  it('should verify video properties', async () => {
    console.log('🔍 Verifying video properties...')

    // Скачиваем одно тестовое видео для проверки
    const tempDir = path.join(os.tmpdir(), `video-check-${Date.now()}`)
    await fs.mkdir(tempDir, { recursive: true })

    try {
      const testPath = path.join(tempDir, 'test-video.mp4')
      await downloadFile(TEST_ASSETS.LIPSYNC_VIDEO, testPath)

      const stats = await fs.stat(testPath)

      expect(stats.size).toBeGreaterThan(0)
      expect(stats.size).toBeLessThan(100 * 1024 * 1024) // Меньше 100MB

      console.log('✅ Video properties verified:')
      console.log('📊 File size:', Math.round(stats.size / 1024), 'KB')
      console.log('📅 Modified:', stats.mtime)

      return stats
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })
})

/**
 * 📋 TEST SUMMARY
 * Этот тест показывает:
 *
 * 1. Как работает Template 1 пошагово
 * 2. Где скачиваются видео
 * 3. Как происходит склеивание
 * 4. Сколько времени занимает каждый шаг
 * 5. Размеры итогового файла
 *
 * ВАЖНО: Тест использует существующие ассеты и НЕ ТРАТИТ ДЕНЬГИ!
 */