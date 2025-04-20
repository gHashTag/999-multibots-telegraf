import fs from 'fs'
import path from 'path'
import fs from 'fs'
import path from 'path'

describe('config debug loading block', () => {
  const envPath = path.resolve(process.cwd(), '.env')
  let logSpy: jest.SpyInstance

  beforeEach(() => {
    jest.resetModules()
    // Simulate development environment and clear JEST_WORKER_ID to run debug block
    process.env.NODE_ENV = 'development'
    delete process.env.JEST_WORKER_ID
    // Create dummy .env file for loading
    fs.writeFileSync(envPath, 'FOO=bar')
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
    try { fs.unlinkSync(envPath) } catch {};
  })

  it('executes debug logs and loads .env file', () => {
    // Require config module to trigger top-level code
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('../../src/config')
    expect(logSpy).toHaveBeenCalled()
  })
})