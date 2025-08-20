#!/usr/bin/env node

/**
 * 🎵 MUSIC VIDEO FRAME GENERATOR
 * Автоматическая генерация кинематографических кадров для музыкального клипа
 * Image: /Users/playra/999-multibots-telegraf/assets/bible_vibecoder/lyps-sync.jpg
 * Model: FLUX Kontext Max
 */

const fs = require('fs')
const path = require('path')

console.log('🎵 MUSIC VIDEO FRAME GENERATOR')
console.log('==============================')
console.log('📸 Source Image: assets/bible_vibecoder/lyps-sync.jpg')
console.log('🎬 Target: Cinematic frames for music video')
console.log('🔵 Model: FLUX Kontext Max')
console.log('📁 Output: assets/music_video_frames/')
console.log('')

// Ракурсы специально для музыкального клипа
const musicVideoAngles = [
  {
    id: 'close_up',
    name: '🔍 Крупный план',
    prompt:
      'Emotional close-up shot for music video, intense facial expression, dramatic lighting',
    description: 'Эмоциональный крупный план - основа любого клипа',
    priority: 1,
    filename: '01_closeup_emotion.jpg',
  },
  {
    id: 'medium_shot',
    name: '📷 Средний план',
    prompt: 'Medium shot for music video, perfect for lip sync and performance',
    description: 'Классический план для пения и перформанса',
    priority: 1,
    filename: '02_medium_performance.jpg',
  },
  {
    id: 'american_shot',
    name: '🇺🇸 Американский план',
    prompt:
      'American shot for music video, cinematic 3/4 framing, dynamic pose',
    description: 'Кинематографический план - золотой стандарт клипов',
    priority: 1,
    filename: '03_american_cinematic.jpg',
  },
  {
    id: 'cowboy_shot',
    name: '🤠 Ковбойский план',
    prompt: 'Cowboy shot for music video, hip level framing, energetic pose',
    description: 'Динамичный план для танцевальных сцен',
    priority: 2,
    filename: '04_cowboy_dance.jpg',
  },
  {
    id: 'wide_shot',
    name: '🌐 Общий план',
    prompt: 'Wide establishing shot for music video, full scene context',
    description: 'Общий план для показа локации и атмосферы',
    priority: 2,
    filename: '05_wide_location.jpg',
  },
  {
    id: 'dutch_angle',
    name: '🎭 Голландский угол',
    prompt:
      'Dutch angle shot for music video, tilted dramatic composition, artistic tension',
    description: 'Драматический угол для художественного эффекта',
    priority: 2,
    filename: '06_dutch_dramatic.jpg',
  },
  {
    id: 'low_angle',
    name: '📐 Нижний ракурс',
    prompt:
      'Low angle shot for music video, powerful upward perspective, commanding presence',
    description: 'Мощный ракурс для создания образа звезды',
    priority: 1,
    filename: '07_lowangle_power.jpg',
  },
  {
    id: 'profile_shot',
    name: '👤 Профиль',
    prompt:
      'Profile shot for music video, elegant side angle, artistic silhouette',
    description: 'Художественный профиль для стильных моментов',
    priority: 2,
    filename: '08_profile_artistic.jpg',
  },
]

console.log('🎬 MUSIC VIDEO ANGLES SELECTED:')
console.log('================================')

musicVideoAngles.forEach((angle, index) => {
  console.log(
    `${angle.priority === 1 ? '⭐' : '🎨'} ${index + 1}. ${angle.name}`
  )
  console.log(`   📝 ${angle.description}`)
  console.log(`   💾 Output: ${angle.filename}`)
  console.log(`   🎯 Priority: ${angle.priority === 1 ? 'HIGH' : 'MEDIUM'}`)
  console.log('')
})

console.log('💰 COST ESTIMATION:')
console.log('===================')
console.log(`📊 Total Angles: ${musicVideoAngles.length}`)
console.log(`🔵 Model Cost: $0.075 per image`)
console.log(`💸 Total Cost: $${(musicVideoAngles.length * 0.075).toFixed(2)}`)
console.log(
  `⭐ In Stars: ~${Math.round(musicVideoAngles.length * 0.075 * 6.67)} ⭐ (approximate)`
)
console.log('')

console.log('⚙️ SETUP REQUIRED:')
console.log('==================')
console.log('1. 📁 Creating output directory...')

// Создаем папку для результатов
const outputDir = 'assets/music_video_frames'
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true })
  console.log(`✅ Created: ${outputDir}/`)
} else {
  console.log(`✅ Exists: ${outputDir}/`)
}

console.log('2. 📸 Checking source image...')
const sourceImage = 'assets/bible_vibecoder/lyps-sync.jpg'
if (fs.existsSync(sourceImage)) {
  console.log(`✅ Found: ${sourceImage}`)
} else {
  console.log(`❌ Missing: ${sourceImage}`)
  process.exit(1)
}

console.log('')
console.log('🚀 AUTOMATIC GENERATION PLAN:')
console.log('==============================')
console.log('⚠️  ВАЖНО: Для автоматической генерации нужно:')
console.log('')
console.log('1. 🤖 Запустить бот в dev режиме:')
console.log('   pnpm dev')
console.log('')
console.log('2. 🔧 Убедиться что в src/scenes/fluxKontextScene/index.ts:')
console.log('   ctx.session.kontextModelType = "max"')
console.log('')
console.log('3. 📱 Использовать Telegram бот для генерации:')
console.log('   /menu → 🎨 FLUX Kontext → 🎬 Управление камерой')
console.log('')

console.log('🎯 GENERATION SEQUENCE:')
console.log('=======================')

musicVideoAngles.forEach((angle, index) => {
  const step = index + 1
  console.log(`🎬 STEP ${step}: ${angle.name}`)
  console.log(`   1. Open bot: /menu → 🎨 FLUX Kontext → 🎬 Управление камерой`)
  console.log(`   2. Select: "${angle.name}"`)
  console.log(`   3. Upload: ${sourceImage}`)
  console.log(`   4. Wait for generation...`)
  console.log(`   5. Save result as: ${outputDir}/${angle.filename}`)
  console.log(`   6. Rate quality (1-10): Cinematic appeal, angle accuracy`)
  console.log('   ──────────────────────────────────────────')
})

console.log('')
console.log('📊 QUALITY ASSESSMENT CRITERIA:')
console.log('================================')
console.log('🎬 CINEMATIC APPEAL (1-10):')
console.log('   10 = Hollywood movie quality')
console.log('   8-9 = Professional music video')
console.log('   6-7 = Good YouTube content')
console.log('   4-5 = Amateur but usable')
console.log('   1-3 = Not suitable for video')
console.log('')
console.log('🎯 ANGLE ACCURACY (1-10):')
console.log('   10 = Perfect angle execution')
console.log('   8-9 = Very close to expected')
console.log('   6-7 = Good but some deviation')
console.log('   4-5 = Recognizable but off')
console.log('   1-3 = Wrong angle')
console.log('')
console.log('✨ MUSIC VIDEO SUITABILITY (1-10):')
console.log('   10 = Perfect for music video')
console.log('   8-9 = Great for performance shots')
console.log('   6-7 = Good for B-roll')
console.log('   4-5 = Maybe for artistic moments')
console.log('   1-3 = Not suitable')
console.log('')

console.log('🏆 EXPECTED BEST PERFORMERS:')
console.log('=============================')
console.log('🥇 Must-Have Shots:')
console.log('   • 🔍 Close-Up - для эмоциональных моментов')
console.log('   • 📷 Medium Shot - для lip sync сцен')
console.log('   • 🇺🇸 American Shot - кинематографическая классика')
console.log('   • 📐 Low Angle - для создания звездного образа')
console.log('')
console.log('🎨 Artistic Shots:')
console.log('   • 🎭 Dutch Angle - для драматических эффектов')
console.log('   • 👤 Profile - для стильных переходов')
console.log('   • 🤠 Cowboy Shot - для динамичных сцен')
console.log('   • 🌐 Wide Shot - для установочных планов')
console.log('')

console.log('⏱️ ESTIMATED TIMELINE:')
console.log('=======================')
console.log(
  `🕐 Generation Time: ~${musicVideoAngles.length * 2} minutes (2 min per angle)`
)
console.log(
  `📊 Assessment Time: ~${Math.ceil(musicVideoAngles.length / 2)} minutes`
)
console.log(`📁 Organization Time: ~3 minutes`)
console.log(
  `⏰ Total Time: ~${musicVideoAngles.length * 2 + Math.ceil(musicVideoAngles.length / 2) + 3} minutes`
)
console.log('')

console.log('📁 FINAL DELIVERABLES:')
console.log('=======================')
console.log(`📁 ${outputDir}/`)
console.log('   ├── 01_closeup_emotion.jpg      (⭐ HIGH PRIORITY)')
console.log('   ├── 02_medium_performance.jpg   (⭐ HIGH PRIORITY)')
console.log('   ├── 03_american_cinematic.jpg   (⭐ HIGH PRIORITY)')
console.log('   ├── 04_cowboy_dance.jpg         (🎨 ARTISTIC)')
console.log('   ├── 05_wide_location.jpg        (🎨 ARTISTIC)')
console.log('   ├── 06_dutch_dramatic.jpg       (🎨 ARTISTIC)')
console.log('   ├── 07_lowangle_power.jpg       (⭐ HIGH PRIORITY)')
console.log('   ├── 08_profile_artistic.jpg     (🎨 ARTISTIC)')
console.log('   └── music_video_results.txt     (📊 ANALYSIS)')
console.log('')

console.log('✅ MUSIC VIDEO FRAME GENERATOR READY!')
console.log('======================================')
console.log('🎵 Ready to create cinematic frames for your music video!')
console.log('📸 Source: lyps-sync.jpg')
console.log('🎬 8 carefully selected angles for maximum impact')
console.log('🔵 FLUX Kontext Max - highest quality model')
console.log('📁 Organized output structure')
console.log('')
console.log('🚀 START GENERATION:')
console.log('   1. Run: pnpm dev')
console.log('   2. Open Telegram bot')
console.log('   3. Follow the step-by-step guide above')
console.log('   4. Create your music video masterpiece! ��✨')
console.log('')

// Создаем файл с планом генерации
const planContent = `MUSIC VIDEO FRAME GENERATION PLAN
==================================
Date: ${new Date().toISOString().split('T')[0]}
Source Image: ${sourceImage}
Model: FLUX Kontext Max
Output Directory: ${outputDir}/

GENERATION SEQUENCE:
${musicVideoAngles
  .map(
    (angle, i) =>
      `${i + 1}. ${angle.name} → ${angle.filename}
   Prompt: ${angle.prompt}
   Priority: ${angle.priority === 1 ? 'HIGH' : 'MEDIUM'}
   Description: ${angle.description}`
  )
  .join('\n\n')}

QUALITY CRITERIA:
- Cinematic Appeal (1-10)
- Angle Accuracy (1-10)  
- Music Video Suitability (1-10)

EXPECTED TOTAL TIME: ~${musicVideoAngles.length * 2 + Math.ceil(musicVideoAngles.length / 2) + 3} minutes
ESTIMATED COST: $${(musicVideoAngles.length * 0.075).toFixed(2)} (~${Math.round(musicVideoAngles.length * 0.075 * 6.67)} ⭐)
`

fs.writeFileSync(`${outputDir}/generation_plan.txt`, planContent)
console.log(`📋 Plan saved: ${outputDir}/generation_plan.txt`)
