import { MyContext } from '@/interfaces';
import { inngest } from '@/inngest-functions/clients';
import { createMockFunction } from './mockHelper';
import { logger } from '@/utils/logger';

/**
 * Helper function to create a temporary mock for inngest.send
 * that properly handles type checking and verification
 */
export function mockInngestSend() {
  // Create a temporary mock function for inngest.send
  const mockSendEvent = createMockFunction<(event: any) => Promise<any>>();
  mockSendEvent.mockImplementation((event) => {
    // Store the event data for verification
    mockSendEvent.mock.calls.push([event]);
    return Promise.resolve({
      ids: ['test-id'],
      success: true
    });
  });
  
  // Save original function
  const originalSend = inngest.send;
  
  // Replace with mock
  inngest.send = mockSendEvent;
  
  // Return function to restore original
  return () => {
    inngest.send = originalSend;
  };
}

/**
 * Enhanced expect function for assertions in tests
 * Replaces the custom expect implementations in each test file
 */
export function expect(value: any): { 
  toBe: (expected: any) => void;
  toEqual: (expected: any) => void;
  toHaveBeenCalled: () => void;
  toHaveBeenCalledWith: (...args: any[]) => void;
  toBeGreaterThan: (expected: number) => void;
  toContain: (substring: string) => void;
  toBeTruthy: () => void;
  toBeFalsy: () => void;
  not: { 
    toHaveBeenCalled: () => void;
    toBe: (expected: any) => void;
    toEqual: (expected: any) => void;
  }
} {
  return {
    toBe: (expected: any) => {
      if (value !== expected) {
        throw new Error(`Expected ${expected} but got ${value}`);
      }
    },
    toEqual: (expected: any) => {
      const valueStr = JSON.stringify(value);
      const expectedStr = JSON.stringify(expected);
      if (valueStr !== expectedStr) {
        throw new Error(`Expected ${expectedStr} but got ${valueStr}`);
      }
    },
    toHaveBeenCalled: () => {
      if (!value || !value.mock || value.mock.calls.length === 0) {
        throw new Error('Expected function to have been called');
      }
    },
    toHaveBeenCalledWith: (...args: any[]) => {
      if (!value || !value.mock || value.mock.calls.length === 0) {
        throw new Error('Expected function to have been called');
      }
      
      const lastCall = value.mock.calls[value.mock.calls.length - 1];
      for (let i = 0; i < args.length; i++) {
        if (JSON.stringify(lastCall[i]) !== JSON.stringify(args[i])) {
          throw new Error(`Expected function to have been called with ${JSON.stringify(args)} but was called with ${JSON.stringify(lastCall)}`);
        }
      }
    },
    toBeGreaterThan: (expected: number) => {
      if (typeof value !== 'number' || value <= expected) {
        throw new Error(`Expected ${value} to be greater than ${expected}`);
      }
    },
    toContain: (substring: string) => {
      if (typeof value !== 'string' || !value.includes(substring)) {
        throw new Error(`Expected "${value}" to contain "${substring}"`);
      }
    },
    toBeTruthy: () => {
      if (!value) {
        throw new Error(`Expected value to be truthy but got ${value}`);
      }
    },
    toBeFalsy: () => {
      if (value) {
        throw new Error(`Expected value to be falsy but got ${value}`);
      }
    },
    not: {
      toHaveBeenCalled: () => {
        if (value && value.mock && value.mock.calls.length > 0) {
          throw new Error('Expected function not to have been called');
        }
      },
      toBe: (expected: any) => {
        if (value === expected) {
          throw new Error(`Expected ${value} not to be ${expected}`);
        }
      },
      toEqual: (expected: any) => {
        const valueStr = JSON.stringify(value);
        const expectedStr = JSON.stringify(expected);
        if (valueStr === expectedStr) {
          throw new Error(`Expected ${valueStr} not to equal ${expectedStr}`);
        }
      }
    }
  };
}

/**
 * Helper to verify an inngest event was called with expected data
 * Provides clear error messages and type checking
 */
export function verifyInngestEvent(
  mockFn: any, 
  { 
    eventName, 
    requiredData = {} 
  }: { 
    eventName: string; 
    requiredData?: Record<string, any>; 
  }
) {
  if (!mockFn || !mockFn.mock || mockFn.mock.calls.length === 0) {
    throw new Error(`Expected inngest.send to be called with event "${eventName}" but it was not called`);
  }

  if (mockFn.mock.calls.length === 0 || !mockFn.mock.calls[0][0]) {
    throw new Error(`Expected inngest.send to be called with event "${eventName}" but call data is missing`);
  }

  const eventData = mockFn.mock.calls[0][0];
  
  // Verify event name
  if (eventData.name !== eventName) {
    throw new Error(`Expected event name to be "${eventName}" but got "${eventData.name}"`);
  }
  
  // Verify required data properties
  Object.entries(requiredData).forEach(([key, expectedValue]) => {
    if (!eventData.data || eventData.data[key] !== expectedValue) {
      const actualValue = eventData.data ? eventData.data[key] : undefined;
      throw new Error(`Expected event data to have ${key}="${expectedValue}" but got ${key}="${actualValue}"`);
    }
  });
  
  return eventData;
}

/**
 * Run a test function with proper error handling and logging
 * Provides standardized way to execute tests and collect results
 */
export async function runTest(
  testFn: () => Promise<any>,
  { 
    name, 
    category 
  }: { 
    name: string; 
    category: string; 
  }
) {
  try {
    const result = await testFn();
    return {
      name,
      category,
      success: true,
      message: result?.message || `Test "${name}" completed successfully`
    };
  } catch (error) {
    logger.error(`Error in test "${name}":`, error);
    return {
      name,
      category,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Log the results of tests in a standardized format
 */
export function logTestResults(results: any[], groupName: string) {
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  
  console.log(`✅ ${groupName} tests completed: ${successCount} passed, ${failCount} failed`);
  
  if (failCount > 0) {
    console.log('❌ Failed tests:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.name}: ${r.message}`);
    });
  }
}

export default {
  mockInngestSend,
  expect,
  verifyInngestEvent,
  runTest,
  logTestResults
}; 