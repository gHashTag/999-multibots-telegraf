/**
 * ZOT Custom Jest Matchers
 *
 * Custom matchers for comprehensive ZOT model testing.
 *
 * @version 1.0.0
 * @author ZOT Model Creator Agent
 */

import { expect } from '@jest/globals';
import {
  ZOTClassificationResult,
  ZOTValidationResult,
  ZOTConfidenceLevel,
  ZOTPaymentType,
  ZOTMoneySource,
  ZOTServiceCategory
} from '../interfaces';

declare global {
  namespace jest {
    interface Matchers<R> {
      toHaveHighConfidence(): R;
      toHaveMediumConfidence(): R;
      toLowConfidence(): R;
      toBeValidZOTResult(): R;
      toHaveClassification(paymentType: ZOTPaymentType, moneySource?: ZOTMoneySource, serviceCategory?: ZOTServiceCategory): R;
      toHaveQualityScore(minScore: number): R;
      toProcessWithinTime(maxTimeMs: number): R;
      toHaveMinimalErrors(maxErrors?: number): R;
      toMeetZOTStandards(): R;
    }
  }
}

/**
 * Check if classification result has high confidence (≥95%)
 */
expect.extend({
  toHaveHighConfidence(received: ZOTClassificationResult) {
    const pass = received.confidence >= 95 && received.confidenceLevel === ZOTConfidenceLevel.HIGH;

    if (pass) {
      return {
        message: () => `Expected classification to NOT have high confidence, but got ${received.confidence}% (${received.confidenceLevel})`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected classification to have high confidence (≥95%), but got ${received.confidence}% (${received.confidenceLevel})`,
        pass: false,
      };
    }
  },
});

/**
 * Check if classification result has medium confidence (80-94%)
 */
expect.extend({
  toHaveMediumConfidence(received: ZOTClassificationResult) {
    const pass = received.confidence >= 80 && received.confidence < 95 && received.confidenceLevel === ZOTConfidenceLevel.MEDIUM;

    if (pass) {
      return {
        message: () => `Expected classification to NOT have medium confidence, but got ${received.confidence}% (${received.confidenceLevel})`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected classification to have medium confidence (80-94%), but got ${received.confidence}% (${received.confidenceLevel})`,
        pass: false,
      };
    }
  },
});

/**
 * Check if classification result has low confidence (<80%)
 */
expect.extend({
  toLowConfidence(received: ZOTClassificationResult) {
    const pass = received.confidence < 80 &&
                 [ZOTConfidenceLevel.LOW, ZOTConfidenceLevel.VERY_LOW, ZOTConfidenceLevel.FAILED].includes(received.confidenceLevel);

    if (pass) {
      return {
        message: () => `Expected classification to NOT have low confidence, but got ${received.confidence}% (${received.confidenceLevel})`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected classification to have low confidence (<80%), but got ${received.confidence}% (${received.confidenceLevel})`,
        pass: false,
      };
    }
  },
});

/**
 * Check if validation result is structurally valid
 */
expect.extend({
  toBeValidZOTResult(received: ZOTValidationResult) {
    const requiredFields = [
      'isValid',
      'confidenceLevel',
      'confidenceScore',
      'errors',
      'warnings',
      'suggestions',
      'validatedAt',
      'qualityMetrics',
      'missingData',
      'classificationAccuracy'
    ];

    const missingFields = requiredFields.filter(field => !(field in received));
    const pass = missingFields.length === 0 &&
                 Array.isArray(received.errors) &&
                 Array.isArray(received.warnings) &&
                 Array.isArray(received.suggestions) &&
                 Array.isArray(received.missingData) &&
                 typeof received.isValid === 'boolean' &&
                 typeof received.confidenceScore === 'number' &&
                 typeof received.classificationAccuracy === 'number' &&
                 received.validatedAt instanceof Date;

    if (pass) {
      return {
        message: () => `Expected result to NOT be a valid ZOT validation result`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected result to be a valid ZOT validation result. Missing fields: ${missingFields.join(', ')}`,
        pass: false,
      };
    }
  },
});

/**
 * Check if classification matches expected types
 */
expect.extend({
  toHaveClassification(
    received: ZOTClassificationResult,
    expectedPaymentType: ZOTPaymentType,
    expectedMoneySource?: ZOTMoneySource,
    expectedServiceCategory?: ZOTServiceCategory
  ) {
    let pass = received.paymentType === expectedPaymentType;
    let message = '';

    if (expectedMoneySource && received.moneySource !== expectedMoneySource) {
      pass = false;
      message += `Expected money source ${expectedMoneySource}, got ${received.moneySource}. `;
    }

    if (expectedServiceCategory && received.serviceCategory !== expectedServiceCategory) {
      pass = false;
      message += `Expected service category ${expectedServiceCategory}, got ${received.serviceCategory}. `;
    }

    if (received.paymentType !== expectedPaymentType) {
      message += `Expected payment type ${expectedPaymentType}, got ${received.paymentType}. `;
    }

    if (pass) {
      return {
        message: () => `Expected classification to NOT match the expected types`,
        pass: true,
      };
    } else {
      return {
        message: () => `Classification mismatch: ${message.trim()}`,
        pass: false,
      };
    }
  },
});

/**
 * Check if validation result has minimum quality score
 */
expect.extend({
  toHaveQualityScore(received: ZOTValidationResult, minScore: number) {
    const pass = received.qualityMetrics.overallScore >= minScore;

    if (pass) {
      return {
        message: () => `Expected quality score to be below ${minScore}, but got ${received.qualityMetrics.overallScore}`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected quality score to be at least ${minScore}, but got ${received.qualityMetrics.overallScore}`,
        pass: false,
      };
    }
  },
});

/**
 * Check if operation completed within time limit
 */
expect.extend({
  toProcessWithinTime(received: ZOTValidationResult, maxTimeMs: number) {
    const pass = received.qualityMetrics.processingTime <= maxTimeMs;

    if (pass) {
      return {
        message: () => `Expected processing to take more than ${maxTimeMs}ms, but took ${received.qualityMetrics.processingTime}ms`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected processing to complete within ${maxTimeMs}ms, but took ${received.qualityMetrics.processingTime}ms`,
        pass: false,
      };
    }
  },
});

/**
 * Check if result has minimal errors
 */
expect.extend({
  toHaveMinimalErrors(received: ZOTValidationResult, maxErrors: number = 0) {
    const pass = received.errors.length <= maxErrors;

    if (pass) {
      return {
        message: () => `Expected more than ${maxErrors} errors, but got ${received.errors.length}`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected at most ${maxErrors} errors, but got ${received.errors.length}: ${received.errors.map(e => e.code).join(', ')}`,
        pass: false,
      };
    }
  },
});

/**
 * Check if result meets ZOT quality standards
 */
expect.extend({
  toMeetZOTStandards(received: ZOTValidationResult) {
    const standards = {
      minCompleteness: 90,
      minAccuracy: 85,
      minConsistency: 80,
      minOverallScore: 80,
      maxProcessingTime: 5000,
      maxErrors: 2
    };

    const metrics = received.qualityMetrics;
    const failures: string[] = [];

    if (metrics.completeness < standards.minCompleteness) {
      failures.push(`Completeness ${metrics.completeness}% < ${standards.minCompleteness}%`);
    }

    if (metrics.accuracy < standards.minAccuracy) {
      failures.push(`Accuracy ${metrics.accuracy}% < ${standards.minAccuracy}%`);
    }

    if (metrics.consistency < standards.minConsistency) {
      failures.push(`Consistency ${metrics.consistency}% < ${standards.minConsistency}%`);
    }

    if (metrics.overallScore < standards.minOverallScore) {
      failures.push(`Overall Score ${metrics.overallScore}% < ${standards.minOverallScore}%`);
    }

    if (metrics.processingTime > standards.maxProcessingTime) {
      failures.push(`Processing Time ${metrics.processingTime}ms > ${standards.maxProcessingTime}ms`);
    }

    if (received.errors.length > standards.maxErrors) {
      failures.push(`Errors ${received.errors.length} > ${standards.maxErrors}`);
    }

    const pass = failures.length === 0;

    if (pass) {
      return {
        message: () => `Expected result to NOT meet ZOT standards`,
        pass: true,
      };
    } else {
      return {
        message: () => `ZOT standards not met: ${failures.join(', ')}`,
        pass: false,
      };
    }
  },
});

/**
 * Performance matcher for async operations
 */
export async function expectAsyncPerformance<T>(
  operation: () => Promise<T>,
  maxTimeMs: number
): Promise<{ result: T; duration: number }> {
  const startTime = Date.now();
  const result = await operation();
  const duration = Date.now() - startTime;

  expect(duration).toBeLessThanOrEqual(maxTimeMs);

  return { result, duration };
}

/**
 * Memory usage matcher
 */
export function expectMemoryUsage(
  operation: () => void,
  maxMemoryIncreaseMB: number
): void {
  const initialMemory = process.memoryUsage().heapUsed;

  operation();

  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }

  const finalMemory = process.memoryUsage().heapUsed;
  const memoryIncreaseMB = (finalMemory - initialMemory) / 1024 / 1024;

  expect(memoryIncreaseMB).toBeLessThanOrEqual(maxMemoryIncreaseMB);
}

/**
 * Batch operation matcher
 */
export function expectBatchConsistency<T>(
  results: T[],
  validator: (item: T, index: number, array: T[]) => boolean,
  minConsistencyPercent: number = 90
): void {
  const consistentCount = results.filter(validator).length;
  const consistencyPercent = (consistentCount / results.length) * 100;

  expect(consistencyPercent).toBeGreaterThanOrEqual(minConsistencyPercent);
}

export default {};