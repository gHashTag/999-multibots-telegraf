import { describe, it, expect, jest, beforeEach } from '@jest/globals'

// Mock dotenv to prevent real .env loading
jest.mock('dotenv', () => ({ config: jest.fn() }))

describe('core/elevenlabs client creation', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    delete process.env.ELEVENLABS_API_KEY
  })

  it('uses mock client when API key is not set', () => {
    const { elevenlabs } = require('@/core/elevenlabs')
    expect(elevenlabs).toBeDefined()
    expect(typeof elevenlabs.getVoices).toBe('function')
    expect(typeof elevenlabs.generateVoiceSpeech).toBe('function')
  })

  it('uses real client when API key is set and module exists', () => {
    process.env.ELEVENLABS_API_KEY = 'real_key'
    // Provide a fake real client
    class RealClient { constructor(opts: any) {} }
    jest.mock('elevenlabs', () => ({ ElevenLabsClient: RealClient }), { virtual: true })
    const { elevenlabs } = require('@/core/elevenlabs')
    expect(elevenlabs).toBeInstanceOf(RealClient)
  })

  it('falls back to mock client when real client creation throws', () => {
    process.env.ELEVENLABS_API_KEY = 'real_key'
    // Simulate require throwing an error
    jest.mock('elevenlabs', () => { throw new Error('load error') }, { virtual: true })
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const { elevenlabs } = require('@/core/elevenlabs')
    expect(elevenlabs).toBeDefined()
    expect(typeof elevenlabs.getVoices).toBe('function')
    expect(errorSpy).toHaveBeenCalledWith(
      'Error creating ElevenLabs client, falling back to mock:',
      expect.any(Error)
    )
    errorSpy.mockRestore()
  })
})