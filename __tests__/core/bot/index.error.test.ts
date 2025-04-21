jest.mock('@/config') // Мокаем конфиг

// Mock dotenv to prevent loading real .env file
jest.mock('dotenv', () => ({ config: jest.fn() }))

describe('core/bot index environment validation', () => {
  afterEach(() => {
    jest.resetModules()
  })

  it('throws error if BOT_TOKEN_TEST_2 is not set', () => {
    // Prepare environment: all production tokens and BOT_TOKEN_TEST_1 set, but missing TEST_2
    process.env.BOT_TOKEN_1 = 'p1'
    process.env.BOT_TOKEN_2 = 'p2'
    process.env.BOT_TOKEN_3 = 'p3'
    process.env.BOT_TOKEN_4 = 'p4'
    process.env.BOT_TOKEN_5 = 'p5'
    process.env.BOT_TOKEN_6 = 'p6'
    process.env.BOT_TOKEN_7 = 'p7'
    process.env.BOT_TOKEN_TEST_1 = 't1'
    delete process.env.BOT_TOKEN_TEST_2
    process.env.NODE_ENV = 'test'
    // Use isolateModules to ensure fresh module loading
    expect(() => {
      jest.isolateModules(() => {
        require('@/core/bot')
      })
    }).toThrow('BOT_TOKEN_TEST_2 is not set')
  })
})
