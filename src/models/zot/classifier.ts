/**
 * ZOT Classification Engine
 *
 * Zero-tolerance classification system for financial transactions
 * with comprehensive business logic and validation rules.
 *
 * @version 1.0.0
 * @author ZOT Model Creator Agent
 */

import {
  ZOTPaymentType,
  ZOTMoneySource,
  ZOTServiceCategory,
  ZOTClassificationRule,
  ZOTRuleCondition,
  ZOTValidationResult,
  ZOTConfidenceLevel,
  ZOTValidationError,
  ZOTValidationWarning,
  ZOTQualityMetrics,
  ZOTMissingData,
  ZOTValidationStatus,
} from './interfaces'

/**
 * Transaction Data Interface for Classification
 */
export interface ZOTTransactionData {
  /** Transaction ID */
  id: string
  /** Telegram user ID */
  telegram_id: string
  /** Transaction amount */
  amount: number
  /** Stars amount */
  stars?: number
  /** Payment type (original) */
  type: string
  /** Payment method */
  payment_method?: string
  /** Service type */
  service_type?: string
  /** Bot name */
  bot_name: string
  /** Description */
  description: string
  /** Invoice ID */
  inv_id?: string
  /** Status */
  status: string
  /** Metadata */
  metadata?: Record<string, any>
  /** Subscription type */
  subscription?: string | null
  /** Currency */
  currency?: string
  /** Creation timestamp */
  created_at: string
  /** Update timestamp */
  updated_at?: string
}

/**
 * Classification Result Interface
 */
export interface ZOTClassificationResult {
  /** Original transaction data */
  originalData: ZOTTransactionData
  /** Classified payment type */
  paymentType: ZOTPaymentType
  /** Money source */
  moneySource: ZOTMoneySource
  /** Service category */
  serviceCategory: ZOTServiceCategory
  /** Classification confidence */
  confidence: number
  /** Confidence level */
  confidenceLevel: ZOTConfidenceLevel
  /** Applied rules */
  appliedRules: string[]
  /** Validation errors */
  errors: ZOTValidationError[]
  /** Validation warnings */
  warnings: ZOTValidationWarning[]
  /** Corrected data */
  correctedData?: Partial<ZOTTransactionData>
}

/**
 * ZOT Classification Engine Class
 */
export class ZOTClassifier {
  private classificationRules: ZOTClassificationRule[]
  private strictMode: boolean
  private autoCorrection: boolean

  constructor(
    rules: ZOTClassificationRule[] = [],
    strictMode: boolean = true,
    autoCorrection: boolean = false
  ) {
    this.classificationRules = [...DEFAULT_CLASSIFICATION_RULES, ...rules]
    this.strictMode = strictMode
    this.autoCorrection = autoCorrection

    // Sort rules by priority (higher first)
    this.classificationRules.sort((a, b) => b.priority - a.priority)
  }

  /**
   * Classify a single transaction
   */
  public classifyTransaction(
    transaction: ZOTTransactionData
  ): ZOTClassificationResult {
    const result: ZOTClassificationResult = {
      originalData: transaction,
      paymentType: ZOTPaymentType.REAL_INCOME, // Default
      moneySource: ZOTMoneySource.UNKNOWN,
      serviceCategory: ZOTServiceCategory.UNKNOWN_SERVICE,
      confidence: 0,
      confidenceLevel: ZOTConfidenceLevel.FAILED,
      appliedRules: [],
      errors: [],
      warnings: [],
    }

    // Step 1: Classify Money Source
    const moneySourceResult = this.classifyMoneySource(transaction)
    result.moneySource = moneySourceResult.source
    result.confidence += moneySourceResult.confidence * 0.3 // 30% weight
    result.appliedRules.push(...moneySourceResult.appliedRules)

    // Step 2: Classify Payment Type
    const paymentTypeResult = this.classifyPaymentType(
      transaction,
      result.moneySource
    )
    result.paymentType = paymentTypeResult.type
    result.confidence += paymentTypeResult.confidence * 0.4 // 40% weight
    result.appliedRules.push(...paymentTypeResult.appliedRules)

    // Step 3: Classify Service Category
    const serviceCategoryResult = this.classifyServiceCategory(transaction)
    result.serviceCategory = serviceCategoryResult.category
    result.confidence += serviceCategoryResult.confidence * 0.3 // 30% weight
    result.appliedRules.push(...serviceCategoryResult.appliedRules)

    // Step 4: Determine Confidence Level
    result.confidenceLevel = this.getConfidenceLevel(result.confidence)

    // Step 5: Validate Classification
    const validationResult = this.validateClassification(transaction, result)
    result.errors = validationResult.errors
    result.warnings = validationResult.warnings

    // Step 6: Apply Auto-Correction if enabled
    if (this.autoCorrection && result.errors.length > 0) {
      result.correctedData = this.applyAutoCorrection(transaction, result)
    }

    return result
  }

  /**
   * Classify Money Source
   */
  private classifyMoneySource(transaction: ZOTTransactionData): {
    source: ZOTMoneySource
    confidence: number
    appliedRules: string[]
  } {
    const appliedRules: string[] = []
    let source = ZOTMoneySource.UNKNOWN
    let confidence = 0

    // Check payment method
    if (transaction.payment_method) {
      const method = transaction.payment_method.toLowerCase()
      if (method.includes('robokassa') || method === 'robokassa') {
        source = ZOTMoneySource.ROBOKASSA
        confidence = 95
        appliedRules.push('PAYMENT_METHOD_ROBOKASSA')
      } else if (method.includes('telegram') || method === 'telegram') {
        source = ZOTMoneySource.TELEGRAM_STARS
        confidence = 95
        appliedRules.push('PAYMENT_METHOD_TELEGRAM')
      } else if (method.includes('crypto') || method === 'cryptobot') {
        source = ZOTMoneySource.CRYPTOBOT
        confidence = 95
        appliedRules.push('PAYMENT_METHOD_CRYPTO')
      } else if (method === 'manual' || method === 'admin') {
        source = ZOTMoneySource.ADMIN
        confidence = 90
        appliedRules.push('PAYMENT_METHOD_MANUAL')
      }
    }

    // Check currency
    if (transaction.currency === 'XTR' || transaction.stars) {
      if (source === ZOTMoneySource.UNKNOWN) {
        source = ZOTMoneySource.TELEGRAM_STARS
        confidence = 85
        appliedRules.push('CURRENCY_XTR')
      }
    } else if (transaction.currency === 'RUB') {
      if (source === ZOTMoneySource.UNKNOWN) {
        source = ZOTMoneySource.ROBOKASSA
        confidence = 70
        appliedRules.push('CURRENCY_RUB')
      }
    }

    // Check description patterns
    if (source === ZOTMoneySource.UNKNOWN) {
      const desc = transaction.description.toLowerCase()
      if (desc.includes('bonus') || desc.includes('промо')) {
        source = ZOTMoneySource.BONUS
        confidence = 80
        appliedRules.push('DESCRIPTION_BONUS')
      } else if (desc.includes('admin') || desc.includes('manual')) {
        source = ZOTMoneySource.ADMIN
        confidence = 80
        appliedRules.push('DESCRIPTION_ADMIN')
      }
    }

    return { source, confidence, appliedRules }
  }

  /**
   * Classify Payment Type
   */
  private classifyPaymentType(
    transaction: ZOTTransactionData,
    moneySource: ZOTMoneySource
  ): {
    type: ZOTPaymentType
    confidence: number
    appliedRules: string[]
  } {
    const appliedRules: string[] = []
    let type = ZOTPaymentType.REAL_INCOME
    let confidence = 0

    const originalType = transaction.type.toUpperCase()

    // Map original types to ZOT types
    switch (originalType) {
      case 'MONEY_INCOME':
        if (moneySource === ZOTMoneySource.TELEGRAM_STARS) {
          type = ZOTPaymentType.VIRTUAL_INCOME
          confidence = 95
          appliedRules.push('MONEY_INCOME_VIRTUAL')
        } else if (
          [ZOTMoneySource.ROBOKASSA, ZOTMoneySource.CRYPTOBOT].includes(
            moneySource
          )
        ) {
          type = ZOTPaymentType.REAL_INCOME
          confidence = 95
          appliedRules.push('MONEY_INCOME_REAL')
        } else if (moneySource === ZOTMoneySource.BONUS) {
          type = ZOTPaymentType.BONUS
          confidence = 90
          appliedRules.push('MONEY_INCOME_BONUS')
        } else {
          type = ZOTPaymentType.REAL_INCOME
          confidence = 60
          appliedRules.push('MONEY_INCOME_DEFAULT')
        }
        break

      case 'MONEY_OUTCOME':
        if (transaction.stars && transaction.stars > 0) {
          type = ZOTPaymentType.VIRTUAL_EXPENSE
          confidence = 95
          appliedRules.push('MONEY_OUTCOME_VIRTUAL')
        } else {
          type = ZOTPaymentType.REAL_EXPENSE
          confidence = 85
          appliedRules.push('MONEY_OUTCOME_REAL')
        }
        break

      case 'REFUND':
        type = ZOTPaymentType.REFUND
        confidence = 95
        appliedRules.push('REFUND_TYPE')
        break

      default: {
        // Check description for hints
        const desc = transaction.description.toLowerCase()
        if (desc.includes('refund') || desc.includes('возврат')) {
          type = ZOTPaymentType.REFUND
          confidence = 70
          appliedRules.push('DESCRIPTION_REFUND')
        } else if (desc.includes('bonus') || desc.includes('бонус')) {
          type = ZOTPaymentType.BONUS
          confidence = 70
          appliedRules.push('DESCRIPTION_BONUS_TYPE')
        } else {
          confidence = 30
          appliedRules.push('TYPE_UNKNOWN')
        }
      }
    }

    return { type, confidence, appliedRules }
  }

  /**
   * Classify Service Category
   */
  private classifyServiceCategory(transaction: ZOTTransactionData): {
    category: ZOTServiceCategory
    confidence: number
    appliedRules: string[]
  } {
    const appliedRules: string[] = []
    let category = ZOTServiceCategory.UNKNOWN_SERVICE
    let confidence = 0

    if (!transaction.service_type) {
      // Check description for service hints
      const desc = transaction.description.toLowerCase()
      if (desc.includes('subscription') || desc.includes('подписка')) {
        category = ZOTServiceCategory.SUBSCRIPTION
        confidence = 80
        appliedRules.push('DESCRIPTION_SUBSCRIPTION')
      } else if (desc.includes('admin') || desc.includes('manual')) {
        category = ZOTServiceCategory.ADMIN_OPERATION
        confidence = 80
        appliedRules.push('DESCRIPTION_ADMIN_OP')
      }
      return { category, confidence, appliedRules }
    }

    const serviceType = transaction.service_type.toLowerCase()

    // Map service types to categories
    if (serviceType.includes('photo') || serviceType === 'neuro_photo') {
      category = ZOTServiceCategory.PHOTO_GENERATION
      confidence = 95
      appliedRules.push('SERVICE_PHOTO')
    } else if (
      serviceType.includes('video') ||
      [
        'kling_video',
        'haiper_video',
        'minimax_video',
        'video_generation_other',
      ].includes(serviceType)
    ) {
      category = ZOTServiceCategory.VIDEO_GENERATION
      confidence = 95
      appliedRules.push('SERVICE_VIDEO')
    } else if (
      serviceType.includes('audio') ||
      serviceType === 'text_to_speech'
    ) {
      category = ZOTServiceCategory.AUDIO_GENERATION
      confidence = 95
      appliedRules.push('SERVICE_AUDIO')
    } else if (
      serviceType === 'image_to_prompt' ||
      serviceType.includes('analysis')
    ) {
      category = ZOTServiceCategory.IMAGE_ANALYSIS
      confidence = 95
      appliedRules.push('SERVICE_ANALYSIS')
    } else if (
      serviceType.includes('training') ||
      serviceType === 'model_training_other'
    ) {
      category = ZOTServiceCategory.MODEL_TRAINING
      confidence = 95
      appliedRules.push('SERVICE_TRAINING')
    } else if (
      serviceType.includes('morphing') ||
      serviceType === 'morphing_seamless'
    ) {
      category = ZOTServiceCategory.MORPHING
      confidence = 95
      appliedRules.push('SERVICE_MORPHING')
    } else {
      confidence = 40
      appliedRules.push('SERVICE_UNKNOWN')
    }

    return { category, confidence, appliedRules }
  }

  /**
   * Get Confidence Level from score
   */
  private getConfidenceLevel(score: number): ZOTConfidenceLevel {
    if (score >= 95) return ZOTConfidenceLevel.HIGH
    if (score >= 80) return ZOTConfidenceLevel.MEDIUM
    if (score >= 60) return ZOTConfidenceLevel.LOW
    if (score >= 40) return ZOTConfidenceLevel.VERY_LOW
    return ZOTConfidenceLevel.FAILED
  }

  /**
   * Validate Classification
   */
  private validateClassification(
    transaction: ZOTTransactionData,
    result: ZOTClassificationResult
  ): {
    errors: ZOTValidationError[]
    warnings: ZOTValidationWarning[]
  } {
    const errors: ZOTValidationError[] = []
    const warnings: ZOTValidationWarning[] = []

    // Validate required fields
    if (!transaction.telegram_id) {
      errors.push({
        code: 'MISSING_TELEGRAM_ID',
        message: 'Telegram ID is required',
        severity: 'CRITICAL',
        field: 'telegram_id',
        value: transaction.telegram_id,
        suggestion: 'Ensure telegram_id is provided and not null',
      })
    }

    if (!transaction.amount && !transaction.stars) {
      errors.push({
        code: 'MISSING_AMOUNT',
        message: 'Either amount or stars must be provided',
        severity: 'CRITICAL',
        field: 'amount',
        value: transaction.amount,
        suggestion: 'Provide either amount (for RUB) or stars (for XTR)',
      })
    }

    // Validate amount consistency
    if (
      transaction.amount < 0 ||
      (transaction.stars && transaction.stars < 0)
    ) {
      errors.push({
        code: 'NEGATIVE_AMOUNT',
        message: 'Amount and stars cannot be negative',
        severity: 'HIGH',
        field: 'amount',
        value: transaction.amount,
        suggestion: 'Use positive values for amounts',
      })
    }

    // Validate payment type consistency
    if (
      result.paymentType === ZOTPaymentType.VIRTUAL_INCOME &&
      !transaction.stars
    ) {
      warnings.push({
        code: 'VIRTUAL_INCOME_NO_STARS',
        message: 'Virtual income should have stars amount',
        field: 'stars',
        value: transaction.stars,
        recommendation: 'Set stars amount for virtual income transactions',
      })
    }

    if (
      result.paymentType === ZOTPaymentType.REAL_INCOME &&
      !transaction.amount
    ) {
      warnings.push({
        code: 'REAL_INCOME_NO_AMOUNT',
        message: 'Real income should have amount in RUB',
        field: 'amount',
        value: transaction.amount,
        recommendation: 'Set amount for real income transactions',
      })
    }

    // Validate confidence threshold
    if (result.confidence < 60) {
      errors.push({
        code: 'LOW_CONFIDENCE',
        message: `Classification confidence too low: ${result.confidence}%`,
        severity: 'MEDIUM',
        field: 'confidence',
        value: result.confidence,
        expected: '>=60',
        suggestion:
          'Review transaction data for missing or unclear information',
      })
    }

    // Validate money source consistency
    if (
      result.moneySource === ZOTMoneySource.TELEGRAM_STARS &&
      transaction.currency !== 'XTR'
    ) {
      warnings.push({
        code: 'CURRENCY_MISMATCH',
        message: 'Telegram Stars should use XTR currency',
        field: 'currency',
        value: transaction.currency,
        recommendation: 'Set currency to XTR for Telegram Stars transactions',
      })
    }

    return { errors, warnings }
  }

  /**
   * Apply Auto-Correction
   */
  private applyAutoCorrection(
    transaction: ZOTTransactionData,
    result: ZOTClassificationResult
  ): Partial<ZOTTransactionData> {
    const corrections: Partial<ZOTTransactionData> = {}

    // Correct currency based on money source
    if (
      result.moneySource === ZOTMoneySource.TELEGRAM_STARS &&
      transaction.currency !== 'XTR'
    ) {
      corrections.currency = 'XTR'
    } else if (
      result.moneySource === ZOTMoneySource.ROBOKASSA &&
      transaction.currency !== 'RUB'
    ) {
      corrections.currency = 'RUB'
    }

    // Correct missing stars for virtual transactions
    if (
      result.paymentType === ZOTPaymentType.VIRTUAL_INCOME &&
      !transaction.stars &&
      transaction.amount
    ) {
      corrections.stars = transaction.amount // Assume 1:1 ratio for correction
    }

    return corrections
  }

  /**
   * Batch classify transactions
   */
  public classifyTransactions(
    transactions: ZOTTransactionData[]
  ): ZOTClassificationResult[] {
    return transactions.map(transaction =>
      this.classifyTransaction(transaction)
    )
  }

  /**
   * Validate batch of transactions
   */
  public validateBatch(
    transactions: ZOTTransactionData[]
  ): ZOTValidationResult {
    const startTime = Date.now()
    const results = this.classifyTransactions(transactions)
    const processingTime = Date.now() - startTime

    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0)
    const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0)
    const recordsWithIssues = results.filter(
      r => r.errors.length > 0 || r.warnings.length > 0
    ).length

    const qualityMetrics: ZOTQualityMetrics = {
      completeness: this.calculateCompleteness(transactions),
      accuracy: this.calculateAccuracy(results),
      consistency: this.calculateConsistency(results),
      timeliness: this.calculateTimeliness(transactions),
      overallScore: 0,
      recordsProcessed: transactions.length,
      recordsWithIssues,
      processingTime,
    }

    qualityMetrics.overallScore =
      qualityMetrics.completeness * 0.3 +
      qualityMetrics.accuracy * 0.3 +
      qualityMetrics.consistency * 0.2 +
      qualityMetrics.timeliness * 0.2

    const allErrors = results.flatMap(r => r.errors)
    const allWarnings = results.flatMap(r => r.warnings)

    return {
      isValid: totalErrors === 0,
      confidenceLevel:
        qualityMetrics.overallScore >= 95
          ? ZOTConfidenceLevel.HIGH
          : qualityMetrics.overallScore >= 80
            ? ZOTConfidenceLevel.MEDIUM
            : qualityMetrics.overallScore >= 60
              ? ZOTConfidenceLevel.LOW
              : ZOTConfidenceLevel.VERY_LOW,
      confidenceScore: qualityMetrics.overallScore,
      errors: allErrors,
      warnings: allWarnings,
      suggestions: this.generateSuggestions(results),
      validatedAt: new Date(),
      qualityMetrics,
      missingData: this.detectMissingData(transactions),
      classificationAccuracy: qualityMetrics.accuracy,
    }
  }

  private calculateCompleteness(transactions: ZOTTransactionData[]): number {
    const requiredFields = ['telegram_id', 'type', 'bot_name', 'description']
    let totalScore = 0

    transactions.forEach(t => {
      const score = requiredFields.reduce((acc, field) => {
        return acc + (t[field as keyof ZOTTransactionData] ? 1 : 0)
      }, 0)
      totalScore += (score / requiredFields.length) * 100
    })

    return transactions.length > 0 ? totalScore / transactions.length : 0
  }

  private calculateAccuracy(results: ZOTClassificationResult[]): number {
    const totalConfidence = results.reduce((sum, r) => sum + r.confidence, 0)
    return results.length > 0 ? totalConfidence / results.length : 0
  }

  private calculateConsistency(results: ZOTClassificationResult[]): number {
    // Check consistency of classifications for similar transactions
    const groupedResults = new Map<string, ZOTClassificationResult[]>()

    results.forEach(result => {
      const key = `${result.originalData.bot_name}-${result.originalData.service_type}`
      if (!groupedResults.has(key)) {
        groupedResults.set(key, [])
      }
      groupedResults.get(key)!.push(result)
    })

    let consistencyScore = 0
    let groupCount = 0

    groupedResults.forEach(group => {
      if (group.length > 1) {
        const firstType = group[0].paymentType
        const consistent = group.every(r => r.paymentType === firstType)
        consistencyScore += consistent ? 100 : 0
        groupCount++
      }
    })

    return groupCount > 0 ? consistencyScore / groupCount : 100
  }

  private calculateTimeliness(transactions: ZOTTransactionData[]): number {
    // Check if transactions have recent timestamps
    const now = new Date()
    const dayMs = 24 * 60 * 60 * 1000

    let timelinessScore = 0

    transactions.forEach(t => {
      const createdAt = new Date(t.created_at)
      const daysDiff = (now.getTime() - createdAt.getTime()) / dayMs

      // Score based on how recent the transaction is
      if (daysDiff <= 1) timelinessScore += 100
      else if (daysDiff <= 7) timelinessScore += 80
      else if (daysDiff <= 30) timelinessScore += 60
      else timelinessScore += 40
    })

    return transactions.length > 0 ? timelinessScore / transactions.length : 100
  }

  private generateSuggestions(results: ZOTClassificationResult[]): string[] {
    const suggestions: string[] = []
    const errorCounts = new Map<string, number>()

    results.forEach(r => {
      r.errors.forEach(e => {
        errorCounts.set(e.code, (errorCounts.get(e.code) || 0) + 1)
      })
    })

    if (errorCounts.get('MISSING_TELEGRAM_ID')) {
      suggestions.push('Ensure all transactions include telegram_id field')
    }

    if (errorCounts.get('LOW_CONFIDENCE')) {
      suggestions.push(
        'Review transaction descriptions and service types for clarity'
      )
    }

    if (errorCounts.get('CURRENCY_MISMATCH')) {
      suggestions.push('Standardize currency mapping based on payment method')
    }

    return suggestions
  }

  private detectMissingData(
    transactions: ZOTTransactionData[]
  ): ZOTMissingData[] {
    const missing: ZOTMissingData[] = []

    // Check for missing service types
    const noServiceType = transactions.filter(t => !t.service_type).length
    if (noServiceType > 0) {
      missing.push({
        type: 'REQUIRED_FIELD',
        description: 'Missing service_type field',
        impact: 'HIGH',
        affectedRecords: noServiceType,
        resolution: 'Add service_type field to all transactions',
      })
    }

    // Check for missing metadata
    const noMetadata = transactions.filter(
      t => !t.metadata || Object.keys(t.metadata).length === 0
    ).length
    if (noMetadata > 0) {
      missing.push({
        type: 'INCOMPLETE_RECORD',
        description: 'Missing metadata information',
        impact: 'MEDIUM',
        affectedRecords: noMetadata,
        resolution: 'Include relevant metadata for transaction context',
      })
    }

    return missing
  }
}

/**
 * Default Classification Rules
 */
export const DEFAULT_CLASSIFICATION_RULES: ZOTClassificationRule[] = [
  {
    ruleId: 'ROBOKASSA_REAL_INCOME',
    name: 'Robokassa Real Income',
    description: 'Classify Robokassa payments as real income',
    conditions: [
      { field: 'payment_method', operator: 'equals', value: 'Robokassa' },
      { field: 'type', operator: 'equals', value: 'MONEY_INCOME' },
    ],
    targetClassification: ZOTPaymentType.REAL_INCOME,
    priority: 100,
    confidenceWeight: 95,
    enabled: true,
  },
  {
    ruleId: 'TELEGRAM_VIRTUAL_INCOME',
    name: 'Telegram Stars Virtual Income',
    description: 'Classify Telegram Stars as virtual income',
    conditions: [
      { field: 'payment_method', operator: 'equals', value: 'Telegram' },
      { field: 'type', operator: 'equals', value: 'MONEY_INCOME' },
    ],
    targetClassification: ZOTPaymentType.VIRTUAL_INCOME,
    priority: 100,
    confidenceWeight: 95,
    enabled: true,
  },
  {
    ruleId: 'SERVICE_VIRTUAL_EXPENSE',
    name: 'Service Usage Virtual Expense',
    description: 'Classify service usage as virtual expense',
    conditions: [
      { field: 'type', operator: 'equals', value: 'MONEY_OUTCOME' },
      { field: 'stars', operator: 'greater_than', value: 0 },
    ],
    targetClassification: ZOTPaymentType.VIRTUAL_EXPENSE,
    priority: 90,
    confidenceWeight: 90,
    enabled: true,
  },
  {
    ruleId: 'ADMIN_BONUS',
    name: 'Admin Bonus Grant',
    description: 'Classify admin grants as bonus',
    conditions: [
      { field: 'payment_method', operator: 'equals', value: 'Manual' },
      {
        field: 'description',
        operator: 'contains',
        value: 'bonus',
        caseSensitive: false,
      },
    ],
    targetClassification: ZOTPaymentType.BONUS,
    priority: 85,
    confidenceWeight: 85,
    enabled: true,
  },
]

/**
 * Export default classifier instance
 */
export const defaultZOTClassifier = new ZOTClassifier(
  DEFAULT_CLASSIFICATION_RULES,
  true,
  false
)
