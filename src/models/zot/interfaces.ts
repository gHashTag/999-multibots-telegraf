/**
 * ZOT (Zero-Omission-Testing) Model Interfaces
 *
 * This file defines the comprehensive validation model for financial data
 * with zero-tolerance for categorization errors and complete omission detection.
 *
 * @version 1.0.0
 * @author ZOT Model Creator Agent
 */

/**
 * Enhanced Payment Type Classification System
 * Zero-tolerance categorization with strict business logic
 */
export enum ZOTPaymentType {
  /** Real monetary income (Robokassa, CryptoBot) */
  REAL_INCOME = 'REAL_INCOME',
  /** Virtual income (Telegram Stars, Admin grants) */
  VIRTUAL_INCOME = 'VIRTUAL_INCOME',
  /** Real monetary expense (service costs) */
  REAL_EXPENSE = 'REAL_EXPENSE',
  /** Virtual expense (star consumption) */
  VIRTUAL_EXPENSE = 'VIRTUAL_EXPENSE',
  /** Money refunds */
  REFUND = 'REFUND',
  /** Bonus/promotional credits */
  BONUS = 'BONUS',
  /** Internal transfers */
  TRANSFER = 'TRANSFER',
}

/**
 * Money Source Validation with Strict Typing
 * Each source has specific validation rules and business logic
 */
export enum ZOTMoneySource {
  /** Robokassa payment gateway */
  ROBOKASSA = 'ROBOKASSA',
  /** Telegram Stars payment */
  TELEGRAM_STARS = 'TELEGRAM_STARS',
  /** CryptoBot payment */
  CRYPTOBOT = 'CRYPTOBOT',
  /** Admin manual operations */
  ADMIN = 'ADMIN',
  /** System-generated bonuses */
  BONUS = 'BONUS',
  /** Manual adjustments */
  MANUAL = 'MANUAL',
  /** Unknown or invalid source */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Service Category Classification
 * Each category has different cost models and validation rules
 */
export enum ZOTServiceCategory {
  /** Photo generation services */
  PHOTO_GENERATION = 'PHOTO_GENERATION',
  /** Video generation services */
  VIDEO_GENERATION = 'VIDEO_GENERATION',
  /** Audio/TTS services */
  AUDIO_GENERATION = 'AUDIO_GENERATION',
  /** Image analysis services */
  IMAGE_ANALYSIS = 'IMAGE_ANALYSIS',
  /** Model training services */
  MODEL_TRAINING = 'MODEL_TRAINING',
  /** Morphing/animation services */
  MORPHING = 'MORPHING',
  /** Subscription purchases */
  SUBSCRIPTION = 'SUBSCRIPTION',
  /** Administrative operations */
  ADMIN_OPERATION = 'ADMIN_OPERATION',
  /** Unknown service */
  UNKNOWN_SERVICE = 'UNKNOWN_SERVICE',
}

/**
 * Validation Confidence Levels
 * Used to indicate the reliability of classification
 */
export enum ZOTConfidenceLevel {
  /** 95-100% confidence */
  HIGH = 'HIGH',
  /** 80-94% confidence */
  MEDIUM = 'MEDIUM',
  /** 60-79% confidence */
  LOW = 'LOW',
  /** Below 60% confidence */
  VERY_LOW = 'VERY_LOW',
  /** Failed validation */
  FAILED = 'FAILED',
}

/**
 * Bot Financial State Interface
 * Comprehensive data structure for bot financial tracking
 */
export interface ZOTBotFinancials {
  /** Bot identifier */
  botName: string

  /** Total real money income (RUB) */
  realIncome: number

  /** Total virtual income (stars) */
  virtualIncome: number

  /** Total real expenses (service costs) */
  realExpenses: number

  /** Total virtual expenses (star consumption) */
  virtualExpenses: number

  /** Current star balance */
  currentBalance: number

  /** Total refunds issued */
  totalRefunds: number

  /** Total bonuses granted */
  totalBonuses: number

  /** Net profit (real income - real expenses) */
  netProfit: number

  /** Virtual profit margin (virtual income - virtual expenses) */
  virtualMargin: number

  /** Monthly data breakdown */
  monthlyData: ZOTMonthlyFinancials[]

  /** Last validation timestamp */
  lastValidated: Date

  /** Validation status */
  validationStatus: ZOTValidationStatus
}

/**
 * Monthly Financial Data
 * Granular monthly breakdown for trend analysis
 */
export interface ZOTMonthlyFinancials {
  /** Year-Month (YYYY-MM) */
  month: string

  /** Real income for the month */
  realIncome: number

  /** Virtual income for the month */
  virtualIncome: number

  /** Real expenses for the month */
  realExpenses: number

  /** Virtual expenses for the month */
  virtualExpenses: number

  /** Net profit for the month */
  netProfit: number

  /** Number of transactions */
  transactionCount: number

  /** Average transaction value */
  avgTransactionValue: number

  /** Service usage breakdown */
  serviceBreakdown: Record<
    ZOTServiceCategory,
    {
      transactions: number
      totalStars: number
      totalAmount: number
      avgCost: number
    }
  >
}

/**
 * Validation Result Interface
 * Comprehensive validation outcome with detailed metrics
 */
export interface ZOTValidationResult {
  /** Overall validation success */
  isValid: boolean

  /** Confidence level of validation */
  confidenceLevel: ZOTConfidenceLevel

  /** Confidence score (0-100) */
  confidenceScore: number

  /** Detailed validation errors */
  errors: ZOTValidationError[]

  /** Validation warnings */
  warnings: ZOTValidationWarning[]

  /** Suggestions for improvement */
  suggestions: string[]

  /** Validation timestamp */
  validatedAt: Date

  /** Data quality metrics */
  qualityMetrics: ZOTQualityMetrics

  /** Missing data indicators */
  missingData: ZOTMissingData[]

  /** Classification accuracy */
  classificationAccuracy: number
}

/**
 * Validation Error Details
 */
export interface ZOTValidationError {
  /** Error code */
  code: string

  /** Error message */
  message: string

  /** Severity level */
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

  /** Field or data causing error */
  field?: string

  /** Original value */
  value?: any

  /** Expected value or format */
  expected?: any

  /** Suggestion to fix */
  suggestion?: string
}

/**
 * Validation Warning Details
 */
export interface ZOTValidationWarning {
  /** Warning code */
  code: string

  /** Warning message */
  message: string

  /** Field or data causing warning */
  field?: string

  /** Current value */
  value?: any

  /** Recommended action */
  recommendation?: string
}

/**
 * Data Quality Metrics
 */
export interface ZOTQualityMetrics {
  /** Completeness score (0-100) */
  completeness: number

  /** Accuracy score (0-100) */
  accuracy: number

  /** Consistency score (0-100) */
  consistency: number

  /** Timeliness score (0-100) */
  timeliness: number

  /** Overall quality score (0-100) */
  overallScore: number

  /** Number of records processed */
  recordsProcessed: number

  /** Number of records with issues */
  recordsWithIssues: number

  /** Processing time (ms) */
  processingTime: number
}

/**
 * Missing Data Detection
 */
export interface ZOTMissingData {
  /** Type of missing data */
  type:
    | 'REQUIRED_FIELD'
    | 'EXPECTED_TRANSACTION'
    | 'INCOMPLETE_RECORD'
    | 'ORPHANED_DATA'

  /** Description of what's missing */
  description: string

  /** Impact level */
  impact: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

  /** Affected records count */
  affectedRecords: number

  /** Suggested resolution */
  resolution: string
}

/**
 * Overall Validation Status
 */
export enum ZOTValidationStatus {
  /** All validations passed */
  VALID = 'VALID',
  /** Minor issues found */
  VALID_WITH_WARNINGS = 'VALID_WITH_WARNINGS',
  /** Significant issues found */
  INVALID = 'INVALID',
  /** Critical errors found */
  CRITICAL_ERRORS = 'CRITICAL_ERRORS',
  /** Validation not performed */
  NOT_VALIDATED = 'NOT_VALIDATED',
  /** Validation in progress */
  VALIDATING = 'VALIDATING',
}

/**
 * Transaction Classification Rules
 * Defines the business logic for categorizing transactions
 */
export interface ZOTClassificationRule {
  /** Rule identifier */
  ruleId: string

  /** Rule name */
  name: string

  /** Rule description */
  description: string

  /** Conditions for this rule */
  conditions: ZOTRuleCondition[]

  /** Target classification */
  targetClassification: ZOTPaymentType

  /** Target service category */
  targetServiceCategory?: ZOTServiceCategory

  /** Rule priority (higher = checked first) */
  priority: number

  /** Rule confidence weight */
  confidenceWeight: number

  /** Rule enabled status */
  enabled: boolean
}

/**
 * Rule Condition Interface
 */
export interface ZOTRuleCondition {
  /** Field to check */
  field: string

  /** Operator for comparison */
  operator:
    | 'equals'
    | 'contains'
    | 'starts_with'
    | 'ends_with'
    | 'regex'
    | 'greater_than'
    | 'less_than'
    | 'in_array'
    | 'not_null'
    | 'is_null'

  /** Value to compare against */
  value: any

  /** Case sensitive comparison */
  caseSensitive?: boolean
}

/**
 * Service Cost Configuration with ZOT Validation
 */
export interface ZOTServiceCostConfig {
  /** Service identifier */
  serviceId: string

  /** Service category */
  category: ZOTServiceCategory

  /** Base cost in stars */
  baseCost: number

  /** Cost multiplier for quantity */
  multiplier?: number

  /** Minimum cost */
  minCost?: number

  /** Maximum cost */
  maxCost?: number

  /** Cost calculation formula */
  formula?: string

  /** Validation rules for this service */
  validationRules: ZOTClassificationRule[]

  /** Expected metadata fields */
  expectedMetadata: string[]

  /** Cost confidence threshold */
  costConfidenceThreshold: number
}

/**
 * ZOT Configuration Interface
 * Global configuration for the ZOT validation system
 */
export interface ZOTConfig {
  /** Validation rules */
  classificationRules: ZOTClassificationRule[]

  /** Service cost configurations */
  serviceCosts: ZOTServiceCostConfig[]

  /** Quality thresholds */
  qualityThresholds: {
    completeness: number
    accuracy: number
    consistency: number
    timeliness: number
    overall: number
  }

  /** Confidence thresholds */
  confidenceThresholds: {
    high: number
    medium: number
    low: number
  }

  /** Validation settings */
  validationSettings: {
    enableStrictMode: boolean
    enableAutoCorrection: boolean
    enablePredictiveValidation: boolean
    maxProcessingTime: number
  }

  /** Notification settings */
  notificationSettings: {
    enableErrorNotifications: boolean
    enableWarningNotifications: boolean
    notificationThreshold: ZOTConfidenceLevel
  }
}

/**
 * ZOT Processing Context
 * Context information for validation processing
 */
export interface ZOTProcessingContext {
  /** Processing session ID */
  sessionId: string

  /** Start timestamp */
  startTime: Date

  /** End timestamp */
  endTime?: Date

  /** Bot name being processed */
  botName: string

  /** Date range being processed */
  dateRange: {
    from: Date
    to: Date
  }

  /** Processing options */
  options: {
    enableStrictValidation: boolean
    enableAutoCorrection: boolean
    includeWarnings: boolean
    processingMode: 'FULL' | 'INCREMENTAL' | 'VALIDATION_ONLY'
  }

  /** Processing statistics */
  statistics: {
    recordsProcessed: number
    errorsFound: number
    warningsFound: number
    correctionsApplied: number
    processingTime: number
  }
}
