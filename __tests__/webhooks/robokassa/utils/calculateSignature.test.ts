import { calculateRobokassaSignature } from '@/webhooks/robokassa/utils/calculateSignature'
import md5 from 'md5'

describe('calculateRobokassaSignature', () => {
  it('calculates signature without shp params', () => {
    const params = { OutSum: '100.00', InvId: '123' }
    const password = 'password'
    const signature = calculateRobokassaSignature(params, password)
    const expected = md5('100.00:123:password').toUpperCase()
    expect(signature).toBe(expected)
  })

  it('calculates signature with numeric params', () => {
    const params = { OutSum: 50, InvId: 1 }
    const password = 'secret'
    const signature = calculateRobokassaSignature(params, password)
    const expected = md5('50:1:secret').toUpperCase()
    expect(signature).toBe(expected)
  })

  it('includes shp params sorted in signature', () => {
    const params = { OutSum: '10', InvId: '2', shp_b: 'beta', shp_a: 'alpha' }
    const password = 'pass'
    const signature = calculateRobokassaSignature(params, password)
    const expected = md5('10:2:pass:shp_a=alpha:shp_b=beta').toUpperCase()
    expect(signature).toBe(expected)
  })

  it('ignores SignatureValue param when calculating', () => {
    const params = { OutSum: '5', InvId: '7', SignatureValue: 'OLD' }
    const password = 'pwd'
    const signature = calculateRobokassaSignature(params, password)
    const expected = md5('5:7:pwd').toUpperCase()
    expect(signature).toBe(expected)
  })
})
