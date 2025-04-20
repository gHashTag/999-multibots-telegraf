import { describe, it, expect, jest, beforeEach } from '@jest/globals'
// Mock fs and path
jest.mock('fs')
jest.mock('path', () => ({ resolve: jest.fn().mockReturnValue('/fake/path') }))
// Mock logger
jest.mock('@/utils/logger', () => ({
  botLogger: { error: jest.fn() },
  logSecurityEvent: jest.fn(),
}))
import fs from 'fs'
import { loadBotsConfig, loadSecurityConfig } from '@/utils/config'

describe('loadBotsConfig', () => {
  const { botLogger, logSecurityEvent } = require('@/utils/logger')

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns empty array and logs error when config file does not exist', () => {
    fs.existsSync.mockReturnValue(false)
    const result = loadBotsConfig('config/bots.json')
    expect(result).toEqual([])
    expect(botLogger.error).toHaveBeenCalledWith(
      'Config',
      expect.stringContaining('Файл конфигурации не найден')
    )
  })

  it('parses valid config and disables invalid tokens', () => {
    fs.existsSync.mockReturnValue(true)
    const validToken = '12345:' + 'A'.repeat(30)
    const configData = JSON.stringify([
      { name: 'botA', token: validToken, enabled: true },
      { name: 'botB', token: 'invalid', enabled: true },
    ])
    fs.readFileSync.mockReturnValue(configData)
    const result = loadBotsConfig('config/bots.json')
    expect(result).toHaveLength(2)
    expect(result[0].enabled).toBe(true)
    expect(result[1].enabled).toBe(false)
    expect(logSecurityEvent).toHaveBeenCalledWith(
      'invalid_token',
      { botName: 'botB' },
      'error'
    )
  })

  it('disables duplicate bot names', () => {
    fs.existsSync.mockReturnValue(true)
    const token = '123:' + 'B'.repeat(30)
    const configData = JSON.stringify([
      { name: 'dup', token, enabled: true },
      { name: 'dup', token, enabled: true },
    ])
    fs.readFileSync.mockReturnValue(configData)
    const result = loadBotsConfig('config/bots.json')
    expect(result).toHaveLength(2)
    expect(result[1].enabled).toBe(false)
    expect(botLogger.error).toHaveBeenCalled()
  })
})

describe('loadSecurityConfig', () => {
  const { botLogger, logSecurityEvent } = require('@/utils/logger')
  beforeEach(() => {
    jest.clearAllMocks()
    fs.existsSync.mockReturnValue(false)
  })

  it('returns default security config when no file', () => {
    const sec = loadSecurityConfig()
    expect(sec.rateLimit.windowMs).toBe(15 * 60 * 1000)
    expect(sec.rateLimit.max).toBe(100)
    expect(sec.ipWhitelist).toEqual([])
    expect(sec.enableIpFilter).toBe(false)
    expect(sec.tokenValidation).toBe(true)
  })

  it('loads security config from file', () => {
    fs.existsSync.mockReturnValue(true)
    const fileConfig = {
      secretKey: 'mysecret',
      enableIpFilter: true,
      rateLimit: { max: 50 },
      ipWhitelist: ['1.2.3.4'],
    }
    fs.readFileSync.mockReturnValue(JSON.stringify(fileConfig))
    const sec = loadSecurityConfig()
    expect(sec.secretKey).toBe('mysecret')
    expect(sec.enableIpFilter).toBe(true)
    expect(sec.rateLimit.max).toBe(50)
    expect(sec.ipWhitelist).toEqual(['1.2.3.4'])
  })

  it('logs error and returns default on JSON parse error', () => {
    fs.existsSync.mockReturnValue(true)
    fs.readFileSync.mockReturnValue('invalid json')
    expect(loadSecurityConfig()).toBeDefined()
    expect(botLogger.error).toHaveBeenCalled()
    expect(logSecurityEvent).toHaveBeenCalledWith(
      'security_config_load_error',
      expect.any(Object),
      'error'
    )
  })
})