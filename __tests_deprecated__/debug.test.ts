import fs from 'fs'
import path from 'path'
import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from '@jest/globals'

// Mock fs module
jest.mock('fs')

describe('Debug Config Loading', () => {
  const mockFs = fs as jest.Mocked<typeof fs>

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('should load debug config from file if it exists', () => {
    const debugConfigPath = path.join(process.cwd(), 'debug.config.js')
    const mockConfig = { debug: true, anotherOption: 'test' }

    // Mock existsSync to return true
    mockFs.existsSync.mockReturnValue(true)
    // Mock require to return the mock config
    jest.mock(debugConfigPath, () => mockConfig, { virtual: true })

    const loadedConfig = loadDebugConfig()
    expect(loadedConfig).toEqual(mockConfig)
    expect(mockFs.existsSync).toHaveBeenCalledWith(debugConfigPath)
  })

  it('should return an empty object if debug config file does not exist', () => {
    const debugConfigPath = path.join(process.cwd(), 'debug.config.js')

    // Mock existsSync to return false
    mockFs.existsSync.mockReturnValue(false)

    const loadedConfig = loadDebugConfig()
    expect(loadedConfig).toEqual({}) // Should be an empty object
    expect(mockFs.existsSync).toHaveBeenCalledWith(debugConfigPath)
    // Ensure require was not called
    // How to check if require was *not* called for a specific path?
    // We can rely on the fact that if existsSync is false, require shouldn't be called.
  })

  it('should handle errors during require', () => {
    const debugConfigPath = path.join(process.cwd(), 'debug.config.js')
    const requireError = new Error('Failed to require')

    // Mock existsSync to return true
    mockFs.existsSync.mockReturnValue(true)
    // Mock require to throw an error
    jest.mock(
      debugConfigPath,
      () => {
        throw requireError
      },
      { virtual: true }
    )

    // Mock console.error
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    const loadedConfig = loadDebugConfig()
    expect(loadedConfig).toEqual({}) // Should return empty object on error
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error loading debug config:',
      requireError
    )

    consoleErrorSpy.mockRestore()
  })
})

describe('config debug loading block', () => {
  const envPath = path.resolve(process.cwd(), '.env')
  let logSpy: jest.SpiedFunction<typeof console.log>
  let errorSpy: jest.SpiedFunction<typeof console.error>

  beforeEach(() => {
    jest.resetModules()
    process.env.NODE_ENV = 'development'
    delete process.env.JEST_WORKER_ID
    try {
      fs.writeFileSync(envPath, 'FOO=bar')
    } catch (e) {
      /* ignore */
    }
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
    errorSpy.mockRestore()
    try {
      fs.unlinkSync(envPath)
    } catch {}
    delete process.env.NODE_ENV
    process.env.JEST_WORKER_ID = '1'
  })

  it('executes debug logs and loads .env file in development without JEST_WORKER_ID', () => {
    require('../../src/config')
    expect(logSpy).toHaveBeenCalledWith('Executing in debug mode...')
    expect(logSpy).toHaveBeenCalledWith('Loading .env file from:', envPath)
    expect(process.env.FOO).toBe('bar')
    delete process.env.FOO
  })

  it('does not execute debug block if NODE_ENV is not development', () => {
    process.env.NODE_ENV = 'production'
    require('../../src/config')
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('does not execute debug block if JEST_WORKER_ID is set', () => {
    process.env.JEST_WORKER_ID = '1'
    require('../../src/config')
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('handles error if .env file does not exist', () => {
    try {
      fs.unlinkSync(envPath)
    } catch {}
    require('../../src/config')
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error loading .env file')
    )
    expect(logSpy).toHaveBeenCalledWith('Executing in debug mode...')
    expect(process.env.FOO).toBeUndefined()
  })
})
