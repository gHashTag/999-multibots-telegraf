import md5 from 'md5'
import { calculateRobokassaSignature } from '@/webhooks/robokassa/utils/calculateSignature'

// Mock md5 to return predictable values for testing
jest.mock('md5', () => jest.fn())

describe('calculateRobokassaSignature', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Mock md5 to return the input string in uppercase (simpler for testing)
    ;(md5 as jest.Mock).mockImplementation(str => str.toUpperCase())
  })

  it('should calculate signature without parameters', () => {
    const params = {}
    const password = 'testPassword'

    const result = calculateRobokassaSignature(params, password)

    expect(md5).toHaveBeenCalledWith('::testPassword')
    expect(result).toBe('::TESTPASSWORD')
  })

  it('should calculate signature with numeric parameters', () => {
    const params = { OutSum: 100, InvId: 123 }
    const password = 'testPassword'

    const result = calculateRobokassaSignature(params, password)

    expect(md5).toHaveBeenCalledWith('100:123:testPassword')
    expect(result).toBe('100:123:TESTPASSWORD')
  })

  it('should calculate signature with all parameters including sorted shp params', () => {
    const params = {
      OutSum: '100.00',
      InvId: '123',
      shp_test: 'valueTest',
      shp_account: 'valueAccount',
      SignatureValue: 'shouldBeIgnored',
    }
    const password = 'testPassword'

    const result = calculateRobokassaSignature(params, password)

    // shp params should be sorted alphabetically and appended after password
    expect(md5).toHaveBeenCalledWith(
      '100.00:123:testPassword:shp_account=valueAccount:shp_test=valueTest'
    )
    expect(result).toBe(
      '100.00:123:TESTPASSWORD:SHP_ACCOUNT=VALUEACCOUNT:SHP_TEST=VALUETEST'
    )
  })

  it('should ignore SignatureValue parameter', () => {
    const params = {
      OutSum: '100.00',
      InvId: '123',
      SignatureValue: 'shouldBeIgnored',
    }
    const password = 'testPassword'

    const result = calculateRobokassaSignature(params, password)

    expect(md5).toHaveBeenCalledWith('100.00:123:testPassword')
    expect(result).toBe('100.00:123:TESTPASSWORD')
  })
})
