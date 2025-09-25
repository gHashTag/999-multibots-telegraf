/**
 * ZOT Validation Engine
 *
 * Comprehensive validation system for financial data with
 * zero-tolerance for data quality issues and omissions.
 *
 * @version 1.0.0
 * @author ZOT Model Creator Agent
 */

import {
  ZOTBotFinancials,
  ZOTMonthlyFinancials,
  ZOTValidationResult,
  ZOTValidationError,
  ZOTValidationWarning,
  ZOTQualityMetrics,
  ZOTMissingData,
  ZOTValidationStatus,
  ZOTConfidenceLevel,
  ZOTPaymentType,
  ZOTMoneySource,
  ZOTServiceCategory,
  ZOTProcessingContext,
  ZOTConfig
} from './interfaces';

import { ZOTTransactionData, ZOTClassificationResult, ZOTClassifier } from './classifier';

/**
 * Financial Data Aggregation Interface
 */
export interface ZOTFinancialAggregation {
  /** Bot name */
  botName: string;
  /** Date range */
  dateRange: {
    from: Date;
    to: Date;
  };
  /** Total transactions */
  totalTransactions: number;
  /** Real income (RUB) */
  realIncome: number;
  /** Virtual income (stars) */
  virtualIncome: number;
  /** Real expenses (RUB) */
  realExpenses: number;
  /** Virtual expenses (stars) */
  virtualExpenses: number;
  /** Net profit */
  netProfit: number;
  /** Virtual margin */
  virtualMargin: number;
  /** Average transaction value */
  avgTransactionValue: number;
  /** Service breakdown */
  serviceBreakdown: Record<ZOTServiceCategory, {
    transactions: number;
    totalStars: number;
    totalAmount: number;
    avgCost: number;
  }>;
  /** Monthly breakdown */
  monthlyBreakdown: ZOTMonthlyFinancials[];
}

/**
 * ZOT Validation Engine Class
 */
export class ZOTValidator {
  private classifier: ZOTClassifier;
  private config: Partial<ZOTConfig>;

  constructor(classifier?: ZOTClassifier, config?: Partial<ZOTConfig>) {
    this.classifier = classifier || new ZOTClassifier();
    this.config = {
      qualityThresholds: {
        completeness: 95,
        accuracy: 90,
        consistency: 85,
        timeliness: 80,
        overall: 85
      },
      confidenceThresholds: {
        high: 95,
        medium: 80,
        low: 60
      },
      validationSettings: {
        enableStrictMode: true,
        enableAutoCorrection: false,
        enablePredictiveValidation: true,
        maxProcessingTime: 30000
      },
      ...config
    };
  }

  /**
   * Validate Bot Financials
   */
  public async validateBotFinancials(
    transactions: ZOTTransactionData[],
    botName: string,
    context?: Partial<ZOTProcessingContext>
  ): Promise<ZOTValidationResult> {
    const startTime = Date.now();

    try {
      // Create processing context
      const processingContext: ZOTProcessingContext = {
        sessionId: context?.sessionId || `validation-${Date.now()}`,
        startTime: new Date(startTime),
        botName,
        dateRange: context?.dateRange || {
          from: new Date(Math.min(...transactions.map(t => new Date(t.created_at).getTime()))),
          to: new Date(Math.max(...transactions.map(t => new Date(t.created_at).getTime())))
        },
        options: {
          enableStrictValidation: this.config.validationSettings?.enableStrictMode || true,
          enableAutoCorrection: this.config.validationSettings?.enableAutoCorrection || false,
          includeWarnings: true,
          processingMode: 'FULL'
        },
        statistics: {
          recordsProcessed: 0,
          errorsFound: 0,
          warningsFound: 0,
          correctionsApplied: 0,
          processingTime: 0
        }
      };

      // Step 1: Pre-validation checks
      const preValidationResult = this.performPreValidation(transactions, processingContext);
      if (!preValidationResult.isValid && this.config.validationSettings?.enableStrictMode) {
        return preValidationResult;
      }

      // Step 2: Classify transactions
      const classificationResults = this.classifier.classifyTransactions(transactions);
      processingContext.statistics.recordsProcessed = transactions.length;

      // Step 3: Aggregate financial data
      const aggregation = this.aggregateFinancialData(classificationResults, botName);

      // Step 4: Validate aggregated data
      const aggregationValidation = this.validateAggregation(aggregation, processingContext);

      // Step 5: Validate monthly data consistency
      const monthlyValidation = this.validateMonthlyConsistency(aggregation.monthlyBreakdown);

      // Step 6: Detect anomalies
      const anomalyValidation = this.detectAnomalies(aggregation, classificationResults);

      // Step 7: Calculate overall quality metrics
      const qualityMetrics = this.calculateQualityMetrics(
        classificationResults,
        aggregation,
        processingContext
      );

      // Step 8: Compile final validation result
      const endTime = Date.now();
      processingContext.endTime = new Date(endTime);
      processingContext.statistics.processingTime = endTime - startTime;

      const allErrors = [
        ...preValidationResult.errors,
        ...aggregationValidation.errors,
        ...monthlyValidation.errors,
        ...anomalyValidation.errors
      ];

      const allWarnings = [
        ...preValidationResult.warnings,
        ...aggregationValidation.warnings,
        ...monthlyValidation.warnings,
        ...anomalyValidation.warnings
      ];

      processingContext.statistics.errorsFound = allErrors.length;
      processingContext.statistics.warningsFound = allWarnings.length;

      const overallConfidence = this.calculateOverallConfidence(qualityMetrics, allErrors.length);

      return {
        isValid: allErrors.length === 0,
        confidenceLevel: this.getConfidenceLevel(overallConfidence),
        confidenceScore: overallConfidence,
        errors: allErrors,
        warnings: allWarnings,
        suggestions: this.generateValidationSuggestions(allErrors, allWarnings, aggregation),
        validatedAt: new Date(),
        qualityMetrics,
        missingData: this.detectMissingFinancialData(aggregation, classificationResults),
        classificationAccuracy: qualityMetrics.accuracy
      };

    } catch (error) {
      return {
        isValid: false,
        confidenceLevel: ZOTConfidenceLevel.FAILED,
        confidenceScore: 0,
        errors: [{
          code: 'VALIDATION_ERROR',
          message: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          severity: 'CRITICAL'
        }],
        warnings: [],
        suggestions: ['Review input data and try again'],
        validatedAt: new Date(),
        qualityMetrics: this.getEmptyQualityMetrics(),
        missingData: [],
        classificationAccuracy: 0
      };
    }
  }

  /**
   * Pre-validation checks
   */
  private performPreValidation(
    transactions: ZOTTransactionData[],
    context: ZOTProcessingContext
  ): ZOTValidationResult {
    const errors: ZOTValidationError[] = [];
    const warnings: ZOTValidationWarning[] = [];

    // Check if transactions array is empty
    if (transactions.length === 0) {
      errors.push({
        code: 'NO_TRANSACTIONS',
        message: 'No transactions found for validation',
        severity: 'CRITICAL',
        suggestion: 'Ensure transaction data is properly loaded'
      });
    }

    // Check for duplicate transaction IDs
    const seenIds = new Set<string>();
    const duplicates = transactions.filter(t => {
      if (seenIds.has(t.id)) return true;
      seenIds.add(t.id);
      return false;
    });

    if (duplicates.length > 0) {
      errors.push({
        code: 'DUPLICATE_TRANSACTIONS',
        message: `Found ${duplicates.length} duplicate transaction IDs`,
        severity: 'HIGH',
        suggestion: 'Remove duplicate transactions before validation'
      });
    }

    // Check for required fields
    transactions.forEach((t, index) => {
      if (!t.telegram_id) {
        errors.push({
          code: 'MISSING_TELEGRAM_ID',
          message: `Transaction ${index} missing telegram_id`,
          severity: 'CRITICAL',
          field: 'telegram_id',
          suggestion: 'Ensure all transactions have telegram_id'
        });
      }

      if (!t.bot_name) {
        errors.push({
          code: 'MISSING_BOT_NAME',
          message: `Transaction ${index} missing bot_name`,
          severity: 'HIGH',
          field: 'bot_name',
          suggestion: 'Ensure all transactions have bot_name'
        });
      }

      if (!t.type) {
        errors.push({
          code: 'MISSING_TYPE',
          message: `Transaction ${index} missing type`,
          severity: 'CRITICAL',
          field: 'type',
          suggestion: 'Ensure all transactions have payment type'
        });
      }

      if (!t.amount && !t.stars) {
        warnings.push({
          code: 'NO_AMOUNT_OR_STARS',
          message: `Transaction ${index} has no amount or stars`,
          field: 'amount',
          recommendation: 'Verify transaction value is correctly recorded'
        });
      }
    });

    // Check date range validity
    const dates = transactions.map(t => new Date(t.created_at)).filter(d => !isNaN(d.getTime()));
    if (dates.length !== transactions.length) {
      errors.push({
        code: 'INVALID_DATES',
        message: 'Some transactions have invalid created_at dates',
        severity: 'HIGH',
        suggestion: 'Ensure all transactions have valid ISO date strings'
      });
    }

    return {
      isValid: errors.length === 0,
      confidenceLevel: errors.length === 0 ? ZOTConfidenceLevel.HIGH : ZOTConfidenceLevel.FAILED,
      confidenceScore: errors.length === 0 ? 100 : 0,
      errors,
      warnings,
      suggestions: [],
      validatedAt: new Date(),
      qualityMetrics: this.getEmptyQualityMetrics(),
      missingData: [],
      classificationAccuracy: 0
    };
  }

  /**
   * Aggregate financial data from classified transactions
   */
  private aggregateFinancialData(
    classifiedResults: ZOTClassificationResult[],
    botName: string
  ): ZOTFinancialAggregation {
    const transactions = classifiedResults.map(r => r.originalData);
    const dates = transactions.map(t => new Date(t.created_at));

    const aggregation: ZOTFinancialAggregation = {
      botName,
      dateRange: {
        from: new Date(Math.min(...dates.map(d => d.getTime()))),
        to: new Date(Math.max(...dates.map(d => d.getTime())))
      },
      totalTransactions: transactions.length,
      realIncome: 0,
      virtualIncome: 0,
      realExpenses: 0,
      virtualExpenses: 0,
      netProfit: 0,
      virtualMargin: 0,
      avgTransactionValue: 0,
      serviceBreakdown: this.initializeServiceBreakdown(),
      monthlyBreakdown: []
    };

    // Aggregate by payment type
    classifiedResults.forEach(result => {
      const transaction = result.originalData;
      const amount = transaction.amount || 0;
      const stars = transaction.stars || 0;

      switch (result.paymentType) {
        case ZOTPaymentType.REAL_INCOME:
          aggregation.realIncome += amount;
          break;
        case ZOTPaymentType.VIRTUAL_INCOME:
          aggregation.virtualIncome += stars;
          break;
        case ZOTPaymentType.REAL_EXPENSE:
          aggregation.realExpenses += amount;
          break;
        case ZOTPaymentType.VIRTUAL_EXPENSE:
          aggregation.virtualExpenses += stars;
          break;
      }

      // Aggregate by service category
      if (result.serviceCategory !== ZOTServiceCategory.UNKNOWN_SERVICE) {
        const service = aggregation.serviceBreakdown[result.serviceCategory];
        service.transactions++;
        service.totalStars += stars;
        service.totalAmount += amount;
        service.avgCost = service.transactions > 0 ? service.totalStars / service.transactions : 0;
      }
    });

    // Calculate derived metrics
    aggregation.netProfit = aggregation.realIncome - aggregation.realExpenses;
    aggregation.virtualMargin = aggregation.virtualIncome - aggregation.virtualExpenses;
    aggregation.avgTransactionValue = aggregation.totalTransactions > 0 ?
      (aggregation.realIncome + aggregation.virtualIncome) / aggregation.totalTransactions : 0;

    // Generate monthly breakdown
    aggregation.monthlyBreakdown = this.generateMonthlyBreakdown(classifiedResults);

    return aggregation;
  }

  /**
   * Initialize service breakdown structure
   */
  private initializeServiceBreakdown(): Record<ZOTServiceCategory, {
    transactions: number;
    totalStars: number;
    totalAmount: number;
    avgCost: number;
  }> {
    const breakdown = {} as any;
    Object.values(ZOTServiceCategory).forEach(category => {
      breakdown[category] = {
        transactions: 0,
        totalStars: 0,
        totalAmount: 0,
        avgCost: 0
      };
    });
    return breakdown;
  }

  /**
   * Generate monthly financial breakdown
   */
  private generateMonthlyBreakdown(classifiedResults: ZOTClassificationResult[]): ZOTMonthlyFinancials[] {
    const monthlyMap = new Map<string, ZOTMonthlyFinancials>();

    classifiedResults.forEach(result => {
      const transaction = result.originalData;
      const date = new Date(transaction.created_at);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!monthlyMap.has(monthKey)) {
        monthlyMap.set(monthKey, {
          month: monthKey,
          realIncome: 0,
          virtualIncome: 0,
          realExpenses: 0,
          virtualExpenses: 0,
          netProfit: 0,
          transactionCount: 0,
          avgTransactionValue: 0,
          serviceBreakdown: this.initializeServiceBreakdown()
        });
      }

      const monthly = monthlyMap.get(monthKey)!;
      const amount = transaction.amount || 0;
      const stars = transaction.stars || 0;

      monthly.transactionCount++;

      switch (result.paymentType) {
        case ZOTPaymentType.REAL_INCOME:
          monthly.realIncome += amount;
          break;
        case ZOTPaymentType.VIRTUAL_INCOME:
          monthly.virtualIncome += stars;
          break;
        case ZOTPaymentType.REAL_EXPENSE:
          monthly.realExpenses += amount;
          break;
        case ZOTPaymentType.VIRTUAL_EXPENSE:
          monthly.virtualExpenses += stars;
          break;
      }

      // Update service breakdown
      if (result.serviceCategory !== ZOTServiceCategory.UNKNOWN_SERVICE) {
        const service = monthly.serviceBreakdown[result.serviceCategory];
        service.transactions++;
        service.totalStars += stars;
        service.totalAmount += amount;
      }
    });

    // Calculate derived metrics for each month
    monthlyMap.forEach(monthly => {
      monthly.netProfit = monthly.realIncome - monthly.realExpenses;
      monthly.avgTransactionValue = monthly.transactionCount > 0 ?
        (monthly.realIncome + monthly.virtualIncome) / monthly.transactionCount : 0;

      // Update average costs for services
      Object.values(monthly.serviceBreakdown).forEach(service => {
        service.avgCost = service.transactions > 0 ? service.totalStars / service.transactions : 0;
      });
    });

    return Array.from(monthlyMap.values()).sort((a, b) => a.month.localeCompare(b.month));
  }

  /**
   * Validate financial aggregation
   */
  private validateAggregation(
    aggregation: ZOTFinancialAggregation,
    context: ZOTProcessingContext
  ): { errors: ZOTValidationError[]; warnings: ZOTValidationWarning[] } {
    const errors: ZOTValidationError[] = [];
    const warnings: ZOTValidationWarning[] = [];

    // Check for negative balances
    if (aggregation.netProfit < 0) {
      warnings.push({
        code: 'NEGATIVE_NET_PROFIT',
        message: `Bot has negative net profit: ${aggregation.netProfit} RUB`,
        recommendation: 'Review expense allocation and revenue streams'
      });
    }

    if (aggregation.virtualMargin < 0) {
      warnings.push({
        code: 'NEGATIVE_VIRTUAL_MARGIN',
        message: `Bot has negative virtual margin: ${aggregation.virtualMargin} stars`,
        recommendation: 'Review star consumption and income patterns'
      });
    }

    // Check for unusually high expenses
    if (aggregation.realExpenses > aggregation.realIncome * 1.5) {
      warnings.push({
        code: 'HIGH_EXPENSE_RATIO',
        message: 'Real expenses exceed 150% of real income',
        recommendation: 'Review cost structure and pricing strategy'
      });
    }

    // Check for missing service data
    const unknownServiceTransactions = aggregation.serviceBreakdown[ZOTServiceCategory.UNKNOWN_SERVICE].transactions;
    if (unknownServiceTransactions > aggregation.totalTransactions * 0.1) {
      errors.push({
        code: 'HIGH_UNKNOWN_SERVICES',
        message: `${unknownServiceTransactions} transactions have unknown service category`,
        severity: 'MEDIUM',
        suggestion: 'Improve service type classification'
      });
    }

    // Validate monthly consistency
    if (aggregation.monthlyBreakdown.length === 0) {
      errors.push({
        code: 'NO_MONTHLY_DATA',
        message: 'No monthly breakdown data generated',
        severity: 'HIGH',
        suggestion: 'Ensure transactions have valid dates'
      });
    }

    return { errors, warnings };
  }

  /**
   * Validate monthly data consistency
   */
  private validateMonthlyConsistency(
    monthlyData: ZOTMonthlyFinancials[]
  ): { errors: ZOTValidationError[]; warnings: ZOTValidationWarning[] } {
    const errors: ZOTValidationError[] = [];
    const warnings: ZOTValidationWarning[] = [];

    if (monthlyData.length === 0) {
      return { errors, warnings };
    }

    // Check for gaps in monthly data
    const months = monthlyData.map(m => m.month).sort();
    for (let i = 1; i < months.length; i++) {
      const prev = new Date(months[i - 1] + '-01');
      const curr = new Date(months[i] + '-01');
      const monthsDiff = (curr.getFullYear() - prev.getFullYear()) * 12 + curr.getMonth() - prev.getMonth();

      if (monthsDiff > 1) {
        warnings.push({
          code: 'MONTHLY_DATA_GAP',
          message: `Gap in monthly data between ${months[i - 1]} and ${months[i]}`,
          recommendation: 'Verify data completeness for all months'
        });
      }
    }

    // Check for unusual month-to-month variations
    for (let i = 1; i < monthlyData.length; i++) {
      const prev = monthlyData[i - 1];
      const curr = monthlyData[i];

      const incomeChange = prev.realIncome > 0 ?
        Math.abs(curr.realIncome - prev.realIncome) / prev.realIncome : 0;

      if (incomeChange > 2.0) { // More than 200% change
        warnings.push({
          code: 'UNUSUAL_INCOME_VARIATION',
          message: `Large income variation between ${prev.month} and ${curr.month}`,
          recommendation: 'Review for data quality issues or business changes'
        });
      }
    }

    return { errors, warnings };
  }

  /**
   * Detect financial anomalies
   */
  private detectAnomalies(
    aggregation: ZOTFinancialAggregation,
    classifiedResults: ZOTClassificationResult[]
  ): { errors: ZOTValidationError[]; warnings: ZOTValidationWarning[] } {
    const errors: ZOTValidationError[] = [];
    const warnings: ZOTValidationWarning[] = [];

    // Detect unusually large transactions
    const amounts = classifiedResults.map(r => r.originalData.amount || 0).filter(a => a > 0);
    const stars = classifiedResults.map(r => r.originalData.stars || 0).filter(s => s > 0);

    if (amounts.length > 0) {
      const avgAmount = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
      const maxAmount = Math.max(...amounts);

      if (maxAmount > avgAmount * 10) {
        warnings.push({
          code: 'LARGE_AMOUNT_ANOMALY',
          message: `Detected unusually large amount transaction: ${maxAmount} RUB`,
          recommendation: 'Verify large transactions for accuracy'
        });
      }
    }

    if (stars.length > 0) {
      const avgStars = stars.reduce((sum, s) => sum + s, 0) / stars.length;
      const maxStars = Math.max(...stars);

      if (maxStars > avgStars * 10) {
        warnings.push({
          code: 'LARGE_STARS_ANOMALY',
          message: `Detected unusually large stars transaction: ${maxStars} stars`,
          recommendation: 'Verify large star transactions for accuracy'
        });
      }
    }

    // Detect classification confidence issues
    const lowConfidenceResults = classifiedResults.filter(r => r.confidence < 70);
    if (lowConfidenceResults.length > classifiedResults.length * 0.2) {
      errors.push({
        code: 'LOW_CLASSIFICATION_CONFIDENCE',
        message: `${lowConfidenceResults.length} transactions have low classification confidence`,
        severity: 'MEDIUM',
        suggestion: 'Review classification rules and transaction data quality'
      });
    }

    return { errors, warnings };
  }

  /**
   * Calculate comprehensive quality metrics
   */
  private calculateQualityMetrics(
    classifiedResults: ZOTClassificationResult[],
    aggregation: ZOTFinancialAggregation,
    context: ZOTProcessingContext
  ): ZOTQualityMetrics {
    const startTime = Date.now();

    // Completeness: Required fields present
    const requiredFields = ['telegram_id', 'type', 'bot_name', 'description'];
    let completenessScore = 0;
    classifiedResults.forEach(r => {
      const transaction = r.originalData;
      const fieldScore = requiredFields.reduce((acc, field) => {
        return acc + (transaction[field as keyof ZOTTransactionData] ? 1 : 0);
      }, 0);
      completenessScore += (fieldScore / requiredFields.length) * 100;
    });
    const completeness = classifiedResults.length > 0 ? completenessScore / classifiedResults.length : 0;

    // Accuracy: Classification confidence
    const totalConfidence = classifiedResults.reduce((sum, r) => sum + r.confidence, 0);
    const accuracy = classifiedResults.length > 0 ? totalConfidence / classifiedResults.length : 0;

    // Consistency: Similar transactions classified similarly
    const consistency = this.calculateClassificationConsistency(classifiedResults);

    // Timeliness: Recent data quality
    const timeliness = this.calculateDataTimeliness(classifiedResults);

    // Overall score
    const overallScore = (completeness * 0.3 + accuracy * 0.3 + consistency * 0.2 + timeliness * 0.2);

    const processingTime = Date.now() - startTime;

    return {
      completeness,
      accuracy,
      consistency,
      timeliness,
      overallScore,
      recordsProcessed: classifiedResults.length,
      recordsWithIssues: classifiedResults.filter(r => r.errors.length > 0 || r.warnings.length > 0).length,
      processingTime
    };
  }

  /**
   * Calculate classification consistency
   */
  private calculateClassificationConsistency(classifiedResults: ZOTClassificationResult[]): number {
    const groupedByService = new Map<string, ZOTClassificationResult[]>();

    classifiedResults.forEach(result => {
      const key = result.originalData.service_type || 'unknown';
      if (!groupedByService.has(key)) {
        groupedByService.set(key, []);
      }
      groupedByService.get(key)!.push(result);
    });

    let consistencyScore = 0;
    let groupCount = 0;

    groupedByService.forEach(group => {
      if (group.length > 1) {
        const serviceCategories = group.map(r => r.serviceCategory);
        const uniqueCategories = new Set(serviceCategories);
        const consistency = 1 - (uniqueCategories.size - 1) / group.length;
        consistencyScore += consistency * 100;
        groupCount++;
      }
    });

    return groupCount > 0 ? consistencyScore / groupCount : 100;
  }

  /**
   * Calculate data timeliness
   */
  private calculateDataTimeliness(classifiedResults: ZOTClassificationResult[]): number {
    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;

    let timelinessScore = 0;

    classifiedResults.forEach(result => {
      const createdAt = new Date(result.originalData.created_at);
      const daysDiff = (now.getTime() - createdAt.getTime()) / dayMs;

      // Score based on recency
      if (daysDiff <= 7) timelinessScore += 100;
      else if (daysDiff <= 30) timelinessScore += 80;
      else if (daysDiff <= 90) timelinessScore += 60;
      else timelinessScore += 40;
    });

    return classifiedResults.length > 0 ? timelinessScore / classifiedResults.length : 100;
  }

  /**
   * Calculate overall confidence
   */
  private calculateOverallConfidence(qualityMetrics: ZOTQualityMetrics, errorCount: number): number {
    let confidence = qualityMetrics.overallScore;

    // Penalize for errors
    if (errorCount > 0) {
      confidence = Math.max(0, confidence - (errorCount * 5));
    }

    return Math.min(100, confidence);
  }

  /**
   * Get confidence level from score
   */
  private getConfidenceLevel(score: number): ZOTConfidenceLevel {
    const thresholds = this.config.confidenceThresholds!;
    if (score >= thresholds.high) return ZOTConfidenceLevel.HIGH;
    if (score >= thresholds.medium) return ZOTConfidenceLevel.MEDIUM;
    if (score >= thresholds.low) return ZOTConfidenceLevel.LOW;
    if (score >= 40) return ZOTConfidenceLevel.VERY_LOW;
    return ZOTConfidenceLevel.FAILED;
  }

  /**
   * Generate validation suggestions
   */
  private generateValidationSuggestions(
    errors: ZOTValidationError[],
    warnings: ZOTValidationWarning[],
    aggregation: ZOTFinancialAggregation
  ): string[] {
    const suggestions: string[] = [];

    // Error-based suggestions
    const errorCodes = errors.map(e => e.code);
    if (errorCodes.includes('MISSING_TELEGRAM_ID')) {
      suggestions.push('Ensure all transactions include telegram_id field');
    }
    if (errorCodes.includes('HIGH_UNKNOWN_SERVICES')) {
      suggestions.push('Improve service type mapping and classification rules');
    }
    if (errorCodes.includes('LOW_CLASSIFICATION_CONFIDENCE')) {
      suggestions.push('Review transaction descriptions and add more classification rules');
    }

    // Warning-based suggestions
    const warningCodes = warnings.map(w => w.code);
    if (warningCodes.includes('NEGATIVE_NET_PROFIT')) {
      suggestions.push('Analyze cost structure and consider pricing adjustments');
    }
    if (warningCodes.includes('HIGH_EXPENSE_RATIO')) {
      suggestions.push('Optimize operational expenses and service costs');
    }

    // Data quality suggestions
    if (aggregation.totalTransactions < 10) {
      suggestions.push('Collect more transaction data for better validation accuracy');
    }

    return suggestions;
  }

  /**
   * Detect missing financial data
   */
  private detectMissingFinancialData(
    aggregation: ZOTFinancialAggregation,
    classifiedResults: ZOTClassificationResult[]
  ): ZOTMissingData[] {
    const missing: ZOTMissingData[] = [];

    // Check for missing service types
    const noServiceType = classifiedResults.filter(r => !r.originalData.service_type).length;
    if (noServiceType > 0) {
      missing.push({
        type: 'REQUIRED_FIELD',
        description: 'Missing service_type in transactions',
        impact: 'HIGH',
        affectedRecords: noServiceType,
        resolution: 'Add service_type field to all transactions'
      });
    }

    // Check for missing metadata
    const noMetadata = classifiedResults.filter(r =>
      !r.originalData.metadata || Object.keys(r.originalData.metadata).length === 0
    ).length;
    if (noMetadata > aggregation.totalTransactions * 0.5) {
      missing.push({
        type: 'INCOMPLETE_RECORD',
        description: 'Missing metadata in majority of transactions',
        impact: 'MEDIUM',
        affectedRecords: noMetadata,
        resolution: 'Include relevant metadata for better classification'
      });
    }

    // Check for missing monthly data
    const expectedMonths = this.calculateExpectedMonths(aggregation.dateRange);
    if (aggregation.monthlyBreakdown.length < expectedMonths) {
      missing.push({
        type: 'EXPECTED_TRANSACTION',
        description: 'Missing transactions for some months',
        impact: 'MEDIUM',
        affectedRecords: expectedMonths - aggregation.monthlyBreakdown.length,
        resolution: 'Verify data completeness for entire date range'
      });
    }

    return missing;
  }

  /**
   * Calculate expected number of months
   */
  private calculateExpectedMonths(dateRange: { from: Date; to: Date }): number {
    const months = (dateRange.to.getFullYear() - dateRange.from.getFullYear()) * 12 +
                   dateRange.to.getMonth() - dateRange.from.getMonth() + 1;
    return Math.max(1, months);
  }

  /**
   * Get empty quality metrics
   */
  private getEmptyQualityMetrics(): ZOTQualityMetrics {
    return {
      completeness: 0,
      accuracy: 0,
      consistency: 0,
      timeliness: 0,
      overallScore: 0,
      recordsProcessed: 0,
      recordsWithIssues: 0,
      processingTime: 0
    };
  }
}

/**
 * Export default validator instance
 */
export const defaultZOTValidator = new ZOTValidator();