#!/usr/bin/env node

/**
 * 🔍 ЛОКАЛЬНЫЙ ТЕСТ ВАЛИДАЦИИ DATA URL
 * Проверяет, работает ли новая схема SeeDream4 с data:image URLs
 */

const { z } = require('zod')

// Копия новой схемы для тестирования
const SeeDream4InputSchema = z.object({
  prompt: z
    .string()
    .min(3, '🚨 Prompt must be at least 3 characters long')
    .max(2000, '🚨 Prompt too long')
    .refine(
      (prompt) => prompt.trim().length > 0,
      '🚨 Prompt cannot be empty or whitespace'
    ),
  size: z.enum(['1K', '2K', '4K', 'custom']).default('1K'),
  max_images: z.number().int().min(1).max(15).default(1),
  image_input: z.array(
    z.string()
      .refine(
        (str) => str.startsWith('http') || str.startsWith('data:image/'),
        '🚨 Invalid image URL or data URL'
      )
  ).min(1).max(10).optional(),
  telegram_id: z.string().optional(),
  username: z.string().optional(),
  is_ru: z.boolean().optional(),
}).strict()

function testValidation(testName, input) {
  console.log(`\n🧪 ТЕСТ: ${testName}`)
  console.log('Input:', JSON.stringify(input, null, 2))

  try {
    const result = SeeDream4InputSchema.parse(input)
    console.log('✅ УСПЕХ: Валидация прошла')
    console.log('Validated:', {
      promptLength: result.prompt.length,
      size: result.size,
      max_images: result.max_images,
      imageInputCount: result.image_input?.length || 0,
      imageInputTypes: result.image_input?.map(url =>
        url.startsWith('data:') ? 'data_url' : 'http_url'
      ) || []
    })
    return true
  } catch (error) {
    console.log('❌ ОШИБКА:', error.message)
    return false
  }
}

// Тестовые кейсы
console.log('🔍 ТЕСТИРОВАНИЕ ВАЛИДАЦИИ DATA URLs')

// Test 1: Valid HTTP URL
testValidation('Valid HTTP URL', {
  prompt: 'merge two images together',
  size: '2K',
  max_images: 1,
  image_input: ['https://example.com/image.jpg'],
  telegram_id: '123456789'
})

// Test 2: Valid Data URL
const testBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
testValidation('Valid Data URL', {
  prompt: 'merge two images together',
  size: '2K',
  max_images: 2,
  image_input: [
    `data:image/jpeg;base64,${testBase64}`,
    `data:image/png;base64,${testBase64}`
  ],
  telegram_id: '123456789'
})

// Test 3: Mixed URLs
testValidation('Mixed HTTP + Data URLs', {
  prompt: 'merge two images together',
  size: '2K',
  max_images: 2,
  image_input: [
    'https://example.com/image1.jpg',
    `data:image/jpeg;base64,${testBase64}`
  ],
  telegram_id: '123456789'
})

// Test 4: Invalid URL
testValidation('Invalid URL', {
  prompt: 'merge two images together',
  size: '2K',
  max_images: 1,
  image_input: ['invalid-url'],
  telegram_id: '123456789'
})

// Test 5: User prompt like 'merge'
testValidation('User prompt "merge"', {
  prompt: 'merge',
  size: '2K',
  max_images: 2,
  image_input: [
    `data:image/jpeg;base64,${testBase64}`,
    `data:image/jpeg;base64,${testBase64}`
  ],
  telegram_id: '123456789'
})

console.log('\n🎯 ТЕСТИРОВАНИЕ ЗАВЕРШЕНО')