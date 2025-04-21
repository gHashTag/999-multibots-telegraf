// Mock pinata-web3 SDK
const mockPinataSDK = jest.fn().mockImplementation(function (opts) {
  this.opts = opts
})
jest.mock('pinata-web3', () => ({ PinataSDK: mockPinataSDK }))

// Ensure config is fresh
jest.mock('@/config', () => ({
  PINATA_JWT: 'jwt-token',
  PINATA_GATEWAY: 'https://gateway.pinata.test',
}))

describe('core/pinata index', () => {
  let pinataModule: typeof import('@/core/pinata')

  beforeAll(() => {
    // Reset modules to apply mocks
    jest.resetModules()
    pinataModule = require('@/core/pinata')
  })

  it('initializes PinataSDK with JWT and gateway from config', () => {
    expect(mockPinataSDK).toHaveBeenCalledTimes(1)
    expect(mockPinataSDK).toHaveBeenCalledWith({
      pinataJwt: 'jwt-token',
      pinataGateway: 'https://gateway.pinata.test',
    })
    // The exported pinata should have stored opts
    expect((pinataModule.pinata as any).opts).toEqual({
      pinataJwt: 'jwt-token',
      pinataGateway: 'https://gateway.pinata.test',
    })
  })
})
