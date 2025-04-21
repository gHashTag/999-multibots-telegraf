// Mock replicate default export
const mockReplicateConstructor = jest.fn().mockImplementation(function (opts) {
  this.opts = opts
})
jest.mock('replicate', () => mockReplicateConstructor)

// Prepare env
beforeAll(() => {
  process.env.REPLICATE_API_TOKEN = 'replicate-token'
})

describe('core/replicate index', () => {
  let replicateModule: typeof import('@/core/replicate')

  beforeAll(() => {
    jest.resetModules()
    replicateModule = require('@/core/replicate')
  })

  it('initializes Replicate with auth from env', () => {
    expect(mockReplicateConstructor).toHaveBeenCalledTimes(1)
    expect(mockReplicateConstructor).toHaveBeenCalledWith({
      auth: 'replicate-token',
    })
    expect((replicateModule.replicate as any).opts).toEqual({
      auth: 'replicate-token',
    })
  })

  it('exports modelPricing mapping', () => {
    const { modelPricing } = replicateModule
    // Check some known keys
    expect(modelPricing['black-forest-labs/flux-1.1-pro']).toBe(
      '$0.040 / image'
    )
    expect(modelPricing['stability-ai/stable-diffusion-3.5-large-turbo']).toBe(
      '$0.040 / image'
    )
    // Expect record contains at least 3 entries
    expect(Object.keys(modelPricing).length).toBeGreaterThanOrEqual(3)
  })

  it('models.getInput returns correct dimensions for various aspect ratios', () => {
    const { models } = replicateModule
    // 1:1 aspect ratio
    const in1 = models.flux.getInput('hello', '1:1')
    expect(in1).toMatchObject({
      prompt: 'hello',
      aspect_ratio: '1:1',
      width: 1024,
      height: 1024,
    })
    // 16:9 aspect ratio
    const in2 = models.flux.getInput('world', '16:9')
    expect(in2).toMatchObject({
      prompt: 'world',
      aspect_ratio: '16:9',
      width: 1368,
      height: 768,
    })
    // 9:16 aspect ratio
    const in3 = models.flux.getInput('test', '9:16')
    expect(in3).toMatchObject({
      prompt: 'test',
      aspect_ratio: '9:16',
      width: 768,
      height: 1368,
    })
    // default aspect ratio (undefined) should use 16:9
    const in4 = models.flux.getInput('auto', undefined as any)
    expect(in4).toMatchObject({
      prompt: 'auto',
      aspect_ratio: '16:9',
      width: 1368,
      height: 768,
    })
    // unknown aspect ratio should default to fallback dimensions
    const in5 = models.flux.getInput('unknown', '4:3')
    expect(in5).toMatchObject({
      prompt: 'unknown',
      aspect_ratio: '4:3',
      width: 1368,
      height: 1024,
    })
  })

  it('modelPricing has entries for all defined models', () => {
    const { modelPricing, models } = replicateModule
    // For each model config, ensure its key exists in pricing map
    Object.values(models).forEach(mc => {
      expect(modelPricing).toHaveProperty(mc.key)
    })
  })

  it('getInput works for all models', () => {
    const { models } = replicateModule
    // Ensure getInput for each model returns expected structure
    Object.entries(models).forEach(([name, mc]) => {
      const res = mc.getInput('prompt', '1:1')
      expect(res).toHaveProperty('prompt', 'prompt')
      expect(res).toHaveProperty('aspect_ratio', '1:1')
      expect(res).toHaveProperty('width', 1024)
      expect(res).toHaveProperty('height', 1024)
      expect(res).toHaveProperty('negative_prompt')
    })
  })
})
