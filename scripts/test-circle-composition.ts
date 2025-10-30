/**
 * Тестовый скрипт для проверки создания композиции с lip-sync в кружочке
 *
 * Использует существующие тестовые ассеты, чтобы не тратить деньги на API
 */

import { createCircleCompositionWithFaceDetection } from '../src/helpers/face-circle-composer'
import path from 'path'

async function testCircleComposition() {
  console.log('🎬 [TEST] Starting circle composition test WITH FACE DETECTION...')

  // Используем существующие тестовые URL (из ai-reels-wizard.ts)
  const TEST_LIPSYNC_VIDEO_URL =
    'https://v3b.fal.media/files/b/tiger/mak7VQyKPCP3HJeazjbl__tmp0r5i6khu.mp4'

  // Используем локальное фоновое видео porshe.mp4 (9:16 формат)
  const BACKGROUND_VIDEO_LOCAL = '/Users/playra/999-agents-telegraf/avatar_brain/porshe.mp4'

  // Временные локальные пути
  const tmpDir = '/tmp/ai-reels-test'
  const lipSyncVideoPath = path.join(tmpDir, 'lipsync.mp4')
  const backgroundVideoPath = BACKGROUND_VIDEO_LOCAL // Используем локальный файл
  const outputPath = path.join(tmpDir, 'circle-composition-result.mp4')

  try {
    // Создаем временную директорию
    const fs = await import('fs/promises')
    await fs.mkdir(tmpDir, { recursive: true })

    console.log('📥 [TEST] Downloading lip-sync video...')

    // Скачиваем только lip-sync видео (фоновое - локальный файл)
    const { downloadFile } = await import('../src/helpers/file-helpers')

    await downloadFile(TEST_LIPSYNC_VIDEO_URL, lipSyncVideoPath)
    console.log('✅ [TEST] Lip-sync video downloaded')

    console.log(`📹 [TEST] Using local background video: ${backgroundVideoPath}`)

    console.log('🎨 [TEST] Creating circle composition WITH FACE DETECTION...')
    console.log('   Format: 9:16 vertical (1080x1920)')
    console.log('   Face detection: ON (detecting on lip-sync video)')
    console.log('   Circle margin: 80px around detected face')
    console.log('   Position offset: -200px X (left), +300px Y (down)')
    console.log('   Duration sync: Trimming to minimum of both videos')

    // Создаем композицию с автоматической детекцией лица на фоновом видео
    const result = await createCircleCompositionWithFaceDetection(
      backgroundVideoPath,
      lipSyncVideoPath,
      outputPath,
      80,   // 80px margin around detected face
      -200, // offsetX: сдвиг влево на 200px
      300   // offsetY: сдвиг вниз на 300px
    )

    console.log('✅ [TEST] Circle composition created successfully!')
    console.log(`📹 Output video: ${result}`)
    console.log('')
    console.log('🎯 To view the result, run:')
    console.log(`   open ${result}`)
    console.log('')
    console.log('📊 Video info:')

    // Показываем информацию о видео
    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)

    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${result}"`
    )
    const duration = parseFloat(stdout.trim())

    console.log(`   Duration: ${duration.toFixed(2)} seconds`)

    // Автоматически открываем видео для просмотра
    console.log('')
    console.log('🚀 Opening video in default player...')
    await execAsync(`open "${result}"`)

  } catch (error) {
    console.error('❌ [TEST] Error:', error)
    throw error
  }
}

// Запускаем тест
testCircleComposition()
  .then(() => {
    console.log('✅ [TEST] Test completed successfully')
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ [TEST] Test failed:', error)
    process.exit(1)
  })
