#!/usr/bin/env node

/**
 * 🎬 FLUX KONTEXT MAX - ALL CAMERA ANGLES TEST
 * Тестирование модели FLUX Kontext Max на всех 17 ракурсах камеры
 * Изображение: /Users/playra/999-multibots-telegraf/assets/bible_vibecoder/lyps-sync.jpg
 * Результаты сохраняются в: /Users/playra/999-multibots-telegraf/assets/flux_max_test_results/
 */

const fs = require('fs')
const path = require('path')

console.log('🎬 FLUX KONTEXT MAX - ALL CAMERA ANGLES TEST')
console.log('=============================================')
console.log('📸 Test Image: assets/bible_vibecoder/lyps-sync.jpg')
console.log('🔵 Model: FLUX Kontext Max ($0.075)')
console.log('📁 Results Folder: assets/flux_max_test_results/')
console.log('🎯 Testing ALL 17 camera angles')
console.log('')

// Все 17 углов камеры в правильном порядке
const cameraAngles = [
  {
    key: 'medium_shot',
    name: '📷 Средний план',
    name_en: '📷 Medium Shot',
    description: 'Balanced composition, professional framing',
    expected: 'Natural perspective, good for portraits',
  },
  {
    key: 'close_up',
    name: '🔍 Крупный план',
    name_en: '🔍 Close-Up',
    description: 'Intimate perspective, detailed facial features',
    expected: 'Focus on face and emotions',
  },
  {
    key: 'extreme_closeup',
    name: '🔬 Экстра крупный план',
    name_en: '🔬 Extreme Close-Up',
    description: 'Ultra detailed, macro perspective, intense intimacy',
    expected: 'Very close details, artistic focus',
  },
  {
    key: 'wide_shot',
    name: '🌐 Общий план',
    name_en: '🌐 Wide Shot',
    description: 'Full scene overview, establishing shot',
    expected: 'Full body or environment view',
  },
  {
    key: 'american_shot',
    name: '🇺🇸 Американский план',
    name_en: '🇺🇸 American Shot',
    description: '3/4 length, knee up framing, classic cinematography',
    expected: 'From knees up, cinematic look',
  },
  {
    key: 'cowboy_shot',
    name: '🤠 Ковбойский план',
    name_en: '🤠 Cowboy Shot',
    description: 'Hip level framing, western cinema style, dynamic pose',
    expected: 'From hips up, dynamic composition',
  },
  {
    key: 'profile_shot',
    name: '👤 Профиль',
    name_en: '👤 Profile',
    description: 'Profile view, elegant side angle, silhouette lighting',
    expected: 'Side view, elegant profile',
  },
  {
    key: 'three_quarter',
    name: '📐 3/4 ракурс',
    name_en: '📐 Three-Quarter View',
    description: '3/4 angle, dimensional depth, professional portrait',
    expected: 'Three-quarter angle, natural pose',
  },
  {
    key: 'back_shot',
    name: '🔄 Съемка сзади',
    name_en: '🔄 Back Shot',
    description: 'Back view, over the shoulder perspective, mysterious angle',
    expected: 'View from behind, mysterious feel',
  },
  {
    key: 'over_shoulder',
    name: '🏔️ Через плечо',
    name_en: '🏔️ Over-the-Shoulder',
    description: 'Over-the-shoulder shot, classic conversation angle',
    expected: 'Over shoulder perspective',
  },
  {
    key: 'eye_level',
    name: '👁️ На уровне глаз',
    name_en: '👁️ Eye Level',
    description: 'Eye level shot, neutral perspective, natural human viewpoint',
    expected: 'Natural eye-level view',
  },
  {
    key: 'dutch_angle',
    name: '🎭 Голландский угол',
    name_en: '🎭 Dutch Angle',
    description:
      'Dutch angle, tilted composition, dynamic tension, cinematic drama',
    expected: 'Tilted horizon, dramatic effect',
  },
  {
    key: 'high_angle',
    name: '📐 Верхний ракурс',
    name_en: '📐 High Angle',
    description:
      'High angle shot, looking down perspective, dramatic composition',
    expected: 'Camera above subject, looking down',
  },
  {
    key: 'low_angle',
    name: '📐 Нижний ракурс',
    name_en: '📐 Low Angle',
    description: 'Low angle shot, looking up perspective, powerful composition',
    expected: 'Camera below subject, empowering view',
  },
  {
    key: 'birds_eye',
    name: '🦅 Вид с высоты птичьего полета',
    name_en: "🦅 Bird's Eye View",
    description:
      "Bird's eye view, overhead shot, top down perspective, aerial viewpoint",
    expected: 'Top-down view, aerial perspective',
  },
  {
    key: 'worms_eye',
    name: '🐛 Вид снизу вверх',
    name_en: "🐛 Worm's Eye View",
    description:
      "Worm's eye view, extreme low angle shot, camera positioned on ground looking up",
    expected: 'Extreme upward angle, dramatic perspective',
  },
  {
    key: 'macro_beauty',
    name: '💎 Макро красота',
    name_en: '💎 Macro Beauty',
    description: 'Macro beauty shot, extreme close-up, skin detail focus',
    expected: 'Ultra-close beauty details',
  },
]

console.log('🎯 TESTING OVERVIEW:')
console.log('===================')
console.log(`📊 Total Angles: ${cameraAngles.length}`)
console.log('🔵 Model: FLUX Kontext Max')
console.log('💰 Cost per image: $0.075 (⭐ varies by exchange rate)')
console.log(
  `💸 Total estimated cost: $${(0.075 * cameraAngles.length).toFixed(2)}`
)
console.log('')

console.log('📂 FOLDER STRUCTURE:')
console.log('====================')
console.log('📁 Input: assets/bible_vibecoder/lyps-sync.jpg')
console.log('📁 Output: assets/flux_max_test_results/')
console.log('   ├── 01_medium_shot_max.jpg')
console.log('   ├── 02_close_up_max.jpg')
console.log('   ├── 03_extreme_closeup_max.jpg')
console.log('   ├── ... (до 17_macro_beauty_max.jpg)')
console.log('   └── test_results_summary.txt')
console.log('')

console.log('🎬 CAMERA ANGLES TO TEST:')
console.log('=========================')

cameraAngles.forEach((angle, index) => {
  console.log(`${(index + 1).toString().padStart(2, '0')}. ${angle.name}`)
  console.log(`    🎯 Expected: ${angle.expected}`)
  console.log(`    📝 Description: ${angle.description}`)
  console.log(
    `    💾 Save as: ${(index + 1).toString().padStart(2, '0')}_${angle.key}_max.jpg`
  )

  if (index < cameraAngles.length - 1) {
    console.log('')
  }
})

console.log('')
console.log('⚙️ SETUP INSTRUCTIONS:')
console.log('======================')
console.log('1. 📝 Измените в коде src/scenes/fluxKontextScene/index.ts:')
console.log(
  "   ctx.session.kontextModelType = 'max'  // Убедитесь что стоит MAX!"
)
console.log('')
console.log('2. 📁 Создайте папку для результатов:')
console.log('   mkdir -p assets/flux_max_test_results')
console.log('')
console.log('3. 🤖 Запустите бота:')
console.log('   pnpm dev')
console.log('')

console.log('🎯 TESTING PROCESS:')
console.log('==================')

cameraAngles.forEach((angle, index) => {
  console.log(
    `🎬 ТЕСТ ${(index + 1).toString().padStart(2, '0')}: ${angle.name.toUpperCase()}`
  )
  console.log(
    '   1. Откройте бот: /menu → 🎨 FLUX Kontext → 🎬 Управление камерой'
  )
  console.log(`   2. Выберите: "${angle.name}"`)
  console.log('   3. Загрузите: assets/bible_vibecoder/lyps-sync.jpg')
  console.log('   4. ⏱️ Засеките время генерации')
  console.log('   5. 📊 Оцените качество (1-10):')
  console.log('      • Качество изображения: _/10')
  console.log('      • Соответствие ракурсу: _/10')
  console.log('      • Детализация: _/10')
  console.log('   6. 💾 Сохраните результат как:')
  console.log(
    `      assets/flux_max_test_results/${(index + 1).toString().padStart(2, '0')}_${angle.key}_max.jpg`
  )

  if (index < cameraAngles.length - 1) {
    console.log('   ──────────────────────────────────────────────')
  }
  console.log('')
})

console.log('📊 ANALYSIS CRITERIA:')
console.log('=====================')
console.log('Для каждого ракурса оценивайте:')
console.log('')
console.log('🎯 1. ТОЧНОСТЬ РАКУРСА (1-10):')
console.log('   10 = Идеально соответствует описанию угла')
console.log('   8-9 = Очень близко к ожидаемому')
console.log('   6-7 = Хорошо, но есть отклонения')
console.log('   4-5 = Понятно что за ракурс, но неточно')
console.log('   1-3 = Не соответствует описанию')
console.log('')
console.log('✨ 2. КАЧЕСТВО ИЗОБРАЖЕНИЯ (1-10):')
console.log('   10 = Фотореалистично, безупречно')
console.log('   8-9 = Очень высокое качество')
console.log('   6-7 = Хорошее качество')
console.log('   4-5 = Приемлемое качество')
console.log('   1-3 = Низкое качество, артефакты')
console.log('')
console.log('🔍 3. ДЕТАЛИЗАЦИЯ (1-10):')
console.log('   10 = Невероятная детализация')
console.log('   8-9 = Отличная детализация')
console.log('   6-7 = Хорошая детализация')
console.log('   4-5 = Средняя детализация')
console.log('   1-3 = Слабая детализация')
console.log('')

console.log('🏆 EXPECTED TOP PERFORMERS:')
console.log('===========================')
console.log('🥇 Best for Portraits:')
console.log('   • 🔍 Close-Up - лучше всего для лиц')
console.log('   • 📷 Medium Shot - универсальный портрет')
console.log('   • 💎 Macro Beauty - детализация кожи')
console.log('')
console.log('🎨 Most Creative:')
console.log('   • 🎭 Dutch Angle - драматический эффект')
console.log('   • 🐛 Worms Eye View - уникальная перспектива')
console.log('   • 🦅 Birds Eye View - необычный взгляд')
console.log('')
console.log('🎬 Most Cinematic:')
console.log('   • 🇺🇸 American Shot - классика кино')
console.log('   • 🤠 Cowboy Shot - динамичная композиция')
console.log('   • 🏔️ Over Shoulder - кинематографично')
console.log('')

console.log('📁 РЕЗУЛЬТАТЫ И АНАЛИЗ:')
console.log('=======================')
console.log('После завершения всех тестов создайте файл:')
console.log('assets/flux_max_test_results/test_results_summary.txt')
console.log('')
console.log('Формат отчёта:')
console.log('==============')
console.log('FLUX KONTEXT MAX - CAMERA ANGLES TEST RESULTS')
console.log('==============================================')
console.log('Test Date: [дата]')
console.log('Model: FLUX Kontext Max')
console.log('Test Image: lyps-sync.jpg')
console.log('Total Angles Tested: 17')
console.log('')
console.log('TOP 5 BEST RESULTS:')
console.log('1. [angle_name] - Score: _/10 - Comment: [...]')
console.log('2. [angle_name] - Score: _/10 - Comment: [...]')
console.log('3. [angle_name] - Score: _/10 - Comment: [...]')
console.log('4. [angle_name] - Score: _/10 - Comment: [...]')
console.log('5. [angle_name] - Score: _/10 - Comment: [...]')
console.log('')
console.log('WORST 3 RESULTS:')
console.log('15. [angle_name] - Score: _/10 - Issues: [...]')
console.log('16. [angle_name] - Score: _/10 - Issues: [...]')
console.log('17. [angle_name] - Score: _/10 - Issues: [...]')
console.log('')
console.log('OVERALL ASSESSMENT:')
console.log('Average Score: _/10')
console.log('Best Category: [Portraits/Creative/Cinematic]')
console.log('Model Strengths: [список]')
console.log('Model Weaknesses: [список]')
console.log('Recommendation: [общая оценка модели]')
console.log('')

console.log('⏱️ ESTIMATED TIME:')
console.log('==================')
console.log(
  `🕐 Total Testing Time: ~${cameraAngles.length * 2} минут (по 2 мин на ракурс)`
)
console.log('📊 Analysis Time: ~10 минут')
console.log('📁 Organization Time: ~5 минут')
console.log(`⏰ Total Time: ~${cameraAngles.length * 2 + 15} минут`)
console.log('')

console.log('✅ READY TO START!')
console.log('==================')
console.log('🎬 Вы готовы протестировать FLUX Kontext Max на всех 17 ракурсах!')
console.log('📸 Используйте изображение: assets/bible_vibecoder/lyps-sync.jpg')
console.log('🔵 Модель: FLUX Kontext Max (самая топовая!)')
console.log('📁 Сохраняйте в: assets/flux_max_test_results/')
console.log('🏆 Цель: Найти лучшие ракурсы для разных типов съемки!')
console.log('')
console.log('🎯 Начинайте с любого ракурса!')
console.log('Удачного тестирования! 📸✨')
