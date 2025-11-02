/**
 * Common Helpers for Inngest Functions
 * Centralized logging, error handling, and utility functions
 */

import { logger } from '@/utils/logger'

// ===== LOGGING HELPERS =====

/**
 * Enhanced logger for Inngest functions with context
 */
export class InngestLogger {
  private functionName: string
  private telegramId?: string

  constructor(functionName: string, telegramId?: string) {
    this.functionName = functionName
    this.telegramId = telegramId
  }

  private log(level: 'info' | 'warn' | 'error', message: string, metadata?: any) {
    const context = {
      function: this.functionName,
      telegramId: this.telegramId,
      ...metadata,
    }

    logger[level](`[INNGEST ${this.functionName.toUpperCase()}] ${message}`, context)
  }

  info(message: string, metadata?: any) {
    this.log('info', message, metadata)
  }

  warn(message: string, metadata?: any) {
    this.log('warn', message, metadata)
  }

  error(message: string, metadata?: any) {
    this.log('error', message, metadata)
  }

  debug(message: string, metadata?: any) {
    logger.debug(`[INNGEST ${this.functionName.toUpperCase()}] ${message}`, {
      function: this.functionName,
      telegramId: this.telegramId,
      ...metadata,
    })
  }

  /**
   * Log function start
   */
  functionStart(eventName: string, eventData?: any) {
    this.info('Function started', {
      eventName,
      hasData: !!eventData,
      dataKeys: eventData ? Object.keys(eventData) : [],
    })
  }

  /**
   * Log function completion
   */
  functionComplete(result?: any) {
    this.info('Function completed successfully', {
      hasResult: !!result,
      resultKeys: result ? Object.keys(result) : [],
    })
  }

  /**
   * Log step execution
   */
  stepStart(stepName: string) {
    this.info(`Step started: ${stepName}`)
  }

  stepComplete(stepName: string, result?: any) {
    this.info(`Step completed: ${stepName}`, {
      hasResult: !!result,
      resultKeys: result ? Object.keys(result) : [],
    })
  }
}

/**
 * Create logger instance
 */
export function createInngestLogger(functionName: string, telegramId?: string) {
  return new InngestLogger(functionName, telegramId)
}

// ===== ERROR HANDLING HELPERS =====

/**
 * Enhanced error class for Inngest functions
 */
export class InngestFunctionError extends Error {
  public readonly functionName: string
  public readonly telegramId?: string
  public readonly stepName?: string
  public readonly context?: any
  public readonly severity: 'critical' | 'high' | 'medium' | 'low'

  constructor(
    message: string,
    options: {
      functionName: string
      telegramId?: string
      stepName?: string
      context?: any
      severity?: 'critical' | 'high' | 'medium' | 'low'
      cause?: Error
    }
  ) {
    super(message)
    this.name = 'InngestFunctionError'
    this.functionName = options.functionName
    this.telegramId = options.telegramId
    this.stepName = options.stepName
    this.context = options.context
    this.severity = options.severity || 'medium'

    if (options.cause) {
      this.stack = `${options.cause.stack}\n\nCaused by:\n${this.stack}`
    }
  }
}

/**
 * Create and log Inngest function error
 */
export function createFunctionError(
  functionName: string,
  message: string,
  options: {
    telegramId?: string
    stepName?: string
    context?: any
    severity?: 'critical' | 'high' | 'medium' | 'low'
    cause?: Error
  } = {}
): InngestFunctionError {
  const error = new InngestFunctionError(message, {
    functionName,
    ...options,
  })

  // Log the error
  const logger = createInngestLogger(functionName, options.telegramId)
  logger.error(`Error in function${options.stepName ? `, step: ${options.stepName}` : ''}`, {
    message: error.message,
    severity: error.severity,
    context: options.context,
    cause: options.cause?.message,
  })

  return error
}

/**
 * Handle step error with enhanced logging
 */
export function handleStepError(
  functionName: string,
  stepName: string,
  error: unknown,
  options: {
    telegramId?: string
    context?: any
    severity?: 'critical' | 'high' | 'medium' | 'low'
  } = {}
): never {
  const errorMessage = error instanceof Error ? error.message : String(error)
  const inngestError = createFunctionError(functionName, errorMessage, {
    telegramId: options.telegramId,
    stepName,
    context: options.context,
    severity: options.severity,
    cause: error instanceof Error ? error : undefined,
  })

  throw inngestError
}

/**
 * Safe async wrapper with error handling
 */
export async function safeAsync<T>(
  operation: () => Promise<T>,
  options: {
    functionName: string
    stepName?: string
    telegramId?: string
    context?: any
    onError?: (error: Error) => T | Promise<T>
  }
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (options.onError) {
      return await options.onError(error instanceof Error ? error : new Error(String(error)))
    }

    handleStepError(
      options.functionName,
      options.stepName || 'operation',
      error,
      {
        telegramId: options.telegramId,
        context: options.context,
      }
    )

    // This will never be reached, but TypeScript doesn't know that
    throw error
  }
}

// ===== VALIDATION HELPERS =====

/**
 * Validate required fields
 */
export function validateRequiredFields(
  data: Record<string, any>,
  requiredFields: string[],
  context: string
) {
  const missingFields = requiredFields.filter(field => !data[field])

  if (missingFields.length > 0) {
    throw new Error(`Missing required fields in ${context}: ${missingFields.join(', ')}`)
  }
}

/**
 * Validate field types
 */
export function validateFieldTypes(
  data: Record<string, any>,
  fieldTypes: Record<string, 'string' | 'number' | 'boolean' | 'array' | 'object'>,
  context: string
) {
  const errors: string[] = []

  for (const [field, expectedType] of Object.entries(fieldTypes)) {
    const value = data[field]
    if (value !== undefined) {
      const actualType = Array.isArray(value) ? 'array' : typeof value
      if (actualType !== expectedType) {
        errors.push(`${field}: expected ${expectedType}, got ${actualType}`)
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Type validation failed in ${context}:\n${errors.join('\n')}`)
  }
}

// ===== METADATA HELPERS =====

/**
 * Extract metadata from event data
 */
export function extractMetadata(eventData: any, fields: string[]) {
  const metadata: Record<string, any> = {}

  for (const field of fields) {
    if (eventData[field] !== undefined) {
      metadata[field] = eventData[field]
    }
  }

  return metadata
}

/**
 * Add timing metadata
 */
export function addTimingMetadata(startTime: number) {
  const endTime = Date.now()
  return {
    processingTime: endTime - startTime,
    timestamp: new Date().toISOString(),
  }
}

// ===== EVENT HELPERS =====

/**
 * Send success response
 */
export function createSuccessResponse(data?: any, metadata?: any) {
  return {
    success: true,
    data: data || null,
    metadata: metadata || {},
    timestamp: new Date().toISOString(),
  }
}

/**
 * Create error response
 */
export function createErrorResponse(error: string, context?: any) {
  return {
    success: false,
    error,
    context: context || null,
    timestamp: new Date().toISOString(),
  }
}

// ===== PERFORMANCE HELPERS =====

/**
 * Measure execution time
 */
export async function measureExecutionTime<T>(
  operation: () => Promise<T>,
  context: string
): Promise<{ result: T; executionTime: number }> {
  const startTime = Date.now()
  const result = await operation()
  const executionTime = Date.now() - startTime

  logger.debug(`Performance: ${context}`, {
    executionTime,
    timestamp: new Date().toISOString(),
  })

  return { result, executionTime }
}

/**
 * Throttle function execution
 */
export async function throttleOperation<T>(
  operation: () => Promise<T>,
  key: string,
  period: number = 1000
): Promise<T> {
  // Simple in-memory throttle (for production, use Redis)
  const now = Date.now()
  const lastExecution = (global as any).__throttleCache?.[key] || 0

  if (now - lastExecution < period) {
    const waitTime = period - (now - lastExecution)
    await new Promise(resolve => setTimeout(resolve, waitTime))
  }

  const result = await operation()

  if (!(global as any).__throttleCache) {
    (global as any).__throttleCache = {}
  }
  ;(global as any).__throttleCache[key] = Date.now()

  return result
}
