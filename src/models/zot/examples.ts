/**
 * ZOT Model Usage Examples
 *
 * Comprehensive examples demonstrating how to use the ZOT validation system
 * for financial data analysis and validation.
 *
 * @version 1.0.0
 * @author ZOT Model Creator Agent
 */

import {
  ZOTPaymentType,
  ZOTMoneySource,
  ZOTServiceCategory,
  ZOTConfidenceLevel,
  ZOTValidationStatus,
} from './interfaces'
import { ZOTClassifier, ZOTTransactionData } from './classifier'
import { ZOTValidator } from './validator'

/**
 * Example 1: Basic Transaction Classification
 */
export async function exampleBasicClassification() {
  console.log('=== ZOT Basic Classification Example ===')

  // Create a classifier instance
  const classifier = new ZOTClassifier()

  // Example transaction data
  const transaction: ZOTTransactionData = {
    id: 'txn-001',
    telegram_id: '123456789',
    amount: 500,
    stars: 0,
    type: 'MONEY_INCOME',
    payment_method: 'Robokassa',
    service_type: 'neuro_photo',
    bot_name: 'ai-photo-bot',
    description: 'Photo generation service payment',
    inv_id: 'inv-12345',
    status: 'COMPLETED',
    metadata: { num_images: 5 },
    subscription: null,
    currency: 'RUB',
    created_at: '2024-01-15T10:00:00.000Z',
    updated_at: '2024-01-15T10:01:00.000Z',
  }

  // Classify the transaction
  const result = classifier.classifyTransaction(transaction)

  console.log('Classification Result:')
  console.log(`- Payment Type: ${result.paymentType}`)
  console.log(`- Money Source: ${result.moneySource}`)
  console.log(`- Service Category: ${result.serviceCategory}`)
  console.log(`- Confidence: ${result.confidence}%`)
  console.log(`- Confidence Level: ${result.confidenceLevel}`)
  console.log(`- Applied Rules: ${result.appliedRules.join(', ')}`)

  if (result.errors.length > 0) {
    console.log('Errors Found:')
    result.errors.forEach(error => {
      console.log(`  - ${error.code}: ${error.message}`)
    })
  }

  if (result.warnings.length > 0) {
    console.log('Warnings:')
    result.warnings.forEach(warning => {
      console.log(`  - ${warning.code}: ${warning.message}`)
    })
  }

  return result
}

/**
 * Example 2: Telegram Stars Transaction
 */
export async function exampleTelegramStarsClassification() {
  console.log('=== ZOT Telegram Stars Classification Example ===')

  const classifier = new ZOTClassifier()

  const starsTransaction: ZOTTransactionData = {
    id: 'stars-001',
    telegram_id: '987654321',
    amount: 0,
    stars: 150,
    type: 'MONEY_INCOME',
    payment_method: 'Telegram',
    service_type: '',
    bot_name: 'premium-bot',
    description: 'Telegram Stars purchase',
    inv_id: 'stars-inv-001',
    status: 'COMPLETED',
    metadata: {},
    subscription: null,
    currency: 'XTR',
    created_at: '2024-01-15T11:00:00.000Z',
  }

  const result = classifier.classifyTransaction(starsTransaction)

  console.log('Telegram Stars Classification:')
  console.log(
    `- Payment Type: ${result.paymentType} (Expected: VIRTUAL_INCOME)`
  )
  console.log(
    `- Money Source: ${result.moneySource} (Expected: TELEGRAM_STARS)`
  )
  console.log(`- Confidence: ${result.confidence}%`)

  return result
}

/**
 * Example 3: Service Expense Classification
 */
export async function exampleServiceExpenseClassification() {
  console.log('=== ZOT Service Expense Classification Example ===')

  const classifier = new ZOTClassifier()

  const expenseTransaction: ZOTTransactionData = {
    id: 'expense-001',
    telegram_id: '555666777',
    amount: 0,
    stars: 75,
    type: 'MONEY_OUTCOME',
    payment_method: '',
    service_type: 'kling_video',
    bot_name: 'video-bot',
    description: 'Video generation cost',
    inv_id: '',
    status: 'COMPLETED',
    metadata: {
      duration: 15,
      quality: 'HD',
      frames: 450,
    },
    subscription: null,
    currency: 'XTR',
    created_at: '2024-01-15T12:00:00.000Z',
  }

  const result = classifier.classifyTransaction(expenseTransaction)

  console.log('Service Expense Classification:')
  console.log(
    `- Payment Type: ${result.paymentType} (Expected: VIRTUAL_EXPENSE)`
  )
  console.log(
    `- Service Category: ${result.serviceCategory} (Expected: VIDEO_GENERATION)`
  )
  console.log(`- Confidence: ${result.confidence}%`)

  return result
}

/**
 * Example 4: Batch Transaction Processing
 */
export async function exampleBatchProcessing() {
  console.log('=== ZOT Batch Processing Example ===')

  const classifier = new ZOTClassifier()

  // Create a batch of diverse transactions
  const transactions: ZOTTransactionData[] = [
    {
      id: 'batch-001',
      telegram_id: '111111111',
      amount: 1000,
      stars: 0,
      type: 'MONEY_INCOME',
      payment_method: 'Robokassa',
      service_type: '',
      bot_name: 'premium-bot',
      description: 'Monthly subscription',
      status: 'COMPLETED',
      currency: 'RUB',
      created_at: '2024-01-01T10:00:00.000Z',
    },
    {
      id: 'batch-002',
      telegram_id: '111111111',
      amount: 0,
      stars: 500,
      type: 'MONEY_INCOME',
      payment_method: 'Telegram',
      service_type: '',
      bot_name: 'premium-bot',
      description: 'Telegram Stars purchase',
      status: 'COMPLETED',
      currency: 'XTR',
      created_at: '2024-01-05T10:00:00.000Z',
    },
    {
      id: 'batch-003',
      telegram_id: '111111111',
      amount: 0,
      stars: 25,
      type: 'MONEY_OUTCOME',
      payment_method: '',
      service_type: 'neuro_photo',
      bot_name: 'premium-bot',
      description: 'Photo generation',
      status: 'COMPLETED',
      metadata: { num_images: 5 },
      currency: 'XTR',
      created_at: '2024-01-10T10:00:00.000Z',
    },
    {
      id: 'batch-004',
      telegram_id: '111111111',
      amount: 0,
      stars: 100,
      type: 'MONEY_INCOME',
      payment_method: 'Manual',
      service_type: '',
      bot_name: 'premium-bot',
      description: 'Admin bonus grant',
      status: 'COMPLETED',
      currency: 'XTR',
      created_at: '2024-01-15T10:00:00.000Z',
    },
  ]

  const results = classifier.classifyTransactions(transactions)

  console.log(`Processed ${results.length} transactions:`)
  results.forEach((result, index) => {
    console.log(`Transaction ${index + 1}:`)
    console.log(`  - ID: ${result.originalData.id}`)
    console.log(`  - Type: ${result.paymentType}`)
    console.log(`  - Source: ${result.moneySource}`)
    console.log(`  - Category: ${result.serviceCategory}`)
    console.log(`  - Confidence: ${result.confidence}%`)
  })

  return results
}

/**
 * Example 5: Complete Financial Validation
 */
export async function exampleCompleteValidation() {
  console.log('=== ZOT Complete Financial Validation Example ===')

  const classifier = new ZOTClassifier()
  const validator = new ZOTValidator(classifier)

  // Create a comprehensive dataset for a bot
  const botTransactions: ZOTTransactionData[] = [
    // January income
    {
      id: 'complete-001',
      telegram_id: '123456789',
      amount: 1500,
      stars: 0,
      type: 'MONEY_INCOME',
      payment_method: 'Robokassa',
      service_type: '',
      bot_name: 'ai-studio-bot',
      description: 'Premium subscription',
      status: 'COMPLETED',
      subscription: 'NEUROTESTER',
      currency: 'RUB',
      created_at: '2024-01-05T10:00:00.000Z',
    },
    {
      id: 'complete-002',
      telegram_id: '123456789',
      amount: 0,
      stars: 1000,
      type: 'MONEY_INCOME',
      payment_method: 'Telegram',
      service_type: '',
      bot_name: 'ai-studio-bot',
      description: 'Telegram Stars purchase',
      status: 'COMPLETED',
      currency: 'XTR',
      created_at: '2024-01-10T10:00:00.000Z',
    },
    // Service usage throughout January
    {
      id: 'complete-003',
      telegram_id: '123456789',
      amount: 0,
      stars: 50,
      type: 'MONEY_OUTCOME',
      service_type: 'neuro_photo',
      bot_name: 'ai-studio-bot',
      description: 'Photo generation',
      status: 'COMPLETED',
      metadata: { num_images: 10 },
      currency: 'XTR',
      created_at: '2024-01-12T10:00:00.000Z',
    },
    {
      id: 'complete-004',
      telegram_id: '123456789',
      amount: 0,
      stars: 150,
      type: 'MONEY_OUTCOME',
      service_type: 'kling_video',
      bot_name: 'ai-studio-bot',
      description: 'Video generation',
      status: 'COMPLETED',
      metadata: { duration: 15, quality: 'HD' },
      currency: 'XTR',
      created_at: '2024-01-20T10:00:00.000Z',
    },
    {
      id: 'complete-005',
      telegram_id: '123456789',
      amount: 0,
      stars: 25,
      type: 'MONEY_OUTCOME',
      service_type: 'text_to_speech',
      bot_name: 'ai-studio-bot',
      description: 'Text-to-speech generation',
      status: 'COMPLETED',
      metadata: { length: 200, voice: 'premium' },
      currency: 'XTR',
      created_at: '2024-01-25T10:00:00.000Z',
    },
    // February activity
    {
      id: 'complete-006',
      telegram_id: '123456789',
      amount: 0,
      stars: 300,
      type: 'MONEY_INCOME',
      payment_method: 'Telegram',
      service_type: '',
      bot_name: 'ai-studio-bot',
      description: 'Telegram Stars top-up',
      status: 'COMPLETED',
      currency: 'XTR',
      created_at: '2024-02-05T10:00:00.000Z',
    },
    {
      id: 'complete-007',
      telegram_id: '123456789',
      amount: 0,
      stars: 200,
      type: 'MONEY_OUTCOME',
      service_type: 'morphing_seamless',
      bot_name: 'ai-studio-bot',
      description: 'Seamless morphing',
      status: 'COMPLETED',
      metadata: { frames: 100, complexity: 'high' },
      currency: 'XTR',
      created_at: '2024-02-15T10:00:00.000Z',
    },
  ]

  // Perform complete validation
  const validationResult = await validator.validateBotFinancials(
    botTransactions,
    'ai-studio-bot'
  )

  console.log('=== Validation Summary ===')
  console.log(`Valid: ${validationResult.isValid}`)
  console.log(`Confidence Level: ${validationResult.confidenceLevel}`)
  console.log(`Confidence Score: ${validationResult.confidenceScore}%`)
  console.log(
    `Classification Accuracy: ${validationResult.classificationAccuracy}%`
  )

  console.log('\n=== Quality Metrics ===')
  console.log(`Completeness: ${validationResult.qualityMetrics.completeness}%`)
  console.log(`Accuracy: ${validationResult.qualityMetrics.accuracy}%`)
  console.log(`Consistency: ${validationResult.qualityMetrics.consistency}%`)
  console.log(`Timeliness: ${validationResult.qualityMetrics.timeliness}%`)
  console.log(`Overall Score: ${validationResult.qualityMetrics.overallScore}%`)
  console.log(
    `Records Processed: ${validationResult.qualityMetrics.recordsProcessed}`
  )
  console.log(
    `Records with Issues: ${validationResult.qualityMetrics.recordsWithIssues}`
  )
  console.log(
    `Processing Time: ${validationResult.qualityMetrics.processingTime}ms`
  )

  if (validationResult.errors.length > 0) {
    console.log('\n=== Errors Found ===')
    validationResult.errors.forEach(error => {
      console.log(`- ${error.code}: ${error.message} (${error.severity})`)
      if (error.suggestion) {
        console.log(`  Suggestion: ${error.suggestion}`)
      }
    })
  }

  if (validationResult.warnings.length > 0) {
    console.log('\n=== Warnings ===')
    validationResult.warnings.forEach(warning => {
      console.log(`- ${warning.code}: ${warning.message}`)
      if (warning.recommendation) {
        console.log(`  Recommendation: ${warning.recommendation}`)
      }
    })
  }

  if (validationResult.suggestions.length > 0) {
    console.log('\n=== Suggestions ===')
    validationResult.suggestions.forEach(suggestion => {
      console.log(`- ${suggestion}`)
    })
  }

  if (validationResult.missingData.length > 0) {
    console.log('\n=== Missing Data Detected ===')
    validationResult.missingData.forEach(missing => {
      console.log(`- ${missing.type}: ${missing.description}`)
      console.log(
        `  Impact: ${missing.impact}, Affected Records: ${missing.affectedRecords}`
      )
      console.log(`  Resolution: ${missing.resolution}`)
    })
  }

  return validationResult
}

/**
 * Example 6: Error Handling and Edge Cases
 */
export async function exampleErrorHandling() {
  console.log('=== ZOT Error Handling Example ===')

  const classifier = new ZOTClassifier()
  const validator = new ZOTValidator(classifier)

  // Create problematic transactions
  const problematicTransactions: ZOTTransactionData[] = [
    // Missing required fields
    {
      id: 'error-001',
      telegram_id: '', // Missing
      amount: 0,
      stars: 0,
      type: '', // Missing
      bot_name: '', // Missing
      description: '',
      status: 'COMPLETED',
      created_at: '2024-01-15T10:00:00.000Z',
    } as ZOTTransactionData,
    // Negative amounts
    {
      id: 'error-002',
      telegram_id: '123456789',
      amount: -100, // Negative
      stars: -50, // Negative
      type: 'MONEY_INCOME',
      bot_name: 'test-bot',
      description: 'Invalid negative transaction',
      status: 'COMPLETED',
      created_at: '2024-01-15T10:00:00.000Z',
    },
    // Currency mismatch
    {
      id: 'error-003',
      telegram_id: '123456789',
      amount: 0,
      stars: 100,
      type: 'MONEY_INCOME',
      payment_method: 'Telegram',
      bot_name: 'test-bot',
      description: 'Telegram Stars with wrong currency',
      status: 'COMPLETED',
      currency: 'RUB', // Should be XTR for Telegram Stars
      created_at: '2024-01-15T10:00:00.000Z',
    },
    // Unknown service type
    {
      id: 'error-004',
      telegram_id: '123456789',
      amount: 0,
      stars: 50,
      type: 'MONEY_OUTCOME',
      service_type: 'unknown_service',
      bot_name: 'test-bot',
      description: 'Unknown service usage',
      status: 'COMPLETED',
      currency: 'XTR',
      created_at: '2024-01-15T10:00:00.000Z',
    },
  ]

  const validationResult = await validator.validateBotFinancials(
    problematicTransactions,
    'error-test-bot'
  )

  console.log('Error Handling Results:')
  console.log(`Valid: ${validationResult.isValid} (Expected: false)`)
  console.log(`Errors Found: ${validationResult.errors.length}`)
  console.log(`Warnings Found: ${validationResult.warnings.length}`)

  console.log('\nDetailed Error Analysis:')
  validationResult.errors.forEach((error, index) => {
    console.log(`Error ${index + 1}:`)
    console.log(`  Code: ${error.code}`)
    console.log(`  Message: ${error.message}`)
    console.log(`  Severity: ${error.severity}`)
    if (error.field) console.log(`  Field: ${error.field}`)
    if (error.suggestion) console.log(`  Suggestion: ${error.suggestion}`)
  })

  return validationResult
}

/**
 * Example 7: Custom Classification Rules
 */
export async function exampleCustomRules() {
  console.log('=== ZOT Custom Classification Rules Example ===')

  // Create classifier with custom rules
  const customRules = [
    {
      ruleId: 'CUSTOM_PREMIUM_SUBSCRIPTION',
      name: 'Premium Subscription Rule',
      description: 'Classify premium subscriptions correctly',
      conditions: [
        {
          field: 'description',
          operator: 'contains' as const,
          value: 'premium',
          caseSensitive: false,
        },
        { field: 'amount', operator: 'greater_than' as const, value: 1000 },
      ],
      targetClassification: ZOTPaymentType.REAL_INCOME,
      targetServiceCategory: ZOTServiceCategory.SUBSCRIPTION,
      priority: 110,
      confidenceWeight: 98,
      enabled: true,
    },
  ]

  const classifier = new ZOTClassifier(customRules)

  const premiumTransaction: ZOTTransactionData = {
    id: 'premium-001',
    telegram_id: '123456789',
    amount: 2000,
    stars: 0,
    type: 'MONEY_INCOME',
    payment_method: 'Robokassa',
    service_type: '',
    bot_name: 'premium-bot',
    description: 'Premium subscription upgrade',
    status: 'COMPLETED',
    subscription: 'PREMIUM',
    currency: 'RUB',
    created_at: '2024-01-15T10:00:00.000Z',
  }

  const result = classifier.classifyTransaction(premiumTransaction)

  console.log('Custom Rule Classification:')
  console.log(`Payment Type: ${result.paymentType}`)
  console.log(`Service Category: ${result.serviceCategory}`)
  console.log(`Confidence: ${result.confidence}%`)
  console.log(`Applied Rules: ${result.appliedRules.join(', ')}`)

  return result
}

/**
 * Example 8: Performance Monitoring
 */
export async function examplePerformanceMonitoring() {
  console.log('=== ZOT Performance Monitoring Example ===')

  const validator = new ZOTValidator()

  // Generate a large dataset
  const largeDataset: ZOTTransactionData[] = []
  const startGeneration = Date.now()

  for (let i = 0; i < 1000; i++) {
    largeDataset.push({
      id: `perf-${i}`,
      telegram_id: `user-${i % 100}`,
      amount: Math.floor(Math.random() * 1000),
      stars: Math.floor(Math.random() * 500),
      type: ['MONEY_INCOME', 'MONEY_OUTCOME'][Math.floor(Math.random() * 2)],
      payment_method: ['Robokassa', 'Telegram', 'CryptoBot'][
        Math.floor(Math.random() * 3)
      ],
      service_type: ['neuro_photo', 'kling_video', 'text_to_speech'][
        Math.floor(Math.random() * 3)
      ],
      bot_name: 'performance-test-bot',
      description: `Performance test transaction ${i}`,
      status: 'COMPLETED',
      currency: ['RUB', 'XTR'][Math.floor(Math.random() * 2)],
      created_at: new Date(
        2024,
        0,
        Math.floor(Math.random() * 30) + 1
      ).toISOString(),
    })
  }

  const generationTime = Date.now() - startGeneration
  console.log(`Dataset generation time: ${generationTime}ms`)

  // Validate the dataset
  const startValidation = Date.now()
  const result = await validator.validateBotFinancials(
    largeDataset,
    'performance-test-bot'
  )
  const validationTime = Date.now() - startValidation

  console.log('Performance Metrics:')
  console.log(`Records Processed: ${result.qualityMetrics.recordsProcessed}`)
  console.log(`Total Validation Time: ${validationTime}ms`)
  console.log(
    `Internal Processing Time: ${result.qualityMetrics.processingTime}ms`
  )
  console.log(
    `Records per Second: ${Math.round(result.qualityMetrics.recordsProcessed / (validationTime / 1000))}`
  )
  console.log(
    `Average Time per Record: ${(validationTime / result.qualityMetrics.recordsProcessed).toFixed(2)}ms`
  )

  console.log('\nQuality Assessment:')
  console.log(`Overall Quality Score: ${result.qualityMetrics.overallScore}%`)
  console.log(`Classification Accuracy: ${result.classificationAccuracy}%`)

  return result
}

/**
 * Main function to run all examples
 */
export async function runAllZOTExamples() {
  console.log('🚀 Running ZOT Model Examples...\n')

  try {
    await exampleBasicClassification()
    console.log('\n' + '='.repeat(60) + '\n')

    await exampleTelegramStarsClassification()
    console.log('\n' + '='.repeat(60) + '\n')

    await exampleServiceExpenseClassification()
    console.log('\n' + '='.repeat(60) + '\n')

    await exampleBatchProcessing()
    console.log('\n' + '='.repeat(60) + '\n')

    await exampleCompleteValidation()
    console.log('\n' + '='.repeat(60) + '\n')

    await exampleErrorHandling()
    console.log('\n' + '='.repeat(60) + '\n')

    await exampleCustomRules()
    console.log('\n' + '='.repeat(60) + '\n')

    await examplePerformanceMonitoring()

    console.log('\n✅ All ZOT examples completed successfully!')
  } catch (error) {
    console.error('❌ Error running ZOT examples:', error)
    throw error
  }
}

// Export all examples for individual use
export const ZOTExamples = {
  basicClassification: exampleBasicClassification,
  telegramStarsClassification: exampleTelegramStarsClassification,
  serviceExpenseClassification: exampleServiceExpenseClassification,
  batchProcessing: exampleBatchProcessing,
  completeValidation: exampleCompleteValidation,
  errorHandling: exampleErrorHandling,
  customRules: exampleCustomRules,
  performanceMonitoring: examplePerformanceMonitoring,
  runAll: runAllZOTExamples,
}
