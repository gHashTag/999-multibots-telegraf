import { Logger } from './logger';
import type { Response } from 'node-fetch';

export type ErrorType = 'API_ERROR' | 'VALIDATION_ERROR' | 'NETWORK_ERROR' | 'UNKNOWN_ERROR';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const logger = new Logger('ErrorHandling');

export async function handleApiResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      errorData?.message || response.statusText,
      errorData
    );
  }
  return response.json();
}

export function isRetryableError(error: Error): boolean {
  if (error instanceof ApiError) {
    // Retry on 5xx server errors and specific 4xx errors
    return error.status >= 500 || [408, 429].includes(error.status);
  }
  return error.name === 'NetworkError';
}

export function classifyError(error: unknown): ErrorType {
  if (error instanceof ApiError) {
    return 'API_ERROR';
  }
  if (error instanceof TypeError || error instanceof SyntaxError) {
    return 'VALIDATION_ERROR';
  }
  if (error instanceof Error && error.name === 'NetworkError') {
    return 'NETWORK_ERROR';
  }
  return 'UNKNOWN_ERROR';
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 1000
): Promise<T> {
  let lastError: Error;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (!isRetryableError(lastError) || attempt === maxRetries) {
        throw lastError;
      }

      logger.warn(`Retry attempt ${attempt}/${maxRetries}`, {
        error: lastError.message,
        nextRetryIn: delay
      });

      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
  }

  throw lastError!;
}

export function logError(error: unknown, context?: Record<string, unknown>): void {
  const errorType = classifyError(error);
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  logger.error(`${errorType}: ${errorMessage}`, {
    ...context,
    stack: error instanceof Error ? error.stack : undefined
  });
} 