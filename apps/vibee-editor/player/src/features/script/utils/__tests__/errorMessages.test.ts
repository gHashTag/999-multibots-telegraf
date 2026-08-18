// Tests for error message handling

import { describe, it, expect } from 'vitest';
import { parseError, getErrorMessage, shouldRetry, getRetryDelay } from '../errorMessages';

describe('parseError', () => {
  it('should detect rate limit errors', () => {
    const error = new Error('HTTP 429: Rate limit exceeded');
    const result = parseError(error);
    
    expect(result.type).toBe('rate_limit');
    expect(result.retryable).toBe(true);
  });

  it('should detect timeout errors', () => {
    const error = new Error('Request timed out');
    const result = parseError(error);
    
    expect(result.type).toBe('timeout');
    expect(result.retryable).toBe(true);
  });

  it('should detect validation errors', () => {
    const error = new Error('Invalid input: topic is required');
    const result = parseError(error);
    
    expect(result.type).toBe('validation');
    expect(result.retryable).toBe(false);
  });

  it('should detect network errors', () => {
    const error = new TypeError('Failed to fetch');
    const result = parseError(error);
    
    expect(result.type).toBe('network');
    expect(result.retryable).toBe(true);
  });

  it('should handle unknown errors', () => {
    const error = new Error('Something went wrong');
    const result = parseError(error);
    
    expect(result.type).toBe('unknown');
    expect(result.retryable).toBe(true);
  });
});

describe('getErrorMessage', () => {
  it('should return Russian message for rate limit', () => {
    const error = new Error('HTTP 429');
    const message = getErrorMessage(error, 'ru');
    
    expect(message).toContain('Слишком много запросов');
    expect(message).toContain('Подождите');
  });

  it('should return English message for rate limit', () => {
    const error = new Error('HTTP 429');
    const message = getErrorMessage(error, 'en');
    
    expect(message).toContain('Too many requests');
    expect(message).toContain('wait');
  });

  it('should include action in message', () => {
    const error = new Error('timeout');
    const message = getErrorMessage(error, 'en');
    
    expect(message).toContain('Try');
  });
});

describe('shouldRetry', () => {
  it('should retry rate limit errors', () => {
    const error = new Error('429');
    expect(shouldRetry(error)).toBe(true);
  });

  it('should retry timeout errors', () => {
    const error = new Error('timeout');
    expect(shouldRetry(error)).toBe(true);
  });

  it('should not retry validation errors', () => {
    const error = new Error('invalid input');
    expect(shouldRetry(error)).toBe(false);
  });
});

describe('getRetryDelay', () => {
  it('should return 60s for rate limit', () => {
    const error = new Error('429');
    expect(getRetryDelay(error)).toBe(60000);
  });

  it('should return 5s for timeout', () => {
    const error = new Error('timeout');
    expect(getRetryDelay(error)).toBe(5000);
  });

  it('should return 3s for network errors', () => {
    const error = new TypeError('fetch failed');
    expect(getRetryDelay(error)).toBe(3000);
  });
});
