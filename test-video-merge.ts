/**
 * Тест склейки двух видео
 * Использует готовые URL, не тратит деньги на генерацию
 */

import { combineVideos } from './src/helpers/video-helpers'
import { downloadFile } from './src/helpers/file-helpers'
import path from 'path'
import fs from 'fs/promises'
import os from 'os'

async function testVideoMerge() {
  console.log('🧪 ТЕСТ СКЛЕЙКИ ВИДЕО')
  console.log('=' .repeat(50))

  // Готовые URL (от предыдущего теста)
  const video1Url = 'https://v3b.fal.media/files/b/tiger/mak7VQyKPCP3HJeazjbl__tmp0r5i6khu.mp4'
  const video2Url = 'https://v3b.fal.media/files/b/penguin/Jns1yqrvrnqff91m_C-R2_p9xGAM9j.mp4'

  const tempDir = path.join(os.tmpdir(), `ai-reels-test-${Date.now()}`)
  await fs.mkdir(tempDir, { recursive: true })

  console.log('📂 Временная директория:', tempDir)

  try {
    // Скачиваем оба видео
    console.log('\n📥 Скачиваем видео 1 (lip-sync)...')
    const video1Path = path.join(tempDir, 'video1.mp4')
    await downloadFile(video1Url, video1Path)
    const video1Stats = await fs.stat(video1Path)
    console.log('✅ Видео 1 скачано:', {
      path: video1Path,
      size: video1Stats.size,
      sizeKB: Math.round(video1Stats.size / 1024),
    })

    console.log('\n📥 Скачиваем видео 2 (WAN 2.5)...')
    const video2Path = path.join(tempDir, 'video2.mp4')
    await downloadFile(video2Url, video2Path)
    const video2Stats = await fs.stat(video2Path)
    console.log('✅ Видео 2 скачано:', {
      path: video2Path,
      size: video2Stats.size,
      sizeKB: Math.round(video2Stats.size / 1024),
    })

    // Склеиваем
    console.log('\n🎬 Склеиваем видео...')
    const finalVideoPath = path.join(tempDir, 'final.mp4')

    const startTime = Date.now()
    await combineVideos(
      [video1Path, video2Path],
      finalVideoPath,
      'none', // без перехода
      0
    )
    const duration = Date.now() - startTime

    const finalStats = await fs.stat(finalVideoPath)
    console.log('\n✅ СКЛЕЙКА ЗАВЕРШЕНА!', {
      finalPath: finalVideoPath,
      size: finalStats.size,
      sizeKB: Math.round(finalStats.size / 1024),
      duration: `${duration}ms`,
    })

    console.log('\n📊 ИТОГ:')
    console.log(`Видео 1: ${Math.round(video1Stats.size / 1024)} KB`)
    console.log(`Видео 2: ${Math.round(video2Stats.size / 1024)} KB`)
    console.log(`Финал:   ${Math.round(finalStats.size / 1024)} KB`)
    console.log(`Время:   ${duration}ms`)

    console.log('\n💾 Результат:', finalVideoPath)
    console.log('👉 Проверьте склеенное видео вручную')

  } catch (error) {
    console.error('\n❌ ОШИБКА:', error)
    if (error instanceof Error) {
      console.error('Message:', error.message)
      console.error('Stack:', error.stack)
    }
    throw error
  } finally {
    // НЕ удаляем tempDir для проверки результата
    console.log('\n📁 Временные файлы сохранены для проверки:', tempDir)
  }
}

// Запускаем тест
testVideoMerge()
  .then(() => {
    console.log('\n✅ Тест завершен успешно')
    process.exit(0)
  })
  .catch(error => {
    console.error('\n❌ Тест провален:', error)
    process.exit(1)
  })
