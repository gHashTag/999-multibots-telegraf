describe('core/elevenlabs client', () => {
  let elevenlabs: any

  beforeEach(() => {
    // Clear module cache and env to force mock client
    jest.resetModules()
    delete process.env.ELEVENLABS_API_KEY
    // Import module under test
    const mod = require('../../src/core/elevenlabs')
    elevenlabs = mod.elevenlabs
  })

  it('getVoices returns an object with voices array', async () => {
    expect(typeof elevenlabs.getVoices).toBe('function')
    const result = await elevenlabs.getVoices()
    expect(result).toEqual({ voices: [] })
  })

  it('generateVoiceSpeech returns a buffer of length 1', async () => {
    expect(typeof elevenlabs.generateVoiceSpeech).toBe('function')
    const buffer = await elevenlabs.generateVoiceSpeech('voiceId', 'hello')
    // Should be ArrayBuffer or a Buffer convertible
    if (buffer instanceof ArrayBuffer) {
      expect(buffer.byteLength).toBe(1)
    } else if (Buffer.isBuffer(buffer)) {
      expect(buffer.length).toBe(1)
    } else {
      throw new Error('Unexpected buffer type')
    }
  })
})
