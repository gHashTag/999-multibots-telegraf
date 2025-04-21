import crypto from 'crypto'
import { validateRobokassaSignature } from '@/core/robokassa/index'
import { logger } from '@/utils/logger'

// Мокаем logger
jest.mock('@/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn() },
}))

describe('validateRobokassaSignature', () => {
  const outSum = '123.45'
  const invId = '789'
  const password = 'secret'
  const dataToHash = `${outSum}:${invId}:${password}`
  const validSig = crypto.createHash('md5').update(dataToHash).digest('hex')

  it('returns true for correct signature without warnings', () => {
    const result = validateRobokassaSignature(outSum, invId, password, validSig)
    expect(result).toBe(true)
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('returns false for incorrect signature and logs warning', () => {
    const badSig = 'wrong'
    const result = validateRobokassaSignature(outSum, invId, password, badSig)
    expect(result).toBe(false)
    expect(logger.warn).toHaveBeenCalledWith(
      'Robokassa signature validation failed',
      expect.objectContaining({
        calculated: expect.any(String),
        received: badSig,
      })
    )
  })

  it('catches errors and logs them', () => {
    // Force error by passing invalid signature type
    // @ts-ignore
    const result = validateRobokassaSignature(outSum, invId, password, 123)
    expect(result).toBe(false)
    expect(logger.error).toHaveBeenCalledWith(
      'Error validating Robokassa signature',
      expect.objectContaining({ error: expect.any(String) })
    )
  })
})
