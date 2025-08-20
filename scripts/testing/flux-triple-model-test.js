#!/usr/bin/env node

/**
 * 🎯 FLUX TRIPLE MODEL QUALITY TEST
 * Быстрое сравнение качества: Pro vs Max vs Ultra на одном изображении
 * Изображение: /Users/playra/999-multibots-telegraf/assets/bible_vibecoder/lyps-sync.jpg
 */

const fs = require('fs')
const path = require('path')

console.log('🎯 FLUX TRIPLE MODEL QUALITY TEST')
console.log('=================================')
console.log('📸 Test Image: assets/bible_vibecoder/lyps-sync.jpg')
console.log('🔬 Testing 3 models on ONE image')
console.log('')

// Три модели для тестирования
const models = [
  {
    type: 'pro',
    name: 'FLUX Kontext Pro',
    key: 'black-forest-labs/flux-kontext-pro',
    cost: '$0.055',
    expected: 'State-of-the-art quality, best prompt following',
    color: '🟢',
  },
  {
    type: 'max',
    name: 'FLUX Kontext Max',
    key: 'black-forest-labs/flux-kontext-max',
    cost: '$0.075',
    expected: 'Premium performance, improved typography',
    color: '🔵',
  },
  {
    type: 'ultra',
    name: 'FLUX 1.1 Pro Ultra',
    key: 'black-forest-labs/flux-1.1-pro-ultra',
    cost: '$0.06',
    expected: '6x faster, 4K resolution, highest Elo score',
    color: '🟡',
  },
]

console.log('🏆 MODEL COMPARISON OVERVIEW:')
console.log('============================')

models.forEach((model, index) => {
  console.log(`${model.color} ${index + 1}. ${model.name}`)
  console.log(`   💰 Cost: ${model.cost}`)
  console.log(`   🎯 Expected: ${model.expected}`)
  console.log(`   🔧 Model Key: ${model.key}`)
  console.log('')
})

// Ранжирование по ожидаемому качеству
console.log('📊 EXPECTED RANKING (Quality):')
console.log('==============================')
console.log('🥇 1st: FLUX 1.1 Pro Ultra - новейшая модель, высший Elo')
console.log('🥈 2nd: FLUX Kontext Pro - лучшее следование промптам')
console.log('🥉 3rd: FLUX Kontext Max - стабильная, проверенная')
console.log('')

console.log('💰 COST RANKING (Cheapest to Most Expensive):')
console.log('==============================================')
console.log('🟢 1st: Pro ($0.055) - самая дешевая!')
console.log('🟡 2nd: Ultra ($0.06) - средняя стоимость')
console.log('🔵 3rd: Max ($0.075) - самая дорогая')
console.log('')

console.log('🎯 TESTING STRATEGY:')
console.log('====================')
console.log('1. Используйте одно и то же изображение для всех 3 тестов')
console.log(
  '2. Используйте один и тот же угол камеры (например: "📷 Средний план")'
)
console.log('3. Сравните результаты по критериям:')
console.log('   • Качество изображения')
console.log('   • Следование промпту')
console.log('   • Детализация')
console.log('   • Скорость генерации')
console.log('   • Соотношение цена/качество')
console.log('')

console.log('⚙️ КАК ТЕСТИРОВАТЬ:')
console.log('==================')
console.log(
  'В файле src/scenes/fluxKontextScene/index.ts, функция handleCameraSetting:'
)
console.log('')

models.forEach((model, index) => {
  console.log(`${model.color} ТЕСТ ${index + 1}: ${model.name}`)
  console.log(
    `   Раскомментируйте: ctx.session.kontextModelType = '${model.type}'`
  )
  console.log(`   Сохраните результат как: ${model.type}_test.jpg`)
  console.log('')
})

console.log('📝 ПОШАГОВЫЙ ПЛАН ТЕСТИРОВАНИЯ:')
console.log('===============================')

console.log('🎬 ПОДГОТОВКА:')
console.log('1. Откройте бот: /menu → 🎨 FLUX Kontext → 🎬 Управление камерой')
console.log('2. Подготовьте изображение: assets/bible_vibecoder/lyps-sync.jpg')
console.log(
  '3. Выберите один угол камеры для всех тестов (рекомендую: "📷 Средний план")'
)
console.log('')

models.forEach((model, index) => {
  console.log(`${model.color} ТЕСТ ${index + 1} - ${model.name.toUpperCase()}:`)
  console.log(
    `📝 1. Измените код: ctx.session.kontextModelType = '${model.type}'`
  )
  console.log('🔄 2. Перезапустите бота (если нужно)')
  console.log('📷 3. Выберите "📷 Средний план"')
  console.log('🖼️ 4. Загрузите: assets/bible_vibecoder/lyps-sync.jpg')
  console.log('⏱️ 5. Засеките время генерации')
  console.log(`💾 6. Сохраните как: ${model.type}_lyps_sync_test.jpg`)
  console.log('📊 7. Оцените качество по критериям выше')

  if (index < models.length - 1) {
    console.log('───────────────────────────────────────')
  }
  console.log('')
})

console.log('🏁 ПОСЛЕ ТЕСТИРОВАНИЯ:')
console.log('======================')
console.log('1. Сравните 3 изображения side-by-side')
console.log('2. Оцените каждую модель по шкале 1-10:')
console.log('   • Качество: _/10')
console.log('   • Детализация: _/10')
console.log('   • Следование промпту: _/10')
console.log('   • Скорость: _/10')
console.log('   • Цена/качество: _/10')
console.log('3. Выберите ПОБЕДИТЕЛЯ! 🏆')
console.log('')

console.log('🎯 ОЖИДАЕМЫЙ РЕЗУЛЬТАТ:')
console.log('=======================')
console.log('🟡 ULTRA должен показать:')
console.log('   ✨ Лучшее качество (новейшая модель)')
console.log('   ⚡ Самую быструю генерацию (6x faster)')
console.log('   🎯 Отличное следование промптам')
console.log('   💰 Разумную стоимость ($0.06)')
console.log('')
console.log('🟢 PRO должен показать:')
console.log('   💡 Отличное следование промптов')
console.log('   🏆 Высокое качество')
console.log('   💰 Лучшую цену ($0.055)')
console.log('')
console.log('🔵 MAX должен показать:')
console.log('   📝 Хорошую работу с типографикой')
console.log('   ⚖️ Стабильные результаты')
console.log('   💸 Высшую стоимость ($0.075)')
console.log('')

console.log('✅ ГОТОВ К ТЕСТИРОВАНИЮ!')
console.log('========================')
console.log('🎬 Начните с любой модели и протестируйте все 3!')
console.log('📸 Используйте: assets/bible_vibecoder/lyps-sync.jpg')
console.log('⏱️ Время тестирования: ~6 минут (по 2 мин на модель)')
console.log('🏆 Цель: Найти лучшую модель для вашего проекта!')
console.log('')
console.log('Удачи! Пусть победит лучшая модель! 🥇✨')
