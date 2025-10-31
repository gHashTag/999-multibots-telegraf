/**
 * Тест детекции лица на lip-sync видео
 */

import { detectFaceCoordinates } from '../src/helpers/face-circle-composer'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const execAsync = promisify(exec)

async function testLipSyncFaceDetection() {
  console.log('🔍 [TEST] Testing face detection on LIP-SYNC video...')

  const LIPSYNC_VIDEO = '/tmp/ai-reels-test/lipsync.mp4'
  const frameOutput = '/tmp/ai-reels-test/lipsync-frame-0.jpg'

  try {
    // Извлекаем первый кадр
    console.log('📸 [TEST] Extracting first frame from lip-sync video...')
    const extractCmd = `ffmpeg -i "${LIPSYNC_VIDEO}" -vf "select=eq(n\\,0)" -frames:v 1 "${frameOutput}" -y`
    await execAsync(extractCmd)
    console.log('✅ [TEST] Frame extracted:', frameOutput)

    // Получаем размер видео
    const { stdout: sizeOutput } = await execAsync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${LIPSYNC_VIDEO}"`
    )
    const [width, height] = sizeOutput.trim().split('x').map(Number)
    console.log(`📐 [TEST] Lip-sync video size: ${width}x${height}`)

    // Запускаем детекцию лица
    console.log('🤖 [TEST] Running face detection...')
    const faceCoords = await detectFaceCoordinates(frameOutput)

    console.log('\n✅ [TEST] Face detected on lip-sync!')
    console.log('📊 [TEST] Face coordinates:')
    console.log(`   Center X: ${Math.round(faceCoords.centerX)} (из ${width}px ширины)`)
    console.log(`   Center Y: ${Math.round(faceCoords.centerY)} (из ${height}px высоты)`)
    console.log(`   Radius: ${Math.round(faceCoords.radius)}px`)
    console.log(`   Position from top: ${Math.round((faceCoords.centerY / height) * 100)}%`)

    // Рисуем круг на изображении
    console.log('\n🎨 [TEST] Drawing face circle visualization...')
    const visualOutput = '/tmp/ai-reels-test/lipsync-face-detected.jpg'

    const drawCmd = `convert "${frameOutput}" -stroke red -strokewidth 3 -fill none -draw "circle ${faceCoords.centerX},${faceCoords.centerY} ${faceCoords.centerX + faceCoords.radius},${faceCoords.centerY}" "${visualOutput}"`

    await execAsync(drawCmd)
    console.log('✅ [TEST] Visualization saved:', visualOutput)

    console.log('\n📊 [TEST] Масштабирование к 9:16 (1080x1920):')
    const targetWidth = 1080
    const targetHeight = 1920
    const scaleX = targetWidth / width
    const scaleY = targetHeight / height
    const scale = Math.min(scaleX, scaleY)

    const scaledCenterX = faceCoords.centerX * scale + (targetWidth - width * scale) / 2
    const scaledCenterY = faceCoords.centerY * scale + (targetHeight - height * scale) / 2
    const scaledRadius = faceCoords.radius * scale

    console.log(`   Scale factor: ${scale.toFixed(2)}`)
    console.log(`   Scaled center X: ${Math.round(scaledCenterX)}px`)
    console.log(`   Scaled center Y: ${Math.round(scaledCenterY)}px`)
    console.log(`   Scaled radius: ${Math.round(scaledRadius)}px`)

    console.log('\n📊 [TEST] С учетом offset (-200, +300):')
    console.log(`   Final center X: ${Math.round(scaledCenterX - 200)}px`)
    console.log(`   Final center Y: ${Math.round(scaledCenterY + 300)}px`)

    console.log('\n🎯 To view the result, run:')
    console.log(`   open ${visualOutput}`)

    await execAsync(`open "${visualOutput}"`)

  } catch (error) {
    console.error('❌ [TEST] Error:', error)
    throw error
  }
}

testLipSyncFaceDetection()
  .then(() => {
    console.log('\n✅ [TEST] Test completed')
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ [TEST] Test failed:', error)
    process.exit(1)
  })
