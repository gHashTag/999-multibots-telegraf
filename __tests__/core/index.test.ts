import * as core from '@/core'

describe('core index', () => {
  it('exports key core modules', () => {
    // bot module exports
    expect(core).toHaveProperty('createBotByName')
    expect(typeof core.createBotByName).toBe('function')
    // elevenlabs client
    expect(core).toHaveProperty('elevenlabs')
    expect(core.elevenlabs).toBeDefined()
    // openai module exports
    expect(core).toHaveProperty('getAinews')
    expect(typeof core.getAinews).toBe('function')
    // replicate client
    expect(core).toHaveProperty('replicate')
    expect(core.replicate).toBeDefined()
    // supabase wrapper
    expect(core).toHaveProperty('checkPaymentStatus')
    expect(typeof core.checkPaymentStatus).toBe('function')
    // pinata wrapper
    expect(core).toHaveProperty('pinata')
    expect(core.pinata).toBeDefined()
  })
})
