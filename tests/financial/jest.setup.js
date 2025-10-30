/**
 * Jest Setup for Financial Testing Suite
 * Global test configuration and utilities
 */

// Extend Jest matchers with custom financial matchers
expect.extend({
  toBeWithinStars(received, expected, precision = 0.01) {
    const pass = Math.abs(received - expected) <= precision
    return {
      pass,
      message: () => pass
        ? `Expected ${received} not to be within ${precision} stars of ${expected}`
        : `Expected ${received} to be within ${precision} stars of ${expected}`
    }
  },

  toBeValidCurrency(received) {
    const validCurrencies = ['RUB', 'XTR', 'STARS', 'USD']
    const pass = validCurrencies.includes(received)
    return {
      pass,
      message: () => pass
        ? `Expected ${received} not to be a valid currency`
        : `Expected ${received} to be a valid currency (${validCurrencies.join(', ')})`
    }
  },

  toBeValidBotName(received) {
    const validBotNames = [
      'NeuroPhotoBot',
      'NeuroVideoBot',
      'HaimGroupMedia_bot',
      'TestBot'
    ]
    const pass = validBotNames.includes(received)
    return {
      pass,
      message: () => pass
        ? `Expected ${received} not to be a valid bot name`
        : `Expected ${received} to be a valid bot name (${validBotNames.join(', ')})`
    }
  },

  toHaveValidFinancialStructure(received) {
    const requiredFields = ['telegram_id', 'amount', 'stars', 'type', 'status']
    const hasAllFields = requiredFields.every(field => received.hasOwnProperty(field))

    const validTypes = ['MONEY_INCOME', 'MONEY_OUTCOME', 'BONUS', 'REFUND']
    const hasValidType = validTypes.includes(received.type)

    const validStatuses = ['PENDING', 'COMPLETED', 'FAILED']
    const hasValidStatus = validStatuses.includes(received.status)

    const pass = hasAllFields && hasValidType && hasValidStatus

    return {
      pass,
      message: () => pass
        ? `Expected payment object not to have valid financial structure`
        : `Expected payment object to have valid financial structure. Missing: ${
            !hasAllFields ? `fields [${requiredFields.filter(f => !received.hasOwnProperty(f)).join(', ')}], ` : ''
          }${
            !hasValidType ? `valid type (got ${received.type}), ` : ''
          }${
            !hasValidStatus ? `valid status (got ${received.status})` : ''
          }`
    }
  }
})

// Global test data factory
global.createMockPayment = (overrides = {}) => {
  return {
    id: Math.floor(Math.random() * 1000000),
    telegram_id: 123456789,
    payment_date: new Date().toISOString(),
    amount: 1000,
    description: 'Test payment',
    metadata: {},
    stars: 434,
    currency: 'RUB',
    inv_id: `test_inv_${Date.now()}`,
    invoice_url: null,
    status: 'COMPLETED',
    type: 'MONEY_INCOME',
    service_type: null,
    operation_id: null,
    bot_name: 'NeuroPhotoBot',
    language: 'ru',
    payment_method: 'Robokassa',
    subscription_type: null,
    is_system_payment: false,
    created_at: new Date().toISOString(),
    cost: null,
    category: 'REAL',
    ...overrides
  }
}

// Global user data factory
global.createMockUser = (overrides = {}) => {
  return {
    id: 'test_user_id',
    telegram_id: '123456789',
    first_name: 'Test',
    last_name: 'User',
    username: 'test_user',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    bot_name: 'NeuroPhotoBot',
    ...overrides
  }
}

// Financial calculation utilities
global.FinancialTestUtils = {
  calculateBalance: (payments) => {
    const income = payments
      .filter(p => p.type === 'MONEY_INCOME' || p.type === 'BONUS')
      .filter(p => p.status === 'COMPLETED')
      .reduce((sum, p) => sum + (p.stars || 0), 0)

    const outcome = payments
      .filter(p => p.type === 'MONEY_OUTCOME')
      .filter(p => p.status === 'COMPLETED')
      .reduce((sum, p) => sum + (p.stars || 0), 0)

    return income - outcome
  },

  calculateServiceCost: (serviceType, metadata = {}) => {
    const costs = {
      'neuro_photo': 4,
      'kling_video': 10,
      'haiper_video': 12,
      'morphing': 84,
      'morphing_seamless': 126,
      'image_to_prompt': 1,
      'text_to_speech': 4,
      'model_training_other': 25,
      'minimax_video': 390,
      'video_generation_other': 158
    }

    let baseCost = costs[serviceType] || 0

    // Special logic for neuro_photo
    if (serviceType === 'neuro_photo' && metadata.num_images) {
      const numImages = parseInt(metadata.num_images)
      if (!isNaN(numImages) && numImages > 0) {
        baseCost = numImages * 4
      }
    }

    return baseCost
  },

  formatStars: (amount) => {
    return Math.round(amount * 100) / 100
  },

  isValidPaymentMethod: (method) => {
    return ['Robokassa', 'Telegram', 'Manual', 'System', 'Bonus'].includes(method)
  },

  isValidServiceType: (serviceType) => {
    const validServices = [
      'neuro_photo', 'kling_video', 'haiper_video', 'morphing',
      'morphing_seamless', 'image_to_prompt', 'text_to_speech',
      'model_training_other', 'minimax_video', 'video_generation_other'
    ]
    return validServices.includes(serviceType)
  }
}

// Mock Supabase client
global.mockSupabase = {
  from: jest.fn((table) => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(),
        order: jest.fn(() => ({
          range: jest.fn()
        }))
      })),
      filter: jest.fn(() => ({
        order: jest.fn()
      })),
      order: jest.fn()
    })),
    insert: jest.fn(() => ({
      select: jest.fn()
    })),
    update: jest.fn(() => ({
      eq: jest.fn(() => ({
        select: jest.fn()
      }))
    }))
  }))
}

// Performance monitoring
global.measurePerformance = (fn, name = 'operation') => {
  const start = performance.now()
  const result = fn()
  const end = performance.now()

  console.log(`${name} took ${(end - start).toFixed(2)}ms`)

  return result
}

// Memory usage monitoring
global.measureMemory = (fn, name = 'operation') => {
  const initialMemory = process.memoryUsage()
  const result = fn()
  const finalMemory = process.memoryUsage()

  const memoryDelta = finalMemory.heapUsed - initialMemory.heapUsed
  console.log(`${name} memory delta: ${(memoryDelta / 1024 / 1024).toFixed(2)}MB`)

  return result
}

// Test data generators
global.generateLargeDataset = (size = 1000) => {
  const payments = []
  const botNames = ['NeuroPhotoBot', 'HaimGroupMedia_bot', 'TestBot']
  const services = ['neuro_photo', 'kling_video', 'morphing']

  for (let i = 0; i < size; i++) {
    payments.push(global.createMockPayment({
      id: i,
      telegram_id: Math.floor(i / 10) + 100000000,
      stars: Math.random() * 500,
      type: Math.random() > 0.7 ? 'MONEY_INCOME' : 'MONEY_OUTCOME',
      service_type: Math.random() > 0.5 ? services[Math.floor(Math.random() * services.length)] : null,
      bot_name: botNames[Math.floor(Math.random() * botNames.length)],
      payment_date: new Date(2024, 0, Math.floor(Math.random() * 30) + 1).toISOString()
    }))
  }

  return payments
}

// Error simulation utilities
global.simulateNetworkError = () => {
  throw new Error('Network connection failed')
}

global.simulateDatabaseTimeout = () => {
  throw new Error('Database query timeout')
}

global.simulateInvalidData = () => {
  return {
    telegram_id: 'invalid',
    stars: 'not_a_number',
    type: 'INVALID_TYPE',
    status: 'UNKNOWN_STATUS'
  }
}

// Test environment setup
console.log('🧪 Financial Test Suite Setup Complete')
console.log('📊 Custom matchers loaded')
console.log('🏭 Mock factories available')
console.log('⚡ Performance monitoring enabled')
console.log('💾 Memory tracking enabled')

// Increase timeout for financial calculations
jest.setTimeout(30000)

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
})