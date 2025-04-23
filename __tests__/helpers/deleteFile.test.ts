import * as fs from 'fs'
import { deleteFile } from '@/helpers/deleteFile'
import { logger } from '@/utils/logger'

// Мокаем зависимости
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  promises: {
    unlink: jest.fn(),
  },
}))
jest.mock('@/utils/logger')

// Типизируем моки
const mockedFs = fs as jest.Mocked<typeof fs> & {
  promises: {
    unlink: jest.MockedFunction<typeof fs.promises.unlink>
  }
}
const mockedLogger = logger as jest.Mocked<typeof logger>

describe('deleteFile', () => {
  const filePath = '/path/to/file.txt'

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('deletes a file if it exists', async () => {
    mockedFs.existsSync.mockReturnValue(true)
    mockedFs.promises.unlink.mockResolvedValue(undefined)

    await expect(deleteFile(filePath)).resolves.toBeUndefined()

    expect(mockedFs.existsSync).toHaveBeenCalledWith(filePath)
    expect(mockedFs.promises.unlink).toHaveBeenCalledWith(filePath)
    expect(mockedLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Successfully deleted file'),
      expect.objectContaining({ filePath })
    )
  })

  it('does nothing if file does not exist', async () => {
    mockedFs.existsSync.mockReturnValue(false)

    await expect(deleteFile(filePath)).resolves.toBeUndefined()

    expect(mockedFs.existsSync).toHaveBeenCalledWith(filePath)
    expect(mockedFs.promises.unlink).not.toHaveBeenCalled()
    expect(mockedLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('File does not exist'),
      expect.objectContaining({ filePath })
    )
  })

  it('catches and logs error when unlink fails', async () => {
    const unlinkError = new Error('unlink error')
    mockedFs.existsSync.mockReturnValue(true)
    mockedFs.promises.unlink.mockRejectedValue(unlinkError)

    await expect(deleteFile(filePath)).resolves.toBeUndefined()

    expect(mockedFs.existsSync).toHaveBeenCalledWith(filePath)
    expect(mockedFs.promises.unlink).toHaveBeenCalledWith(filePath)
    expect(mockedLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error deleting file'),
      expect.objectContaining({
        filePath,
        error: unlinkError,
      })
    )
  })
})
