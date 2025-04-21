// Mock PinataSDK to capture constructor args
jest.mock('pinata-web3', () => ({
  PinataSDK: jest.fn().mockImplementation(opts => ({ opts })),
}))

describe('core/pinata client', () => {
  let pinata: any
  let PinataSDK: jest.Mock

  beforeEach(() => {
    jest.resetModules()
    // Set environment for config
    process.env.PINATA_JWT = 'jwt-token'
    process.env.PINATA_GATEWAY = 'gateway-url'
    // Load module under test
    const mod = require('../../src/core/pinata')
    pinata = mod.pinata
    PinataSDK = require('pinata-web3').PinataSDK
  })

  it('constructs PinataSDK with correct options', () => {
    expect(PinataSDK).toHaveBeenCalledWith({
      pinataJwt: 'jwt-token',
      pinataGateway: 'gateway-url',
    })
    // Instance should expose opts matching input
    expect(pinata.opts).toEqual({
      pinataJwt: 'jwt-token',
      pinataGateway: 'gateway-url',
    })
  })
})
