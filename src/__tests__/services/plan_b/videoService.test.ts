import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test'
import { VideoService } from '@/services/plan_b/videoService'
import * as fsPromises from 'fs/promises'
import * as path from 'path'
import * as downloadHelper from '@/helpers/downloadFile'

// --- Mocks --- //

// Mock fs/promises
const mockMkdir = mock(() => Promise.resolve())
const mockWriteFile = mock(() => Promise.resolve())
mock.module('fs/promises', () => ({
  // Не можем мокнуть весь модуль, так как он встроенный?
  // Попробуем мокнуть конкретные функции, если module не сработает.
  // Пока оставим так, проверим.
  mkdir: mockMkdir,
  writeFile: mockWriteFile,
}))

// Mock path
// path.join будет сложнее замокать, т.к. он используется везде.
// Попробуем пока без мока path, ожидая реальный путь.
// Если будут проблемы с абсолютными путями, придется мокать.

// Mock downloadFile helper
const mockDownloadFile = mock(() =>
  Promise.resolve(Buffer.from('mock video data'))
)
mock.module('@/helpers/downloadFile', () => ({
  downloadFile: mockDownloadFile,
}))

// --- Tests --- //

describe('Plan B: VideoService', () => {
  let videoService: VideoService

  beforeEach(() => {
    videoService = new VideoService()
    // Reset mocks
    mockMkdir.mockClear()
    mockWriteFile.mockClear()
    mockDownloadFile
      .mockClear()
      .mockResolvedValue(Buffer.from('mock video data'))
  })

  afterEach(() => {
    mock.restore() // Восстанавливаем моки, если они были сделаны через mock.module
  })

  it('should process video, download, create directory, write file and return local path', async () => {
    // Arrange
    const videoUrl = 'http://example.com/video.mp4'
    const telegramId = 12345
    const fileName = 'test_video.mp4'
    // Ожидаем путь, который сформирует реальный path.join
    // Поднимаемся на 3 уровня из __dirname теста (src/__tests__/services/plan_b)
    // чтобы попасть в src, затем идем в services/uploads
    const expectedDir = path.join(
      __dirname,
      '../../../services/uploads',
      telegramId.toString(),
      'videos'
    )
    const expectedPath = path.join(expectedDir, fileName)

    // Act
    const resultPath = await videoService.processVideo(
      videoUrl,
      telegramId,
      fileName
    )

    // Assert
    // 1. Check downloadFile call
    expect(mockDownloadFile).toHaveBeenCalledWith(videoUrl)
    expect(mockDownloadFile).toHaveBeenCalledTimes(1)

    // 2. Check mkdir call
    expect(mockMkdir).toHaveBeenCalledWith(expectedDir, { recursive: true })
    expect(mockMkdir).toHaveBeenCalledTimes(1)

    // 3. Check writeFile call
    expect(mockWriteFile).toHaveBeenCalledWith(
      expectedPath,
      Buffer.from('mock video data')
    )
    expect(mockWriteFile).toHaveBeenCalledTimes(1)

    // 4. Check result path
    expect(resultPath).toBe(expectedPath)
  })

  // --- Add tests for error scenarios --- //
  // - downloadFile error
  // - mkdir error
  // - writeFile error
})
