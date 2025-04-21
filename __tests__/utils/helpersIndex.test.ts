describe('helpers index exports', () => {
  let helpers: typeof import('@/helpers')
  beforeEach(() => {
    jest.resetModules()
    process.env.NODE_ENV = 'production'
    // Import fresh module
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    helpers = require('@/helpers')
  })

  it('exports isDev based on NODE_ENV', () => {
    process.env.NODE_ENV = 'development'
    jest.resetModules()
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const devHelpers = require('@/helpers')
    expect(devHelpers.isDev).toBe(true)
    process.env.NODE_ENV = 'production'
    jest.resetModules()
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const prodHelpers = require('@/helpers')
    expect(prodHelpers.isDev).toBe(false)
  })

  it('re-exports helper functions correctly', () => {
    // Check that delay and pulse are functions
    expect(typeof helpers.delay).toBe('function')
    expect(typeof helpers.pulse).toBe('function')
    expect(typeof helpers.deleteFile).toBe('function')
    expect(typeof helpers.ensureDirectoryExistence).toBe('function')
    expect(typeof helpers.isRussian).toBe('function')
  })
})
