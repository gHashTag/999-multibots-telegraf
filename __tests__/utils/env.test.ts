import {
  isWebhookEnv,
  getEnvNumber,
  getEnvBoolean,
  getEnvString,
  isDevelopment,
  isProduction,
} from '../../src/utils/env'

describe('env utils', () => {
  beforeEach(() => {
    jest.resetModules()
    // clear env
    delete process.env.NODE_ENV
    delete process.env.WEBHOOK_DOMAIN
    delete process.env.TEST_VAR
  })

  describe('isWebhookEnv', () => {
    it('returns true in production', () => {
      process.env.NODE_ENV = 'production'
      expect(isWebhookEnv()).toBe(true)
    })

    it('returns true when WEBHOOK_DOMAIN is set', () => {
      process.env.WEBHOOK_DOMAIN = 'example.com'
      expect(isWebhookEnv()).toBe(true)
    })

    it('returns false otherwise', () => {
      process.env.NODE_ENV = 'development'
      expect(isWebhookEnv()).toBe(false)
    })
  })

  describe('getEnvNumber', () => {
    it('returns default when not defined', () => {
      expect(getEnvNumber('UNKNOWN', 42)).toBe(42)
    })
    it('parses integer values', () => {
      process.env.TEST_VAR = '123'
      expect(getEnvNumber('TEST_VAR', 0)).toBe(123)
    })
    it('returns default on NaN', () => {
      process.env.TEST_VAR = 'abc'
      expect(getEnvNumber('TEST_VAR', 7)).toBe(7)
    })
  })

  describe('getEnvBoolean', () => {
    it('returns default when not defined', () => {
      expect(getEnvBoolean('UNKNOWN', true)).toBe(true)
      expect(getEnvBoolean('UNKNOWN', false)).toBe(false)
    })
    it('parses truthy strings (case-insensitive)', () => {
      ['true', 'Yes', '1', 'Y'].forEach(val => {
        process.env.TEST_VAR = val
        expect(getEnvBoolean('TEST_VAR', false)).toBe(true)
      })
    })
    it('returns false for non-truthy values', () => {
      process.env.TEST_VAR = 'no'
      expect(getEnvBoolean('TEST_VAR', true)).toBe(false)
    })
  })

  describe('getEnvString', () => {
    it('returns default when not defined', () => {
      expect(getEnvString('UNKNOWN')).toBe('')
      expect(getEnvString('UNKNOWN', 'def')).toBe('def')
    })
    it('returns value when defined', () => {
      process.env.TEST_VAR = 'value'
      expect(getEnvString('TEST_VAR', 'def')).toBe('value')
    })
  })

  describe('isDevelopment & isProduction', () => {
    it('isDevelopment true when not production', () => {
      process.env.NODE_ENV = 'development'
      expect(isDevelopment()).toBe(true)
      expect(isProduction()).toBe(false)
    })
    it('isProduction true when production', () => {
      process.env.NODE_ENV = 'production'
      expect(isProduction()).toBe(true)
      expect(isDevelopment()).toBe(false)
    })
  })
})