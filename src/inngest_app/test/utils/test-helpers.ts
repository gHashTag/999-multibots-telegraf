/**
 * TEST HELPERS
 *
 * Утилиты для тестирования Inngest функций:
 * - Моки для Inngest клиента
 * - Утилиты для проверки логов
 * - Генераторы тестовых данных
 */

import { vi } from 'vitest'
import type { Mock } from 'vitest'

// ============================================================================
// INNGEST MOCKS
// ============================================================================

export const mockInngestClient = {
  send: vi.fn<any>(),
  createFunction: vi.fn<any>(),
  step: {
    run: vi.fn<any>(),
  },
}

export function setupInngestMocks() {
  vi.clearAllMocks()
  mockInngestClient.send.mockResolvedValue({ ok: true, ids: ['event_123'] })
  mockInngestClient.createFunction.mockImplementation((config, trigger, handler) => ({
    id: config.id,
    name: config.name,
    retries: config.retries || 0,
    trigger,
    handler,
  }))
  mockInngestClient.step.run.mockImplementation(async (name: string, fn: Function) => {
    return await fn()
  })
}

// ============================================================================
// LOGGER MOCKS
// ============================================================================

export interface MockLogger {
  info: Mock
  error: Mock
  warn: Mock
  debug: Mock
}

export function createMockLogger(): MockLogger {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }
}

export function assertLoggerCalled(
  logger: MockLogger,
  method: 'info' | 'error' | 'warn' | 'debug',
  message: string,
) {
  expect(logger[method]).toHaveBeenCalledWith(
    expect.stringContaining(message),
    expect.any(Object),
  )
}

// ============================================================================
// EVENT BUILDERS
// ============================================================================

export function createInngestEvent(name: string, data: any = {}) {
  return {
    name,
    data,
    id: `event_${Date.now()}`,
    timestamp: Date.now(),
    version: '1.0.0',
  }
}

export function createMockContext(
  eventName: string,
  eventData: any,
  step?: any,
  logger?: any,
) {
  return {
    event: createInngestEvent(eventName, eventData),
    step: step || mockInngestClient.step,
    logger: logger || createMockLogger(),
  }
}

// ============================================================================
// ASSERTION HELPERS
// ============================================================================

export function expectSuccessResponse(result: any) {
  expect(result).toEqual(
    expect.objectContaining({
      success: true,
    }),
  )
}

export function expectFailureResponse(result: any) {
  expect(result).toEqual(
    expect.objectContaining({
      success: false,
    }),
  )
}

export function expectStepCalled(stepName: string) {
  expect(mockInngestClient.step.run).toHaveBeenCalledWith(
    stepName,
    expect.any(Function),
  )
}

export function expectStepNotCalled(stepName: string) {
  const calls = mockInngestClient.step.run.mock.calls
  const hasCall = calls.some((call) => call[0] === stepName)
  expect(hasCall).toBe(false)
}

export function getStepCalls() {
  return mockInngestClient.step.run.mock.calls.map((call) => call[0])
}

export function expectEventSent(eventName: string, data?: any) {
  expect(mockInngestClient.send).toHaveBeenCalledWith(
    expect.objectContaining({
      name: eventName,
      ...(data && { data: expect.objectContaining(data) }),
    }),
  )
}

// ============================================================================
// ERROR HELPERS
// ============================================================================

export function createErrorScenario(scenario: string) {
  const errors: Record<string, { error: string; message: string }> = {
    network_error: {
      error: 'NETWORK_ERROR',
      message: 'Ошибка сети',
    },
    validation_error: {
      error: 'VALIDATION_ERROR',
      message: 'Ошибка валидации',
    },
    not_found: {
      error: 'NOT_FOUND',
      message: 'Ресурс не найден',
    },
    unauthorized: {
      error: 'UNAUTHORIZED',
      message: 'Не авторизован',
    },
  }

  return errors[scenario] || errors.validation_error
}

// ============================================================================
// DATA GENERATORS
// ============================================================================

export function generateRandomId(prefix: string = 'test'): string {
  return `${prefix}_${Math.random().toString(36).substring(2, 9)}`
}

export function generateTimestamp(): number {
  return Date.now()
}

export function generateUserData(overrides: Partial<{ telegram_id: string }> = {}) {
  return {
    telegram_id: '123456789',
    ...overrides,
  }
}
