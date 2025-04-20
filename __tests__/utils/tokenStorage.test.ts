import fs from 'fs'
import path from 'path'
import {
  storeToken,
  getToken,
  hasToken,
  removeToken,
  getStoredBotNames,
} from '../../src/utils/tokenStorage'

const dataDir = path.join(process.cwd(), 'data')
const tokensFile = path.join(dataDir, 'encrypted_tokens.json')

describe('tokenStorage utils', () => {
  beforeEach(() => {
    jest.resetModules()
    // clear encryption key and env
    delete process.env.TOKEN_ENCRYPTION_KEY
    delete process.env.NODE_ENV
    // remove storage file
    if (fs.existsSync(tokensFile)) fs.unlinkSync(tokensFile)
  })

  afterEach(() => {
    if (fs.existsSync(tokensFile)) fs.unlinkSync(tokensFile)
  })

  it('stores and retrieves a valid token', () => {
    const botName = 'botA'
    const token = '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi'
    storeToken(botName, token)
    expect(hasToken(botName)).toBe(true)
    const ret = getToken(botName)
    expect(ret).toBe(token)
    expect(getStoredBotNames()).toContain(botName)
  })

  it('getToken returns undefined for nonexistent bot', () => {
    expect(getToken('noBot')).toBeUndefined()
    expect(hasToken('noBot')).toBe(false)
  })

  it('removes a stored token', () => {
    const botName = 'botB'
    const token = '654321:QRSTUVWXYZABCDEFGHIJKLMNOpqrstuv'
    storeToken(botName, token)
    expect(hasToken(botName)).toBe(true)
    removeToken(botName)
    expect(hasToken(botName)).toBe(false)
    expect(getToken(botName)).toBeUndefined()
  })
})