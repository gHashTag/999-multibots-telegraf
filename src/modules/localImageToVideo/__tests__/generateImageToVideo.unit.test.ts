import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest' // Removed MockedFunction, mock
// import path from 'path'; // No longer needed
// import * as cp from 'child_process'; // No longer needed for ffmpeg test
import { replicate } from '@/core/replicate' // Import actual client
import * as downloadFileModule from '../downloadFile' // Import module for spyOn
import { generateImageToVideo } from '../generateImageToVideo'
import {
  ImageToVideoRequest,
  ImageToVideoDependencies,
  ImageToVideoResponse, // Needed for result type
  MinimalLogger, // Needed for mock type
} from '../types'
import { VIDEO_MODELS_CONFIG } from '../VIDEO_MODELS_CONFIG'

// No vi.mock needed, using spyOn instead

describe('generateImageToVideo (Replicate API)', () => {
  // Minimal mock dependencies
  const mockDependencies: Partial<ImageToVideoDependencies> = {
    logger: { info: vi.fn(), error: vi.fn() },
  }

  // Test data
  // Removed duplicate declaration of mockDependencies

  const validImageModel = 'minimax' // Example model supporting image input
  const validTextModel = 'hunyuan-video-fast' // Example model supporting text input only

  const mockRequest: ImageToVideoRequest = {
    imageUrl: 'https://example.com/image.jpg',
    prompt: 'Test prompt for video',
    videoModel: validImageModel, // Use a valid model key
    metadata: {
      userId: '12345',
      username: 'testuser',
      botId: 'testbot',
    },
    locale: {
      language: 'ru',
    },
  }

  const dummyImageData = Buffer.from('dummy-image-data')
  const dummyBase64ImageData = dummyImageData.toString('base64')
  const expectedDataUri = `data:image/jpeg;base64,${dummyBase64ImageData}` // Assuming jpeg

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock successful resolutions using spyOn
    vi.spyOn(downloadFileModule, 'downloadFile').mockResolvedValue(
      dummyImageData
    )
    vi.spyOn(replicate, 'run').mockResolvedValue([
      'http://replicate.example.com/video.mp4',
    ])
  })

  afterEach(() => {
    vi.restoreAllMocks() // Restore original implementations
  })

  it('should successfully generate a video via Replicate', async () => {
    const result = await generateImageToVideo(
      mockRequest,
      mockDependencies as ImageToVideoDependencies
    )

    expect(downloadFileModule.downloadFile).toHaveBeenCalledWith(
      mockRequest.imageUrl
    )
    expect(replicate.run).toHaveBeenCalledOnce()

    const [modelId, options] = (replicate.run as Mock).mock.calls[0] // Cast to Mock to access calls
    const expectedModelConfig = VIDEO_MODELS_CONFIG[validImageModel]
    const expectedImageKey = expectedModelConfig.imageKey || 'image'
    expect(modelId).toBe(expectedModelConfig.api.model) // Corrected variable name
    expect(options.input).toBeDefined()
    expect(options.input.prompt).toBe(mockRequest.prompt)
    expect(options.input[expectedImageKey]).toBe(expectedDataUri) // Check for Data URI

    expect(result).toEqual({
      success: true,
      videoUrl: 'http://replicate.example.com/video.mp4',
      message: 'Video generated successfully via Replicate.',
    })
  })

  it('should handle string output from Replicate', async () => {
    vi.spyOn(replicate, 'run').mockResolvedValue([
      'http://replicate.example.com/string-video.mp4',
    ]) // Wrap in array
    const result = await generateImageToVideo(
      mockRequest,
      mockDependencies as ImageToVideoDependencies
    )
    expect(result.success).toBe(true)
    expect(result.videoUrl).toBe(
      'http://replicate.example.com/string-video.mp4'
    )
  })

  it('should throw error if image URL is missing', async () => {
    const requestWithNoImage = { ...mockRequest, imageUrl: '' }
    await expect(
      generateImageToVideo(
        requestWithNoImage,
        mockDependencies as ImageToVideoDependencies
      )
    ).rejects.toThrow('Image URL is required')
    expect(downloadFileModule.downloadFile).not.toHaveBeenCalled() // Check spy
    expect(replicate.run).not.toHaveBeenCalled() // Check spy
  })

  it('should throw error if video model ID is missing', async () => {
    const requestWithNoModel = { ...mockRequest, videoModel: '' }
    await expect(
      generateImageToVideo(
        requestWithNoModel,
        mockDependencies as ImageToVideoDependencies
      )
    ).rejects.toThrow('Video model ID is required')
    expect(downloadFileModule.downloadFile).not.toHaveBeenCalled() // Check spy
    expect(replicate.run).not.toHaveBeenCalled() // Check spy
  })

  it('should throw error for unsupported video model ID', async () => {
    const requestInvalidModel = { ...mockRequest, videoModel: 'invalid-model' }
    await expect(
      generateImageToVideo(
        requestInvalidModel,
        mockDependencies as ImageToVideoDependencies
      )
    ).rejects.toThrow(/Unsupported video model ID/)
    expect(downloadFileModule.downloadFile).not.toHaveBeenCalled() // Check spy
    expect(replicate.run).not.toHaveBeenCalled() // Check spy
  })

  it('should throw error if model does not support image input', async () => {
    const requestTextOnlyModel = { ...mockRequest, videoModel: validTextModel }
    await expect(
      generateImageToVideo(
        requestTextOnlyModel,
        mockDependencies as ImageToVideoDependencies
      )
    ).rejects.toThrow(/does not support image input/)
    expect(downloadFileModule.downloadFile).not.toHaveBeenCalled() // Check spy
    expect(replicate.run).not.toHaveBeenCalled() // Check spy
  })

  it('should handle download errors', async () => {
    const downloadError = new Error('Download failed')
    vi.spyOn(downloadFileModule, 'downloadFile').mockRejectedValue(
      downloadError
    ) // Use spyOn

    await expect(
      generateImageToVideo(
        mockRequest,
        mockDependencies as ImageToVideoDependencies
      )
    ).rejects.toThrow('Failed to download source image')
    expect(replicate.run).not.toHaveBeenCalled() // Check spy
  })

  it('should handle Replicate run errors', async () => {
    const replicateError = new Error('Replicate API failed')
    vi.spyOn(replicate, 'run').mockRejectedValue(replicateError) // Use spyOn

    await expect(
      generateImageToVideo(
        mockRequest,
        mockDependencies as ImageToVideoDependencies
      )
    ).rejects.toThrow(/Details: Replicate API failed/)
    expect(downloadFileModule.downloadFile).toHaveBeenCalled() // Check spy
  })

  it('should handle empty array output from Replicate', async () => {
    vi.spyOn(replicate, 'run').mockResolvedValue([]) // Use spyOn
    await expect(
      generateImageToVideo(
        mockRequest,
        mockDependencies as ImageToVideoDependencies
      )
    ).rejects.toThrow('Unexpected output format from video generation API')
  })

  it('should handle non-string or non-array output from Replicate', async () => {
    vi.spyOn(replicate, 'run').mockResolvedValue({ result: 'wrong format' }) // Use spyOn
    await expect(
      generateImageToVideo(
        mockRequest,
        mockDependencies as ImageToVideoDependencies
      )
    ).rejects.toThrow('Unexpected output format from video generation API')
  })

  it('should handle invalid URL string output from Replicate', async () => {
    vi.spyOn(replicate, 'run').mockResolvedValue(['not a url']) // Wrap in array
    await expect(
      generateImageToVideo(
        mockRequest,
        mockDependencies as ImageToVideoDependencies
      )
    ).rejects.toThrow('Invalid video URL received from API')
  })

  it('should handle invalid URL in array output from Replicate', async () => {
    vi.spyOn(replicate, 'run').mockResolvedValue(['ftp://invalid']) // Use spyOn
    await expect(
      generateImageToVideo(
        mockRequest,
        mockDependencies as ImageToVideoDependencies
      )
    ).rejects.toThrow('Invalid video URL received from API')
  })
})
