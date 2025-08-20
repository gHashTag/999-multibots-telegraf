#!/usr/bin/env node

/**
 * 🎵 SIMPLE MUSIC VIDEO FRAME GENERATOR
 * Простое тестирование всех ракурсов через наш бот
 * Использует Telegram бот для генерации кадров
 */

const fs = require('fs')
const path = require('path')

// Конфигурация
const CONFIG = {
  sourceImage:
    '/Users/playra/999-multibots-telegraf/assets/bible_vibecoder/lyps-sync.jpg',
  outputDir: '/Users/playra/999-multibots-telegraf/assets/music_video_frames',
  botToken:
    process.env.TG_PRODUCTION_BOT_TOKEN || process.env.TG_DEVELOPMENT_BOT_TOKEN,
}

// Музыкальные ракурсы (те же 8 из предыдущего скрипта)
const MUSIC_VIDEO_ANGLES = [
  {
    id: 'close_up',
    name: '🔍 Крупный план',
    prompt:
      'Emotional close-up shot for music video, intense facial expression, dramatic lighting, professional portrait photography',
    filename: '01_closeup_emotion.jpg',
    priority: 'HIGH',
  },
  {
    id: 'medium_shot',
    name: '📷 Средний план',
    prompt:
      'Medium shot for music video, perfect for lip sync and performance, balanced composition, professional framing',
    filename: '02_medium_performance.jpg',
    priority: 'HIGH',
  },
  {
    id: 'american_shot',
    name: '🇺🇸 Американский план',
    prompt:
      'American shot for music video, cinematic 3/4 framing, dynamic pose, classic cinematography',
    filename: '03_american_cinematic.jpg',
    priority: 'HIGH',
  },
  {
    id: 'low_angle',
    name: '📐 Нижний ракурс',
    prompt:
      'Low angle shot for music video, powerful upward perspective, commanding presence, star power composition',
    filename: '04_lowangle_power.jpg',
    priority: 'HIGH',
  },
  {
    id: 'cowboy_shot',
    name: '🤠 Ковбойский план',
    prompt:
      'Cowboy shot for music video, hip level framing, energetic pose, dynamic composition',
    filename: '05_cowboy_dance.jpg',
    priority: 'ARTISTIC',
  },
  {
    id: 'dutch_angle',
    name: '🎭 Голландский угол',
    prompt:
      'Dutch angle shot for music video, tilted dramatic composition, artistic tension, cinematic drama',
    filename: '06_dutch_dramatic.jpg',
    priority: 'ARTISTIC',
  },
  {
    id: 'profile_shot',
    name: '👤 Профиль',
    prompt:
      'Profile shot for music video, elegant side angle, artistic silhouette, stylish composition',
    filename: '07_profile_artistic.jpg',
    priority: 'ARTISTIC',
  },
  {
    id: 'wide_shot',
    name: '🌐 Общий план',
    prompt:
      'Wide establishing shot for music video, full scene context, environmental composition',
    filename: '08_wide_location.jpg',
    priority: 'ARTISTIC',
  },
]

console.log('🎵 SIMPLE MUSIC VIDEO FRAME GENERATOR')
console.log('====================================')
console.log(`📸 Source: ${CONFIG.sourceImage}`)
console.log(`📁 Output: ${CONFIG.outputDir}`)
console.log(`🤖 Bot: ${CONFIG.botToken ? 'Found' : 'Missing'}`)
console.log(`🎬 Angles: ${MUSIC_VIDEO_ANGLES.length}`)
console.log('')

// Основная функция
async function generateInstructions() {
  // Проверяем исходное изображение
  if (!fs.existsSync(CONFIG.sourceImage)) {
    console.error(`❌ Source image not found: ${CONFIG.sourceImage}`)
    process.exit(1)
  }

  // Создаем выходную папку
  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true })
    console.log(`✅ Created output directory: ${CONFIG.outputDir}`)
  }

  console.log('🎬 MUSIC VIDEO TEST PLAN')
  console.log('========================')
  console.log('')
  console.log('📋 MANUAL TESTING INSTRUCTIONS:')
  console.log('')
  console.log('1️⃣ **START BOT:**')
  console.log('   bun run dev')
  console.log('')
  console.log('2️⃣ **OPEN TELEGRAM BOT**')
  console.log('')
  console.log('3️⃣ **GO TO FLUX KONTEXT:**')
  console.log('   /menu → 🎨 FLUX Kontext → 🎬 Управление камерой')
  console.log('')
  console.log('4️⃣ **FOR EACH ANGLE, DO:**')
  console.log('')

  MUSIC_VIDEO_ANGLES.forEach((angle, index) => {
    const priority =
      angle.priority === 'HIGH' ? '⭐ HIGH PRIORITY' : '🎨 ARTISTIC'
    console.log(
      `   ${String(index + 1).padStart(2, '0')}. ${angle.name} [${priority}]`
    )
    console.log(`       • Select camera angle: ${angle.name}`)
    console.log(`       • Upload image: ${CONFIG.sourceImage}`)
    console.log(`       • Expected filename: ${angle.filename}`)
    console.log(`       • Save result to: ${CONFIG.outputDir}`)
    console.log('')
  })

  console.log('5️⃣ **AFTER TESTING:**')
  console.log('   • Compare results')
  console.log('   • Check image quality')
  console.log('   • Verify camera angles are applied correctly')
  console.log('')

  // Создаем файл с инструкциями
  const instructionsFile = path.join(CONFIG.outputDir, 'TEST_INSTRUCTIONS.md')

  const instructions = `# 🎵 MUSIC VIDEO FRAMES - TEST INSTRUCTIONS

## 📸 Source Image
\`${CONFIG.sourceImage}\`

## 🎯 Testing Process

### 1. Start Bot
\`\`\`bash
bun run dev
\`\`\`

### 2. Access FLUX Kontext
- Open Telegram bot
- Send \`/menu\`
- Select \`🎨 FLUX Kontext\`
- Select \`🎬 Управление камерой\`

### 3. Test Each Angle

${MUSIC_VIDEO_ANGLES.map(
  (angle, index) =>
    `#### ${String(index + 1).padStart(2, '0')}. ${angle.name} ${angle.priority === 'HIGH' ? '[⭐ HIGH PRIORITY]' : '[🎨 ARTISTIC]'}

- **Select:** ${angle.id}
- **Upload:** Source image
- **Expected:** ${angle.prompt}
- **Save As:** \`${angle.filename}\`

`
).join('')}

### 4. Evaluation Criteria

For each generated image, check:
- ✅ **Angle Applied:** Is the camera angle clearly visible?
- ✅ **Image Quality:** Is the result professional and clear?
- ✅ **Subject Preservation:** Is the original subject maintained?
- ✅ **Lighting:** Does the lighting match the angle?
- ✅ **Composition:** Is the framing appropriate?

### 5. Results Summary

Create a summary file with:
- Total successful generations: ___/8
- Best performing angles: _______________
- Issues encountered: __________________
- Overall quality rating (1-10): _________

## 📁 Save Location
All results should be saved to: \`${CONFIG.outputDir}\`
`

  fs.writeFileSync(instructionsFile, instructions)
  console.log(`📋 Instructions saved: ${instructionsFile}`)
  console.log('')
  console.log('🎬 READY TO START TESTING!')
  console.log('==========================')
  console.log('')
  console.log(`📖 Read full instructions: ${instructionsFile}`)
  console.log('🚀 Start bot: bun run dev')
  console.log('📱 Open Telegram and begin testing!')
  console.log('')
  console.log('💡 TIP: Test HIGH PRIORITY angles first!')
  MUSIC_VIDEO_ANGLES.filter(a => a.priority === 'HIGH').forEach(
    (angle, index) => {
      console.log(`   ${index + 1}. ${angle.name}`)
    }
  )
}

// Запускаем генерацию инструкций
if (require.main === module) {
  generateInstructions().catch(error => {
    console.error('💥 ERROR:', error)
    process.exit(1)
  })
}
