import { jest, describe, it, expect, beforeEach } from '@jest/globals'

describe('config/index debug .env loading', () => {
  let logSpy: jest.SpyInstance
  let errorSpy: jest.SpyInstance

  beforeEach(async () => {
    // Reset modules and env
    jest.resetModules()
    process.env = {}
    // Simulate development without Jest
    process.env.NODE_ENV = 'development'
    delete process.env.JEST_WORKER_ID
    // Mock fs and path and dotenv
    jest.doMock('fs', () => ({
      readdirSync: jest.fn(() => ['.env', '.env.local', 'file.txt']),
      existsSync: jest.fn(),
    }))
    jest.doMock('path', () => ({
      join: (cwd: string, file: string) => `${cwd}/${file}`,
    }))
    jest.doMock('dotenv', () => ({
      config: (opts: any) => ({ parsed: { TEST: '1' } }),
    }))
    // Spy on console
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    // Load module
    require('../../src/config/index')
  })

  it('logs debug header and working directory', () => {
    expect(logSpy).toHaveBeenCalledWith('--- Debugging .env loading --- ')
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[CONFIG] Current Working Directory:')
    )
  })

  it('logs found .env files and load attempts', () => {
    expect(logSpy).toHaveBeenCalledWith(
      `[CONFIG] Found .env files: .env, .env.local, file.txt`
    )
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[CONFIG] Attempting to load env file from:')
    )
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[CONFIG] dotenv load result: Success')
    )
  })

  it('does not log errors when .env parsed', () => {
    // Since parsed is truthy, no error on parsing
    expect(errorSpy).not.toHaveBeenCalled()
  })
})