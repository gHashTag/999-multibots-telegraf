/**
 * Тест детекции лица на фоновом видео
 */

import { detectFaceCoordinates } from '../src/helpers/face-circle-composer'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs/promises'

const execAsync = promisify(exec)

async function testFaceDetection() {
  console.log('🔍 [TEST] Testing face detection on background video...')

  const BACKGROUND_VIDEO = '/Users/playra/999-agents-telegraf/avatar_brain/porshe.mp4'
  const tmpDir = '/tmp/face-detection-test'
  const frameOutput = path.join(tmpDir, 'background_frame.jpg')

  try {
    // Создаем временную директорию
    await fs.mkdir(tmpDir, { recursive: true })

    // Извлекаем первый кадр из фонового видео
    console.log('📸 [TEST] Extracting first frame from background video...')
    const extractCmd = `ffmpeg -i "${BACKGROUND_VIDEO}" -vf "select=eq(n\\,0)" -frames:v 1 "${frameOutput}" -y`
    await execAsync(extractCmd)
    console.log('✅ [TEST] Frame extracted:', frameOutput)

    // Получаем размер кадра
    const { stdout: sizeOutput } = await execAsync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${BACKGROUND_VIDEO}"`
    )
    const [bgWidth, bgHeight] = sizeOutput.trim().split('x').map(Number)
    console.log(`📐 [TEST] Background video size: ${bgWidth}x${bgHeight}`)

    // Запускаем детекцию лица
    console.log('🤖 [TEST] Running face detection...')
    const faceCoords = await detectFaceCoordinates(frameOutput)

    console.log('\n✅ [TEST] Face detected!')
    console.log('📊 [TEST] Coordinates:')
    console.log(`   Center X: ${faceCoords.centerX}`)
    console.log(`   Center Y: ${faceCoords.centerY}`)
    console.log(`   Radius: ${faceCoords.radius}`)
    if (faceCoords.box) {
      console.log(`   Box: (${faceCoords.box.x}, ${faceCoords.box.y}) ${faceCoords.box.width}x${faceCoords.box.height}`)
    }

    // Рисуем круг на изображении для визуализации
    console.log('\n🎨 [TEST] Drawing detection visualization...')
    const visualOutput = path.join(tmpDir, 'face_detection_result.jpg')

    // Используем ImageMagick для рисования круга
    const drawCmd = `convert "${frameOutput}" -stroke red -strokewidth 3 -fill none -draw "circle ${faceCoords.centerX},${faceCoords.centerY} ${faceCoords.centerX + faceCoords.radius},${faceCoords.centerY}" "${visualOutput}"`

    try {
      await execAsync(drawCmd)
      console.log('✅ [TEST] Visualization saved:', visualOutput)
      console.log('\n🎯 To view the result, run:')
      console.log(`   open ${visualOutput}`)

      // Автоматически открываем
      await execAsync(`open "${visualOutput}"`)
    } catch (error) {
      console.log('⚠️ [TEST] ImageMagick not available, skipping visualization')
      console.log('   Install with: brew install imagemagick')
    }

    console.log('\n📊 [TEST] Detection summary:')
    console.log(`   Face position: (${Math.round(faceCoords.centerX)}, ${Math.round(faceCoords.centerY)})`)
    console.log(`   Face size: ${Math.round(faceCoords.radius * 2)}px diameter`)
    console.log(`   Relative position: ${Math.round((faceCoords.centerY / bgHeight) * 100)}% from top`)

  } catch (error) {
    console.error('❌ [TEST] Error:', error)
    throw error
  }
}

testFaceDetection()
  .then(() => {
    console.log('\n✅ [TEST] Test completed')
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ [TEST] Test failed:', error)
    process.exit(1)
  })
