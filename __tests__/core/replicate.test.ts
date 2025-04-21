// Mock Replicate to capture constructor args
jest.mock('replicate', () => jest.fn().mockImplementation(opts => ({ opts })))
describe('core/replicate client and utilities', () => {
  let replicate: any
  let modelPricing: Record<string, string>
  let models: Record<string, any>
  let ReplicateMock: jest.Mock
  beforeEach(() => {
    jest.resetModules()
    process.env.REPLICATE_API_TOKEN = 'rep-token'
    const mod = require('../../src/core/replicate')
    replicate = mod.replicate
    modelPricing = mod.modelPricing
    models = mod.models
    ReplicateMock = require('replicate')
  })
  it('constructs Replicate with auth token', () => {
    expect(ReplicateMock).toHaveBeenCalledWith({ auth: 'rep-token' })
    expect(replicate.opts).toEqual({ auth: 'rep-token' })
  })
  it('modelPricing contains expected entries', () => {
    expect(modelPricing['black-forest-labs/flux-1.1-pro']).toBe('$0.040 / image')
    expect(modelPricing['ideogram-ai/ideogram-v2']).toBe('$0.080 / image')
  })
  describe('models.flux.getInput', () => {
    it('defaults to 16:9', () => {
      const input = models.flux.getInput('hi')
      expect(input.aspect_ratio).toBe('16:9')
      expect(input.width).toBe(1368)
      expect(input.height).toBe(768)
      expect(input.prompt).toBe('hi')
      expect(input.negative_prompt).toMatch(/nsfw/)
    })
    it('handles 1:1', () => {
      const input = models.flux.getInput('p', '1:1')
      expect(input.width).toBe(1024); expect(input.height).toBe(1024)
    })
    it('handles 9:16', () => {
      const input = models.flux.getInput('p', '9:16')
      expect(input.width).toBe(768); expect(input.height).toBe(1368)
    })
    it('defaults dims for unknown ratio', () => {
      const input = models.flux.getInput('p', 'foo')
      expect(input.width).toBe(1368); expect(input.height).toBe(1024)
    })
  })
  it('invokes getInput wrapper for all models', () => {
    Object.entries(models).forEach(([_, cfg]) => {
      const out = cfg.getInput('prompt')
      expect(out).toHaveProperty('prompt', 'prompt')
      expect(out).toHaveProperty('width')
      expect(out).toHaveProperty('height')
    })
  })
})