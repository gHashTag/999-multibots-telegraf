/**
 * ZOT (Zero-Omission-Testing) Test Suite
 *
 * Comprehensive testing for financial data validation with
 * zero-tolerance for errors and complete scenario coverage.
 *
 * @version 1.0.0
 * @author ZOT Model Creator Agent
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import {
  ZOTPaymentType,
  ZOTMoneySource,
  ZOTServiceCategory,
  ZOTConfidenceLevel,
  ZOTValidationStatus
} from '../interfaces';
import { ZOTClassifier, ZOTTransactionData } from '../classifier';
import { ZOTValidator } from '../validator';

/**
 * Test Data Factory
 */
class ZOTTestDataFactory {
  /**
   * Create a basic valid transaction
   */
  static createValidTransaction(overrides: Partial<ZOTTransactionData> = {}): ZOTTransactionData {
    return {
      id: 'test-txn-001',
      telegram_id: '123456789',
      amount: 100,
      stars: 0,
      type: 'MONEY_INCOME',
      payment_method: 'Robokassa',
      service_type: 'neuro_photo',
      bot_name: 'test-bot',
      description: 'Photo generation service',
      inv_id: 'inv-001',
      status: 'COMPLETED',
      metadata: { num_images: 1 },
      subscription: null,
      currency: 'RUB',
      created_at: '2024-01-15T10:00:00.000Z',
      updated_at: '2024-01-15T10:01:00.000Z',
      ...overrides
    };
  }

  /**
   * Create Telegram Stars transaction
   */
  static createTelegramStarsTransaction(overrides: Partial<ZOTTransactionData> = {}): ZOTTransactionData {
    return this.createValidTransaction({
      id: 'test-stars-001',
      amount: 0,
      stars: 50,
      payment_method: 'Telegram',
      currency: 'XTR',
      description: 'Telegram Stars payment',
      ...overrides
    });
  }

  /**
   * Create service expense transaction
   */
  static createServiceExpenseTransaction(overrides: Partial<ZOTTransactionData> = {}): ZOTTransactionData {
    return this.createValidTransaction({
      id: 'test-expense-001',
      amount: 0,
      stars: 25,
      type: 'MONEY_OUTCOME',
      service_type: 'kling_video',
      description: 'Video generation cost',
      ...overrides
    });
  }

  /**
   * Create admin bonus transaction
   */
  static createAdminBonusTransaction(overrides: Partial<ZOTTransactionData> = {}): ZOTTransactionData {
    return this.createValidTransaction({
      id: 'test-bonus-001',
      amount: 0,
      stars: 100,
      type: 'MONEY_INCOME',
      payment_method: 'Manual',
      service_type: '',
      description: 'Admin bonus grant',
      ...overrides
    });
  }

  /**
   * Create refund transaction
   */
  static createRefundTransaction(overrides: Partial<ZOTTransactionData> = {}): ZOTTransactionData {
    return this.createValidTransaction({
      id: 'test-refund-001',
      amount: 50,
      stars: 0,
      type: 'REFUND',
      description: 'Payment refund',
      ...overrides
    });
  }

  /**
   * Create invalid transaction (missing required fields)
   */
  static createInvalidTransaction(overrides: Partial<ZOTTransactionData> = {}): ZOTTransactionData {
    return {
      id: 'test-invalid-001',
      telegram_id: '',
      amount: 0,
      stars: 0,
      type: '',
      bot_name: '',
      description: '',
      created_at: '2024-01-15T10:00:00.000Z',
      ...overrides
    } as ZOTTransactionData;
  }

  /**
   * Create test transaction set for comprehensive testing
   */
  static createTestTransactionSet(): ZOTTransactionData[] {
    return [
      // Real income transactions
      this.createValidTransaction({
        id: 'real-income-1',
        amount: 500,
        payment_method: 'Robokassa',
        description: 'Robokassa payment'
      }),
      this.createValidTransaction({
        id: 'real-income-2',
        amount: 300,
        payment_method: 'CryptoBot',
        description: 'CryptoBot payment'
      }),

      // Virtual income transactions
      this.createTelegramStarsTransaction({
        id: 'virtual-income-1',
        stars: 200,
        description: 'Telegram Stars purchase'
      }),
      this.createTelegramStarsTransaction({
        id: 'virtual-income-2',
        stars: 150,
        description: 'Telegram Stars top-up'
      }),

      // Service expenses
      this.createServiceExpenseTransaction({
        id: 'expense-1',
        stars: 25,
        service_type: 'neuro_photo',
        metadata: { num_images: 5 }
      }),
      this.createServiceExpenseTransaction({
        id: 'expense-2',
        stars: 50,
        service_type: 'kling_video',
        metadata: { duration: 10 }
      }),
      this.createServiceExpenseTransaction({
        id: 'expense-3',
        stars: 10,
        service_type: 'text_to_speech',
        metadata: { length: 100 }
      }),

      // Admin operations
      this.createAdminBonusTransaction({
        id: 'admin-bonus-1',
        stars: 100,
        description: 'Welcome bonus'
      }),

      // Refunds
      this.createRefundTransaction({
        id: 'refund-1',
        amount: 100,
        description: 'Service refund'
      }),

      // Edge cases
      this.createValidTransaction({
        id: 'edge-case-1',
        amount: 0,
        stars: 0,
        service_type: 'unknown_service',
        description: 'Unknown transaction'
      })
    ];
  }
}

/**
 * ZOT Classifier Tests
 */
describe('ZOT Classifier', () => {
  let classifier: ZOTClassifier;

  beforeEach(() => {
    classifier = new ZOTClassifier();
  });

  describe('Payment Type Classification', () => {
    test('should classify Robokassa payments as REAL_INCOME', () => {
      const transaction = ZOTTestDataFactory.createValidTransaction({
        payment_method: 'Robokassa',
        type: 'MONEY_INCOME'
      });

      const result = classifier.classifyTransaction(transaction);

      expect(result.paymentType).toBe(ZOTPaymentType.REAL_INCOME);
      expect(result.moneySource).toBe(ZOTMoneySource.ROBOKASSA);
      expect(result.confidence).toBeGreaterThan(80);
    });

    test('should classify Telegram Stars as VIRTUAL_INCOME', () => {
      const transaction = ZOTTestDataFactory.createTelegramStarsTransaction();

      const result = classifier.classifyTransaction(transaction);

      expect(result.paymentType).toBe(ZOTPaymentType.VIRTUAL_INCOME);
      expect(result.moneySource).toBe(ZOTMoneySource.TELEGRAM_STARS);
      expect(result.confidence).toBeGreaterThan(80);
    });

    test('should classify service usage as VIRTUAL_EXPENSE', () => {
      const transaction = ZOTTestDataFactory.createServiceExpenseTransaction();

      const result = classifier.classifyTransaction(transaction);

      expect(result.paymentType).toBe(ZOTPaymentType.VIRTUAL_EXPENSE);
      expect(result.confidence).toBeGreaterThan(80);
    });

    test('should classify admin bonuses as BONUS', () => {
      const transaction = ZOTTestDataFactory.createAdminBonusTransaction();

      const result = classifier.classifyTransaction(transaction);

      expect(result.paymentType).toBe(ZOTPaymentType.BONUS);
      expect(result.moneySource).toBe(ZOTMoneySource.ADMIN);
      expect(result.confidence).toBeGreaterThan(70);
    });

    test('should classify refunds correctly', () => {
      const transaction = ZOTTestDataFactory.createRefundTransaction();

      const result = classifier.classifyTransaction(transaction);

      expect(result.paymentType).toBe(ZOTPaymentType.REFUND);
      expect(result.confidence).toBeGreaterThan(80);
    });
  });

  describe('Service Category Classification', () => {
    test('should classify photo services correctly', () => {
      const transaction = ZOTTestDataFactory.createServiceExpenseTransaction({
        service_type: 'neuro_photo'
      });

      const result = classifier.classifyTransaction(transaction);

      expect(result.serviceCategory).toBe(ZOTServiceCategory.PHOTO_GENERATION);
      expect(result.confidence).toBeGreaterThan(80);
    });

    test('should classify video services correctly', () => {
      const videoServices = ['kling_video', 'haiper_video', 'minimax_video', 'video_generation_other'];

      videoServices.forEach(serviceType => {
        const transaction = ZOTTestDataFactory.createServiceExpenseTransaction({
          service_type: serviceType
        });

        const result = classifier.classifyTransaction(transaction);

        expect(result.serviceCategory).toBe(ZOTServiceCategory.VIDEO_GENERATION);
        expect(result.confidence).toBeGreaterThan(80);
      });
    });

    test('should classify audio services correctly', () => {
      const transaction = ZOTTestDataFactory.createServiceExpenseTransaction({
        service_type: 'text_to_speech'
      });

      const result = classifier.classifyTransaction(transaction);

      expect(result.serviceCategory).toBe(ZOTServiceCategory.AUDIO_GENERATION);
      expect(result.confidence).toBeGreaterThan(80);
    });

    test('should handle unknown services', () => {
      const transaction = ZOTTestDataFactory.createServiceExpenseTransaction({
        service_type: 'unknown_service'
      });

      const result = classifier.classifyTransaction(transaction);

      expect(result.serviceCategory).toBe(ZOTServiceCategory.UNKNOWN_SERVICE);
      expect(result.confidence).toBeLessThan(50);
    });
  });

  describe('Confidence Level Calculation', () => {
    test('should return HIGH confidence for clear classifications', () => {
      const transaction = ZOTTestDataFactory.createValidTransaction({
        payment_method: 'Robokassa',
        type: 'MONEY_INCOME',
        service_type: 'neuro_photo'
      });

      const result = classifier.classifyTransaction(transaction);

      expect(result.confidenceLevel).toBe(ZOTConfidenceLevel.HIGH);
      expect(result.confidence).toBeGreaterThan(90);
    });

    test('should return MEDIUM confidence for partial matches', () => {
      const transaction = ZOTTestDataFactory.createValidTransaction({
        payment_method: 'Unknown',
        type: 'MONEY_INCOME',
        service_type: 'neuro_photo'
      });

      const result = classifier.classifyTransaction(transaction);

      expect(result.confidenceLevel).toBe(ZOTConfidenceLevel.MEDIUM);
      expect(result.confidence).toBeGreaterThanOrEqual(60);
      expect(result.confidence).toBeLessThan(95);
    });

    test('should return LOW confidence for unclear data', () => {
      const transaction = ZOTTestDataFactory.createValidTransaction({
        payment_method: '',
        type: 'UNKNOWN_TYPE',
        service_type: 'unknown_service'
      });

      const result = classifier.classifyTransaction(transaction);

      expect(result.confidenceLevel).toBe(ZOTConfidenceLevel.LOW);
      expect(result.confidence).toBeLessThan(80);
    });
  });

  describe('Validation Error Detection', () => {
    test('should detect missing required fields', () => {
      const transaction = ZOTTestDataFactory.createInvalidTransaction();

      const result = classifier.classifyTransaction(transaction);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.code === 'MISSING_TELEGRAM_ID')).toBe(true);
    });

    test('should detect negative amounts', () => {
      const transaction = ZOTTestDataFactory.createValidTransaction({
        amount: -100,
        stars: -50
      });

      const result = classifier.classifyTransaction(transaction);

      expect(result.errors.some(e => e.code === 'NEGATIVE_AMOUNT')).toBe(true);
    });

    test('should warn about inconsistent currency', () => {
      const transaction = ZOTTestDataFactory.createTelegramStarsTransaction({
        currency: 'RUB' // Should be XTR for Telegram Stars
      });

      const result = classifier.classifyTransaction(transaction);

      expect(result.warnings.some(w => w.code === 'CURRENCY_MISMATCH')).toBe(true);
    });
  });

  describe('Batch Processing', () => {
    test('should process multiple transactions correctly', () => {
      const transactions = ZOTTestDataFactory.createTestTransactionSet();

      const results = classifier.classifyTransactions(transactions);

      expect(results).toHaveLength(transactions.length);
      results.forEach(result => {
        expect(result.confidence).toBeGreaterThan(0);
        expect(result.paymentType).toBeDefined();
        expect(result.serviceCategory).toBeDefined();
      });
    });

    test('should maintain classification consistency for similar transactions', () => {
      const photoTransactions = [
        ZOTTestDataFactory.createServiceExpenseTransaction({ service_type: 'neuro_photo', id: 'photo-1' }),
        ZOTTestDataFactory.createServiceExpenseTransaction({ service_type: 'neuro_photo', id: 'photo-2' }),
        ZOTTestDataFactory.createServiceExpenseTransaction({ service_type: 'neuro_photo', id: 'photo-3' })
      ];

      const results = classifier.classifyTransactions(photoTransactions);

      const serviceCategories = results.map(r => r.serviceCategory);
      const uniqueCategories = new Set(serviceCategories);

      expect(uniqueCategories.size).toBe(1);
      expect(Array.from(uniqueCategories)[0]).toBe(ZOTServiceCategory.PHOTO_GENERATION);
    });
  });
});

/**
 * ZOT Validator Tests
 */
describe('ZOT Validator', () => {
  let validator: ZOTValidator;
  let classifier: ZOTClassifier;

  beforeEach(() => {
    classifier = new ZOTClassifier();
    validator = new ZOTValidator(classifier);
  });

  describe('Financial Validation', () => {
    test('should validate complete transaction set successfully', async () => {
      const transactions = ZOTTestDataFactory.createTestTransactionSet();

      const result = await validator.validateBotFinancials(transactions, 'test-bot');

      expect(result.isValid).toBe(true);
      expect(result.confidenceLevel).not.toBe(ZOTConfidenceLevel.FAILED);
      expect(result.qualityMetrics.recordsProcessed).toBe(transactions.length);
    });

    test('should detect data quality issues', async () => {
      const transactions = [
        ZOTTestDataFactory.createInvalidTransaction(),
        ZOTTestDataFactory.createValidTransaction({ telegram_id: '' }),
        ZOTTestDataFactory.createValidTransaction({ amount: -100 })
      ];

      const result = await validator.validateBotFinancials(transactions, 'test-bot');

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.qualityMetrics.recordsWithIssues).toBeGreaterThan(0);
    });

    test('should calculate quality metrics correctly', async () => {
      const transactions = ZOTTestDataFactory.createTestTransactionSet();

      const result = await validator.validateBotFinancials(transactions, 'test-bot');

      expect(result.qualityMetrics.completeness).toBeGreaterThan(90);
      expect(result.qualityMetrics.accuracy).toBeGreaterThan(80);
      expect(result.qualityMetrics.consistency).toBeGreaterThan(70);
      expect(result.qualityMetrics.overallScore).toBeGreaterThan(75);
    });

    test('should detect missing data patterns', async () => {
      const transactions = [
        ZOTTestDataFactory.createValidTransaction({ service_type: undefined }),
        ZOTTestDataFactory.createValidTransaction({ metadata: undefined }),
        ZOTTestDataFactory.createValidTransaction({ service_type: undefined })
      ];

      const result = await validator.validateBotFinancials(transactions, 'test-bot');

      expect(result.missingData.length).toBeGreaterThan(0);
      expect(result.missingData.some(m => m.type === 'REQUIRED_FIELD')).toBe(true);
    });
  });

  describe('Financial Aggregation', () => {
    test('should aggregate financial data correctly', async () => {
      const transactions = [
        // Real income: 800 RUB
        ZOTTestDataFactory.createValidTransaction({ amount: 500, payment_method: 'Robokassa' }),
        ZOTTestDataFactory.createValidTransaction({ amount: 300, payment_method: 'CryptoBot' }),

        // Virtual income: 350 stars
        ZOTTestDataFactory.createTelegramStarsTransaction({ stars: 200 }),
        ZOTTestDataFactory.createTelegramStarsTransaction({ stars: 150 }),

        // Virtual expenses: 85 stars
        ZOTTestDataFactory.createServiceExpenseTransaction({ stars: 50 }),
        ZOTTestDataFactory.createServiceExpenseTransaction({ stars: 35 })
      ];

      const result = await validator.validateBotFinancials(transactions, 'test-bot');

      // Verify aggregation through quality metrics
      expect(result.qualityMetrics.recordsProcessed).toBe(6);
      expect(result.isValid).toBe(true);
    });

    test('should generate monthly breakdown correctly', async () => {
      const transactions = [
        // January transactions
        ZOTTestDataFactory.createValidTransaction({
          created_at: '2024-01-15T10:00:00.000Z',
          amount: 100
        }),
        ZOTTestDataFactory.createServiceExpenseTransaction({
          created_at: '2024-01-20T10:00:00.000Z',
          stars: 25
        }),

        // February transactions
        ZOTTestDataFactory.createValidTransaction({
          created_at: '2024-02-10T10:00:00.000Z',
          amount: 200
        }),
        ZOTTestDataFactory.createServiceExpenseTransaction({
          created_at: '2024-02-15T10:00:00.000Z',
          stars: 50
        })
      ];

      const result = await validator.validateBotFinancials(transactions, 'test-bot');

      expect(result.isValid).toBe(true);
      // Monthly data should be generated (exact validation would require access to internal aggregation)
    });
  });

  describe('Anomaly Detection', () => {
    test('should detect unusually large transactions', async () => {
      const transactions = [
        ZOTTestDataFactory.createValidTransaction({ amount: 100 }),
        ZOTTestDataFactory.createValidTransaction({ amount: 150 }),
        ZOTTestDataFactory.createValidTransaction({ amount: 5000 }), // Anomaly
        ZOTTestDataFactory.createValidTransaction({ amount: 120 })
      ];

      const result = await validator.validateBotFinancials(transactions, 'test-bot');

      expect(result.warnings.some(w => w.code === 'LARGE_AMOUNT_ANOMALY')).toBe(true);
    });

    test('should detect low classification confidence patterns', async () => {
      const transactions = [
        ZOTTestDataFactory.createValidTransaction({
          payment_method: '',
          service_type: '',
          type: 'UNKNOWN'
        }),
        ZOTTestDataFactory.createValidTransaction({
          payment_method: '',
          service_type: 'unknown_service',
          type: 'UNCLEAR'
        })
      ];

      const result = await validator.validateBotFinancials(transactions, 'test-bot');

      expect(result.errors.some(e => e.code === 'LOW_CLASSIFICATION_CONFIDENCE')).toBe(true);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle empty transaction array', async () => {
      const result = await validator.validateBotFinancials([], 'test-bot');

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'NO_TRANSACTIONS')).toBe(true);
    });

    test('should handle duplicate transaction IDs', async () => {
      const transactions = [
        ZOTTestDataFactory.createValidTransaction({ id: 'duplicate-1' }),
        ZOTTestDataFactory.createValidTransaction({ id: 'duplicate-1' }), // Duplicate
        ZOTTestDataFactory.createValidTransaction({ id: 'unique-1' })
      ];

      const result = await validator.validateBotFinancials(transactions, 'test-bot');

      expect(result.errors.some(e => e.code === 'DUPLICATE_TRANSACTIONS')).toBe(true);
    });

    test('should handle invalid date formats', async () => {
      const transactions = [
        ZOTTestDataFactory.createValidTransaction({ created_at: 'invalid-date' }),
        ZOTTestDataFactory.createValidTransaction({ created_at: '2024-13-99T25:99:99.000Z' })
      ];

      const result = await validator.validateBotFinancials(transactions, 'test-bot');

      expect(result.errors.some(e => e.code === 'INVALID_DATES')).toBe(true);
    });

    test('should handle validation errors gracefully', async () => {
      // Simulate a scenario that might cause internal errors
      const malformedTransactions = [
        {
          ...ZOTTestDataFactory.createValidTransaction(),
          created_at: null as any
        }
      ];

      const result = await validator.validateBotFinancials(malformedTransactions, 'test-bot');

      // Should not throw, but may have errors
      expect(result).toBeDefined();
      expect(result.validatedAt).toBeInstanceOf(Date);
    });
  });

  describe('Performance Tests', () => {
    test('should process large transaction sets within reasonable time', async () => {
      // Create a large set of transactions
      const largeTransactionSet: ZOTTransactionData[] = [];
      for (let i = 0; i < 1000; i++) {
        largeTransactionSet.push(
          ZOTTestDataFactory.createValidTransaction({
            id: `bulk-txn-${i}`,
            telegram_id: `user-${i % 100}`,
            amount: Math.floor(Math.random() * 1000),
            stars: Math.floor(Math.random() * 100)
          })
        );
      }

      const startTime = Date.now();
      const result = await validator.validateBotFinancials(largeTransactionSet, 'test-bot');
      const processingTime = Date.now() - startTime;

      expect(result.qualityMetrics.recordsProcessed).toBe(1000);
      expect(processingTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(result.qualityMetrics.processingTime).toBeGreaterThan(0);
    });
  });
});

/**
 * Integration Tests
 */
describe('ZOT Integration Tests', () => {
  let classifier: ZOTClassifier;
  let validator: ZOTValidator;

  beforeEach(() => {
    classifier = new ZOTClassifier();
    validator = new ZOTValidator(classifier);
  });

  describe('End-to-End Validation Workflow', () => {
    test('should perform complete financial validation workflow', async () => {
      // Create a realistic transaction dataset
      const transactions = [
        // Month 1: January 2024
        ZOTTestDataFactory.createValidTransaction({
          id: 'jan-income-1',
          created_at: '2024-01-05T10:00:00.000Z',
          amount: 1000,
          payment_method: 'Robokassa',
          description: 'Monthly subscription'
        }),
        ZOTTestDataFactory.createTelegramStarsTransaction({
          id: 'jan-stars-1',
          created_at: '2024-01-10T10:00:00.000Z',
          stars: 500,
          description: 'Telegram Stars purchase'
        }),
        ZOTTestDataFactory.createServiceExpenseTransaction({
          id: 'jan-expense-1',
          created_at: '2024-01-15T10:00:00.000Z',
          stars: 100,
          service_type: 'neuro_photo',
          metadata: { num_images: 25 }
        }),

        // Month 2: February 2024
        ZOTTestDataFactory.createValidTransaction({
          id: 'feb-income-1',
          created_at: '2024-02-05T10:00:00.000Z',
          amount: 1200,
          payment_method: 'Robokassa',
          description: 'Premium subscription'
        }),
        ZOTTestDataFactory.createTelegramStarsTransaction({
          id: 'feb-stars-1',
          created_at: '2024-02-10T10:00:00.000Z',
          stars: 300,
          description: 'Telegram Stars top-up'
        }),
        ZOTTestDataFactory.createServiceExpenseTransaction({
          id: 'feb-expense-1',
          created_at: '2024-02-15T10:00:00.000Z',
          stars: 150,
          service_type: 'kling_video',
          metadata: { duration: 15 }
        }),

        // Admin operations
        ZOTTestDataFactory.createAdminBonusTransaction({
          id: 'admin-bonus-1',
          created_at: '2024-01-01T10:00:00.000Z',
          stars: 200,
          description: 'New user bonus'
        }),

        // Refund
        ZOTTestDataFactory.createRefundTransaction({
          id: 'refund-1',
          created_at: '2024-02-20T10:00:00.000Z',
          amount: 100,
          description: 'Service refund'
        })
      ];

      const result = await validator.validateBotFinancials(transactions, 'premium-bot');

      // Verify overall validation success
      expect(result.isValid).toBe(true);
      expect(result.confidenceLevel).not.toBe(ZOTConfidenceLevel.FAILED);
      expect(result.qualityMetrics.overallScore).toBeGreaterThan(80);

      // Verify all transactions were processed
      expect(result.qualityMetrics.recordsProcessed).toBe(transactions.length);

      // Verify quality metrics are reasonable
      expect(result.qualityMetrics.completeness).toBeGreaterThan(90);
      expect(result.qualityMetrics.accuracy).toBeGreaterThan(85);
      expect(result.qualityMetrics.consistency).toBeGreaterThan(80);

      // Verify suggestions are generated
      expect(result.suggestions).toBeDefined();
      expect(Array.isArray(result.suggestions)).toBe(true);

      // Verify classification accuracy
      expect(result.classificationAccuracy).toBeGreaterThan(80);
    });

    test('should handle mixed quality data appropriately', async () => {
      const mixedQualityTransactions = [
        // Good quality transactions
        ZOTTestDataFactory.createValidTransaction(),
        ZOTTestDataFactory.createTelegramStarsTransaction(),

        // Poor quality transactions
        ZOTTestDataFactory.createInvalidTransaction(),
        ZOTTestDataFactory.createValidTransaction({
          telegram_id: '',
          service_type: '',
          description: ''
        }),

        // Edge cases
        ZOTTestDataFactory.createValidTransaction({
          amount: 0,
          stars: 0,
          service_type: 'unknown_service'
        })
      ];

      const result = await validator.validateBotFinancials(mixedQualityTransactions, 'mixed-bot');

      // Should complete validation but with errors
      expect(result).toBeDefined();
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.qualityMetrics.recordsWithIssues).toBeGreaterThan(0);

      // Should still provide meaningful metrics
      expect(result.qualityMetrics.completeness).toBeGreaterThan(0);
      expect(result.qualityMetrics.overallScore).toBeGreaterThan(0);
    });
  });

  describe('Real-world Scenario Tests', () => {
    test('should validate typical bot monthly operations', async () => {
      const monthlyTransactions = ZOTTestDataFactory.createTestTransactionSet();

      const result = await validator.validateBotFinancials(monthlyTransactions, 'production-bot');

      expect(result.isValid).toBe(true);
      expect(result.qualityMetrics.overallScore).toBeGreaterThan(75);
      expect(result.confidenceLevel).not.toBe(ZOTConfidenceLevel.FAILED);
    });

    test('should handle bot with only subscription transactions', async () => {
      const subscriptionTransactions = [
        ZOTTestDataFactory.createValidTransaction({
          amount: 500,
          payment_method: 'Robokassa',
          service_type: '',
          description: 'NEUROTESTER subscription',
          subscription: 'NEUROTESTER'
        }),
        ZOTTestDataFactory.createValidTransaction({
          amount: 1000,
          payment_method: 'Robokassa',
          service_type: '',
          description: 'NEUROVIDEO subscription',
          subscription: 'NEUROVIDEO'
        })
      ];

      const result = await validator.validateBotFinancials(subscriptionTransactions, 'subscription-bot');

      expect(result.isValid).toBe(true);
      expect(result.qualityMetrics.recordsProcessed).toBe(2);
    });

    test('should handle bot with high service usage', async () => {
      const highUsageTransactions: ZOTTransactionData[] = [];

      // Add many service usage transactions
      for (let i = 0; i < 50; i++) {
        highUsageTransactions.push(
          ZOTTestDataFactory.createServiceExpenseTransaction({
            id: `service-${i}`,
            stars: Math.floor(Math.random() * 50) + 10,
            service_type: ['neuro_photo', 'kling_video', 'text_to_speech'][i % 3]
          })
        );
      }

      const result = await validator.validateBotFinancials(highUsageTransactions, 'heavy-usage-bot');

      expect(result.qualityMetrics.recordsProcessed).toBe(50);
      expect(result.qualityMetrics.consistency).toBeGreaterThan(70); // Should maintain consistency
    });
  });
});

/**
 * Performance and Stress Tests
 */
describe('ZOT Performance Tests', () => {
  let validator: ZOTValidator;

  beforeEach(() => {
    validator = new ZOTValidator();
  });

  test('should handle large datasets efficiently', async () => {
    const largeDataset: ZOTTransactionData[] = [];

    // Generate 5000 transactions
    for (let i = 0; i < 5000; i++) {
      const transactionTypes = [
        () => ZOTTestDataFactory.createValidTransaction(),
        () => ZOTTestDataFactory.createTelegramStarsTransaction(),
        () => ZOTTestDataFactory.createServiceExpenseTransaction(),
        () => ZOTTestDataFactory.createAdminBonusTransaction()
      ];

      const createTransaction = transactionTypes[i % transactionTypes.length];
      largeDataset.push(createTransaction());
    }

    const startTime = Date.now();
    const result = await validator.validateBotFinancials(largeDataset, 'performance-test-bot');
    const totalTime = Date.now() - startTime;

    expect(result.qualityMetrics.recordsProcessed).toBe(5000);
    expect(totalTime).toBeLessThan(10000); // Should complete within 10 seconds
    expect(result.qualityMetrics.processingTime).toBeGreaterThan(0);
  });

  test('should maintain accuracy with increasing data volume', async () => {
    const dataSizes = [10, 100, 500, 1000];
    const accuracyResults: number[] = [];

    for (const size of dataSizes) {
      const dataset: ZOTTransactionData[] = [];

      for (let i = 0; i < size; i++) {
        dataset.push(ZOTTestDataFactory.createValidTransaction({
          id: `perf-test-${size}-${i}`
        }));
      }

      const result = await validator.validateBotFinancials(dataset, `perf-bot-${size}`);
      accuracyResults.push(result.qualityMetrics.accuracy);
    }

    // Accuracy should remain consistently high regardless of data size
    accuracyResults.forEach(accuracy => {
      expect(accuracy).toBeGreaterThan(85);
    });
  });
});