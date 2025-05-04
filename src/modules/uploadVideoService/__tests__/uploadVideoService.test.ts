import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  uploadVideoService,
  UploadVideoServiceDependencies,
  UploadVideoServiceRequest,
} from '../index'

// --- Mock Dependencies ---
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}

const mockVideoService = {
  processVideo: vi.fn(),
}

// --- Tests --- //
describe('Module: uploadVideoService', () => {
  let dependencies: UploadVideoServiceDependencies
  let request: UploadVideoServiceRequest

  beforeEach(() => {
    // Reset mocks
    vi.resetAllMocks()

    // Setup default success mocks
    mockVideoService.processVideo.mockResolvedValue(
      '/mock/local/path/video.mp4'
    )

    dependencies = {
      logger: mockLogger,
      videoService: mockVideoService,
    }

    request = {
      videoUrl: 'https://example.com/video.mp4',
      telegram_id: 12345,
      fileName: 'test_upload.mp4',
    }
  })

  it('should call videoService.processVideo and return local path on success', async () => {
    const result = await uploadVideoService(request, dependencies)

    expect(result).toEqual({ localPath: '/mock/local/path/video.mp4' })
    expect(mockVideoService.processVideo).toHaveBeenCalledWith(
      request.videoUrl,
      request.telegram_id,
      request.fileName
    )
    expect(mockLogger.info).toHaveBeenCalledTimes(2) // Start and success logs
    expect(mockLogger.error).not.toHaveBeenCalled()
  })

  it('should throw error and log if videoService.processVideo fails', async () => {
    const processError = new Error('Failed to process video')
    mockVideoService.processVideo.mockRejectedValueOnce(processError)

    await expect(uploadVideoService(request, dependencies)).rejects.toThrow(
      `Failed to process video locally via module: ${processError.message}`
    )

    expect(mockVideoService.processVideo).toHaveBeenCalledWith(
      request.videoUrl,
      request.telegram_id,
      request.fileName
    )
    expect(mockLogger.error).toHaveBeenCalledWith(
      '❌ Ошибка при локальной загрузке видео (через модуль):',
      expect.objectContaining({
        error: processError.message,
        requestData: request,
      })
    )
    expect(mockLogger.info).toHaveBeenCalledTimes(1) // Only the start log
  })

  it('should handle string telegram_id correctly', async () => {
    request.telegram_id = 'user-string-id'
    mockVideoService.processVideo.mockResolvedValueOnce('/another/path.mp4')

    const result = await uploadVideoService(request, dependencies)

    expect(result).toEqual({ localPath: '/another/path.mp4' })
    expect(mockVideoService.processVideo).toHaveBeenCalledWith(
      request.videoUrl,
      'user-string-id', // Ensure string ID is passed
      request.fileName
    )
  })
})
