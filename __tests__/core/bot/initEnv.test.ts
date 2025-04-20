import { describe, it, expect, jest, beforeEach } from '@jest/globals'
// Prevent loading real .env file during tests
jest.mock('dotenv', () => ({ config: jest.fn() }))

describe('core/bot module initialization', () => {
  it('throws error if BOT_TOKEN_2 is not set', () => {
    jest.resetModules()
    // Provide BOT_TOKEN_1 but omit BOT_TOKEN_2
    process.env.BOT_TOKEN_1 = 'x1'
    delete process.env.BOT_TOKEN_2
    expect(() => require('@/core/bot')).toThrow('BOT_TOKEN_2 is not set')
  })

  it('throws error if BOT_TOKEN_3 is not set', () => {
    jest.resetModules()
    // Provide BOT_TOKEN_1 and BOT_TOKEN_2, but omit BOT_TOKEN_3
    process.env.BOT_TOKEN_1 = 'x1'
    process.env.BOT_TOKEN_2 = 'x2'
    delete process.env.BOT_TOKEN_3
    expect(() => require('@/core/bot')).toThrow('BOT_TOKEN_3 is not set')
  })
  beforeEach(() => {
    jest.resetModules()
    // Remove the first required BOT_TOKEN to simulate missing env
    delete process.env.BOT_TOKEN_1
    delete process.env.BOT_TOKEN_2
    delete process.env.BOT_TOKEN_TEST_1
  })

  it('throws error if BOT_TOKEN_1 is not set', () => {
    expect(() => require('@/core/bot')).toThrow('BOT_TOKEN_1 is not set')
  })

  it('throws error if BOT_TOKEN_TEST_1 is not set (for tests)', () => {
    // Provide BOT_TOKEN_1 but remove BOT_TOKEN_TEST_1
    process.env.BOT_TOKEN_1 = 'x'
    process.env.BOT_TOKEN_2 = 'y'
    delete process.env.BOT_TOKEN_TEST_1
    process.env.BOT_TOKEN_3 = 'z'
    process.env.BOT_TOKEN_4 = 'a'
    process.env.BOT_TOKEN_5 = 'b'
    process.env.BOT_TOKEN_6 = 'c'
    process.env.BOT_TOKEN_7 = 'd'
    expect(() => require('@/core/bot')).toThrow('BOT_TOKEN_TEST_1 is not set')
  })
  
  it('throws error if BOT_TOKEN_TEST_2 is not set', () => {
    // Provide all production tokens and BOT_TOKEN_TEST_1, but remove BOT_TOKEN_TEST_2
    process.env.BOT_TOKEN_1 = 'x1'
    process.env.BOT_TOKEN_2 = 'x2'
    process.env.BOT_TOKEN_3 = 'x3'
    process.env.BOT_TOKEN_4 = 'x4'
    process.env.BOT_TOKEN_5 = 'x5'
    process.env.BOT_TOKEN_6 = 'x6'
    process.env.BOT_TOKEN_7 = 'x7'
    process.env.BOT_TOKEN_TEST_1 = 't1'
    delete process.env.BOT_TOKEN_TEST_2
    expect(() => require('@/core/bot')).toThrow('BOT_TOKEN_TEST_2 is not set')
  })
})