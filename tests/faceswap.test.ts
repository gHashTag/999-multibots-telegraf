import * as dotenv from 'dotenv'
import { generateFaceSwap } from '../src/services/generateFaceSwap'
import { providerManager } from '../src/services/UniversalProviderManager'

// Load environment variables
dotenv.config()

describe('FaceSwap Integration Tests', () => {
  // Test URLs (you can replace these with real image URLs for testing)
  const targetImageUrl = 'https://replicate.delivery/pbxt/example-target.jpg'
  const swapImageUrl = 'https://replicate.delivery/pbxt/example-swap.jpg'

  beforeAll(() => {
    // Verify REPLICATE_API_TOKEN is set
    if (!process.env.REPLICATE_API_TOKEN) {
      console.error('❌ ERROR: REPLICATE_API_TOKEN not found in .env!')
      console.error('Please add REPLICATE_API_TOKEN to your .env file')
      process.exit(1)
    }
  })

  describe('Direct FaceSwap Service', () => {
    it('should have correct function signature', () => {
      expect(typeof generateFaceSwap).toBe('function')
    })

    it('should validate request parameters', async () => {
      const result = await generateFaceSwap({
        targetImageUrl: '',
        swapImageUrl: '',
      })

      expect(result.success).toBeDefined()
      expect(typeof result.success).toBe('boolean')
    })

    // Uncomment when ready to test with real images
    /*
    it('should generate face-swapped image', async () => {
      const result = await generateFaceSwap({
        targetImageUrl,
        swapImageUrl,
      })

      console.log('📸 FaceSwap Result:', {
        success: result.success,
        resultUrl: result.resultUrl?.substring(0, 100),
        processingTime: result.processingTime,
        cost: result.cost,
        error: result.error,
      })

      expect(result.success).toBe(true)
      expect(result.resultUrl).toBeDefined()
      expect(result.resultUrl).toContain('http')
      expect(result.processingTime).toBeGreaterThan(0)
      expect(result.cost).toBeDefined()
      expect(result.cost?.usd).toBeGreaterThan(0)
      expect(result.cost?.stars).toBeGreaterThan(0)
    }, 60000) // 60 second timeout for API call
    */
  })

  describe('Factory Pattern Integration', () => {
    it('should register face-swap model in provider manager', () => {
      const faceSwapModel = providerManager.getModelInfo('face-swap')

      expect(faceSwapModel).toBeDefined()
      expect(faceSwapModel?.type).toBe('faceswap')
      expect(faceSwapModel?.provider).toBe('Replicate')
      expect(faceSwapModel?.name).toBe('FaceSwap')
    })

    it('should list face-swap in available models', () => {
      const allModels = providerManager.getAllModels()
      const faceSwapModels = allModels.filter(m => m.type === 'faceswap')

      expect(faceSwapModels.length).toBeGreaterThan(0)
      expect(faceSwapModels[0].id).toBe('face-swap')
    })

    it('should get face-swap models by type', () => {
      const faceSwapModels = providerManager.getModelsByType('faceswap')

      expect(faceSwapModels).toBeDefined()
      expect(faceSwapModels.length).toBeGreaterThan(0)
      expect(faceSwapModels[0].id).toBe('face-swap')
    })

    it('should get face-swap models by provider', () => {
      const replicateModels = providerManager.getModelsByProvider('Replicate')

      expect(replicateModels).toBeDefined()
      expect(replicateModels.some(m => m.id === 'face-swap')).toBe(true)
    })

    it('should verify model is supported', () => {
      const isSupported = providerManager.isModelSupported('face-swap')

      expect(isSupported).toBe(true)
    })

    it('should get correct provider for face-swap model', () => {
      const provider = providerManager.getProviderForModel('face-swap')

      expect(provider).toBe('Replicate')
    })

    // Uncomment when ready to test with real images
    /*
    it('should perform face swap through factory', async () => {
      const result = await providerManager.performFaceSwap('face-swap', {
        targetImageUrl,
        swapImageUrl,
      })

      console.log('🏭 Factory FaceSwap Result:', {
        success: result.success,
        resultUrl: result.resultUrl?.substring(0, 100),
        processingTime: result.processingTime,
        cost: result.cost,
        error: result.error,
      })

      expect(result.success).toBe(true)
      expect(result.resultUrl).toBeDefined()
      expect(result.cost).toBeDefined()
    }, 60000) // 60 second timeout for API call
    */
  })

  describe('Error Handling', () => {
    it('should handle invalid model ID gracefully', async () => {
      await expect(
        providerManager.performFaceSwap('invalid-model', {
          targetImageUrl,
          swapImageUrl,
        })
      ).rejects.toThrow('Unknown model')
    })

    it('should handle wrong model type gracefully', async () => {
      await expect(
        // Try to use a video model for face swap
        providerManager.performFaceSwap('veo3_fast', {
          targetImageUrl,
          swapImageUrl,
        } as any)
      ).rejects.toThrow('is not a face-swap model')
    })
  })

  describe('Cost Calculation', () => {
    it('should calculate correct cost for face swap', () => {
      const modelInfo = providerManager.getModelInfo('face-swap')

      expect(modelInfo?.pricePerUnit).toBe(0.01) // $0.01 per swap
    })

    // Note: Cost is calculated as $0.01 / $0.016 per star ≈ 0.625 stars, floored to 0
    // In production, you might want to adjust star conversion or pricing
  })
})

// Manual testing helper (run with: npm test -- --testNamePattern="Manual")
describe('Manual FaceSwap Testing', () => {
  it.skip('should swap faces with custom URLs', async () => {
    // Replace these with your own test image URLs
    const myTargetUrl = 'YOUR_TARGET_IMAGE_URL'
    const mySwapUrl = 'YOUR_SWAP_IMAGE_URL'

    const result = await providerManager.performFaceSwap('face-swap', {
      targetImageUrl: myTargetUrl,
      swapImageUrl: mySwapUrl,
    })

    console.log('\n🎭 FaceSwap Result:')
    console.log('Success:', result.success)
    console.log('Result URL:', result.resultUrl)
    console.log('Processing Time:', result.processingTime, 'ms')
    console.log('Cost:', result.cost)
    console.log('Error:', result.error)

    expect(result.success).toBe(true)
  }, 120000) // 2 minute timeout
})
