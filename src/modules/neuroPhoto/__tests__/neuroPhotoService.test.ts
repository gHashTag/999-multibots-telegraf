import {
  generateNeuroPhotoV1,
  generateNeuroPhotoV2,
  NeuroPhotoServiceDependencies,
} from '../services/neuroPhotoService'

describe('NeuroPhoto Service', () => {
  let mockDeps: NeuroPhotoServiceDependencies

  beforeEach(() => {
    mockDeps = {
      replicate: {
        generate: jest.fn().mockResolvedValue({ output: 'mocked output' }),
      },
      supabase: {
        getUser: jest.fn().mockResolvedValue({ id: 'user123', balance: 100 }),
        deductBalance: jest.fn().mockResolvedValue(true),
      },
      logger: {
        log: jest.fn(),
        error: jest.fn(),
      },
    }
  })

  describe('generateNeuroPhotoV1', () => {
    it('should generate photo successfully', async () => {
      const result = await generateNeuroPhotoV1(
        mockDeps,
        'user123',
        'test prompt'
      )
      expect(result.success).toBe(true)
      expect(mockDeps.logger.log).toHaveBeenCalledWith(
        'Starting generation V1 for user user123'
      )
    })
  })

  describe('generateNeuroPhotoV2', () => {
    it('should generate photo successfully with V2 model', async () => {
      const result = await generateNeuroPhotoV2(
        mockDeps,
        'user123',
        'test prompt',
        1,
        'playground-v2.5'
      )
      expect(result.success).toBe(true)
      expect(mockDeps.logger.log).toHaveBeenCalledWith(
        'Starting generation V2 for user user123 with model playground-v2.5'
      )
    })
  })
})
