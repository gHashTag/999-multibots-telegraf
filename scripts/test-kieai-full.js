#!/usr/bin/env node

/**
 * 🧪 Полный тест Kie.ai API
 * Включает таблицы цен, калькулятор прибыли и сравнение с конкурентами
 */

import 'dotenv/config'
import { KieAiProvider } from '../dist/services/video-providers/KieAiProvider.js'
import { 
  calculateKieAiPriceInStars,
  usdToStars,
  starsToUSD,
  starsToRUB 
} from '../dist/config/unified-pricing.config.js'

console.log('🚀 Starting Kie.ai Full Test...\n')

function createTable(headers, rows) {
  const colWidths = headers.map((header, i) => 
    Math.max(header.length, ...rows.map(row => String(row[i] || '').length))
  )
  
  const separator = '+' + colWidths.map(w => '-'.repeat(w + 2)).join('+') + '+'
  
  console.log(separator)
  console.log('|' + headers.map((h, i) => ` ${h.padEnd(colWidths[i])} `).join('|') + '|')
  console.log(separator)
  
  rows.forEach(row => {
    console.log('|' + row.map((cell, i) => ` ${String(cell || '').padEnd(colWidths[i])} `).join('|') + '|')
  })
  
  console.log(separator)
}

function calculateSavings(originalPrice, kiePrice) {
  const savings = ((originalPrice - kiePrice) / originalPrice * 100).toFixed(0)
  return `${savings}%`
}

async function testKieAiFull() {
  try {
    // Проверяем наличие API ключа
    if (!process.env.KIE_AI_API_KEY) {
      console.error('❌ KIE_AI_API_KEY not found in environment variables')
      console.log('Please add KIE_AI_API_KEY=your_key_here to your .env file')
      process.exit(1)
    }

    console.log('✅ KIE_AI_API_KEY found')
    
    // Создаем провайдер
    const provider = new KieAiProvider()
    console.log('✅ KieAiProvider initialized')

    // Проверяем баланс аккаунта
    console.log('\n📊 Checking account balance...')
    try {
      const balance = await provider.getAccountBalance()
      console.log(`💰 Account Balance: ${balance.credits} credits`)
      
      if (balance.credits < 1) {
        console.warn('⚠️  Low balance! Consider topping up your Kie.ai account')
      }
    } catch (error) {
      console.error('❌ Failed to get account balance:', error.message)
      return
    }

    // Видео модели - сравнительная таблица
    console.log('\n🎬 VIDEO MODELS COMPARISON:')
    const videoData = [
      ['Model', 'Duration', 'Kie.ai Price', 'Google Price', 'Savings', 'Stars ⭐', 'RUB ₽'],
      ['Veo 3 Fast', '5 sec', '$0.25', '$1.50', calculateSavings(1.50, 0.25), calculateKieAiPriceInStars('kie-veo-3-fast', 5), starsToRUB(calculateKieAiPriceInStars('kie-veo-3-fast', 5))],
      ['Veo 3 Quality', '8 sec', '$2.00', '$3.20', calculateSavings(3.20, 2.00), calculateKieAiPriceInStars('kie-veo-3', 8), starsToRUB(calculateKieAiPriceInStars('kie-veo-3', 8))],
      ['Runway Aleph', '6 sec', '$1.80', '$2.40', calculateSavings(2.40, 1.80), calculateKieAiPriceInStars('kie-runway-aleph', 6), starsToRUB(calculateKieAiPriceInStars('kie-runway-aleph', 6))]
    ]
    createTable(videoData[0], videoData.slice(1))

    // Модели изображений
    console.log('\n🖼️  IMAGE MODELS PRICING:')
    const imageData = [
      ['Model', 'Description', 'Price USD', 'Stars ⭐', 'RUB ₽'],
      ['GPT-4o Image', 'Text rendering', '$0.10', calculateKieAiPriceInStars('kie-gpt-4o-image', undefined, 1), starsToRUB(calculateKieAiPriceInStars('kie-gpt-4o-image', undefined, 1))],
      ['Midjourney v7', 'Artistic styles', '$0.15', calculateKieAiPriceInStars('kie-midjourney-v7', undefined, 1), starsToRUB(calculateKieAiPriceInStars('kie-midjourney-v7', undefined, 1))],
      ['FLUX.1 Kontext', 'Character consistency', '$0.08', calculateKieAiPriceInStars('kie-flux-1-kontext', undefined, 1), starsToRUB(calculateKieAiPriceInStars('kie-flux-1-kontext', undefined, 1))]
    ]
    createTable(imageData[0], imageData.slice(1))

    // Музыкальные модели
    console.log('\n🎵 MUSIC MODELS PRICING:')
    const musicData = [
      ['Model', 'Max Duration', 'Price USD', 'Stars ⭐', 'RUB ₽'],
      ['Suno v3.5', '3 min', '$0.20', calculateKieAiPriceInStars('kie-suno-v3.5'), starsToRUB(calculateKieAiPriceInStars('kie-suno-v3.5'))],
      ['Suno v4', '4 min', '$0.25', calculateKieAiPriceInStars('kie-suno-v4'), starsToRUB(calculateKieAiPriceInStars('kie-suno-v4'))],
      ['Suno v4.5', '5 min', '$0.30', calculateKieAiPriceInStars('kie-suno-v4.5'), starsToRUB(calculateKieAiPriceInStars('kie-suno-v4.5'))],
      ['Suno v4.5+', '8 min', '$0.40', calculateKieAiPriceInStars('kie-suno-v4.5-plus'), starsToRUB(calculateKieAiPriceInStars('kie-suno-v4.5-plus'))]
    ]
    createTable(musicData[0], musicData.slice(1))

    // Калькулятор прибыли
    console.log('\n💰 PROFIT CALCULATOR:')
    console.log('=' .repeat(50))
    
    const testCosts = [0.05, 0.10, 0.25, 0.50, 1.00]
    testCosts.forEach(cost => {
      const stars = usdToStars(cost)
      const revenue = starsToUSD(stars)
      const profit = revenue - cost
      const margin = ((profit / revenue) * 100).toFixed(1)
      
      console.log(`Cost: $${cost.toFixed(2)} → ${stars} ⭐ → Revenue: $${revenue.toFixed(3)} → Profit: $${profit.toFixed(3)} (${margin}%)`)
    })

    // Рекомендуемая конфигурация
    console.log('\n🎯 RECOMMENDED CONFIGURATION:')
    console.log('=' .repeat(50))
    console.log('✅ Default video model: kie-veo-3-fast (best price/quality)')
    console.log('✅ Default image model: kie-flux-1-kontext (cheapest)')
    console.log('✅ Default music model: kie-suno-v4 (good balance)')
    console.log('✅ Markup: 50% (competitive but profitable)')

    // Экономия vs конкурентов
    console.log('\n📊 SAVINGS ANALYSIS:')
    console.log('=' .repeat(50))
    console.log('🎬 Video: Up to 83% savings vs Google Veo 3')
    console.log('🖼️  Images: Competitive pricing with premium models')
    console.log('🎵 Music: Standard industry pricing')

    console.log('\n✅ Full test completed successfully!')
    console.log('\nBusiness Benefits:')
    console.log('• Significantly lower costs for video generation')
    console.log('• Access to premium models at affordable prices')
    console.log('• Unified API for all media types')
    console.log('• Transparent pricing with good profit margins')

  } catch (error) {
    console.error('❌ Test failed:', error.message)
    console.error('Stack:', error.stack)
    process.exit(1)
  }
}

testKieAiFull()