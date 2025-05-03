import { describe, it, expect, vi, beforeEach } from 'vitest'
import { VideoService, VideoServiceDependencies } from '../index'

// --- Mock Dependencies ---
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}

const mockDownloadFile = vi.fn()

const mockFs = {
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}

const mockPath = {
  join: vi.fn((...args) => args.filter(Boolean).join('/')), // Basic mock for join
  dirname: vi.fn(p => p.substring(0, p.lastIndexOf('/')) || '.'), // Basic mock for dirname
}

const mockUploadsDir = '/mock/uploads'

// --- Tests --- //
describe('Module: VideoService', () => {
  let dependencies: VideoServiceDependencies
  let videoService: VideoService

  beforeEach(() => {
    // Reset mocks before each test
    vi.resetAllMocks()

    // Setup default mock implementations
    mockDownloadFile.mockResolvedValue(Buffer.from('mock video data'))
    mockFs.mkdir.mockResolvedValue(undefined)
    mockFs.writeFile.mockResolvedValue(undefined)

    dependencies = {
      logger: mockLogger,
      downloadFile: mockDownloadFile,
      fs: mockFs as any, // Cast to any to satisfy complex fs types for mock
      path: mockPath,
      uploadsDir: mockUploadsDir,
    }

    videoService = new VideoService(dependencies)
  })

  it('should create an instance successfully', () => {
    expect(videoService).toBeInstanceOf(VideoService)
  })

  it('should process video successfully (happy path)', async () => {
    const videoUrl = 'https://example.com/video.mp4'
    const telegramId = 12345
    const fileName = 'test_video.mp4'
    const expectedLocalPath = '/mock/uploads/12345/videos/test_video.mp4'
    const expectedDirPath = '/mock/uploads/12345/videos'
    const mockBuffer = Buffer.from('mock video data')

    // Configure path.join mock specifically for this test if needed (already has basic mock)
    mockPath.join.mockReturnValueOnce(expectedLocalPath)
    mockPath.dirname.mockReturnValueOnce(expectedDirPath)

    const result = await videoService.processVideo(
      videoUrl,
      telegramId,
      fileName
    )

    expect(result).toBe(expectedLocalPath)
    expect(mockPath.join).toHaveBeenCalledWith(
      mockUploadsDir,
      String(telegramId),
      'videos',
      fileName
    )
    expect(mockPath.dirname).toHaveBeenCalledWith(expectedLocalPath)
    expect(mockFs.mkdir).toHaveBeenCalledWith(expectedDirPath, {
      recursive: true,
    })
    expect(mockDownloadFile).toHaveBeenCalledWith(videoUrl)
    expect(mockFs.writeFile).toHaveBeenCalledWith(expectedLocalPath, mockBuffer)
    expect(mockLogger.info).toHaveBeenCalledTimes(5) // Start, path, mkdir, download, write
    expect(mockLogger.error).not.toHaveBeenCalled()
  })

  it('should throw error and log if downloadFile fails', async () => {
    const videoUrl = 'https://example.com/fail_download.mp4'
    const telegramId = 54321
    const fileName = 'fail_dl.mp4'
    const downloadError = new Error('Download failed')
    const expectedLocalPath = '/mock/uploads/54321/videos/fail_dl.mp4'
    const expectedDirPath = '/mock/uploads/54321/videos'

    mockDownloadFile.mockRejectedValueOnce(downloadError)
    mockPath.join.mockReturnValueOnce(expectedLocalPath)
    mockPath.dirname.mockReturnValueOnce(expectedDirPath)

    await expect(
      videoService.processVideo(videoUrl, telegramId, fileName)
    ).rejects.toThrow('Download failed')

    expect(mockFs.mkdir).toHaveBeenCalledWith(expectedDirPath, {
      recursive: true,
    }) // mkdir still called
    expect(mockDownloadFile).toHaveBeenCalledWith(videoUrl)
    expect(mockFs.writeFile).not.toHaveBeenCalled() // writeFile not called
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Ошибка при обработке видео:',
      expect.objectContaining({
        videoUrl,
        telegramId,
        fileName,
        error: 'Download failed',
      })
    )
  })

  it('should throw error and log if fs.mkdir fails', async () => {
    const videoUrl = 'https://example.com/fail_mkdir.mp4'
    const telegramId = 67890
    const fileName = 'fail_mkdir.mp4'
    const mkdirError = new Error('Cannot create directory')
    const expectedLocalPath = '/mock/uploads/67890/videos/fail_mkdir.mp4'
    const expectedDirPath = '/mock/uploads/67890/videos'

    mockFs.mkdir.mockRejectedValueOnce(mkdirError)
    mockPath.join.mockReturnValueOnce(expectedLocalPath)
    mockPath.dirname.mockReturnValueOnce(expectedDirPath)

    await expect(
      videoService.processVideo(videoUrl, telegramId, fileName)
    ).rejects.toThrow('Cannot create directory')

    expect(mockFs.mkdir).toHaveBeenCalledWith(expectedDirPath, {
      recursive: true,
    })
    expect(mockDownloadFile).not.toHaveBeenCalled()
    expect(mockFs.writeFile).not.toHaveBeenCalled()
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Ошибка при обработке видео:',
      expect.objectContaining({
        error: 'Cannot create directory',
      })
    )
  })

  it('should throw error and log if fs.writeFile fails', async () => {
    const videoUrl = 'https://example.com/fail_write.mp4'
    const telegramId = 11111
    const fileName = 'fail_write.mp4'
    const writeError = new Error('Cannot write file')
    const expectedLocalPath = '/mock/uploads/11111/videos/fail_write.mp4'
    const expectedDirPath = '/mock/uploads/11111/videos'
    const mockBuffer = Buffer.from('mock video data')

    mockFs.writeFile.mockRejectedValueOnce(writeError)
    mockPath.join.mockReturnValueOnce(expectedLocalPath)
    mockPath.dirname.mockReturnValueOnce(expectedDirPath)
    // download should still succeed
    mockDownloadFile.mockResolvedValueOnce(mockBuffer)

    await expect(
      videoService.processVideo(videoUrl, telegramId, fileName)
    ).rejects.toThrow('Cannot write file')

    expect(mockFs.mkdir).toHaveBeenCalledWith(expectedDirPath, {
      recursive: true,
    })
    expect(mockDownloadFile).toHaveBeenCalledWith(videoUrl)
    expect(mockFs.writeFile).toHaveBeenCalledWith(expectedLocalPath, mockBuffer)
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Ошибка при обработке видео:',
      expect.objectContaining({
        error: 'Cannot write file',
      })
    )
  })
})
