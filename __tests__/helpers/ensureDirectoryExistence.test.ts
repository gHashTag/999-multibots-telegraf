import { ensureDirectoryExistence } from '@/helpers/ensureDirectoryExistence'
import fs from 'fs'

describe('ensureDirectoryExistence', () => {
  const dirPath = '/tmp/testdir'
  let mkdirMock: jest.SpyInstance
  let logSpy: jest.SpyInstance
  let errorSpy: jest.SpyInstance

  beforeEach(() => {
    mkdirMock = jest
      .spyOn(fs.promises, 'mkdir')
      .mockResolvedValue(undefined as any)
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should create directory and log messages', async () => {
    await ensureDirectoryExistence(dirPath)
    expect(mkdirMock).toHaveBeenCalledWith(dirPath, { recursive: true })
    expect(logSpy).toHaveBeenCalledWith(`Ensuring directory exists: ${dirPath}`)
    expect(logSpy).toHaveBeenCalledWith(`Directory created: ${dirPath}`)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('should log error and rethrow when mkdir fails', async () => {
    const testError = new Error('mkfail')
    mkdirMock.mockRejectedValue(testError)
    await expect(ensureDirectoryExistence(dirPath)).rejects.toBe(testError)
    expect(errorSpy).toHaveBeenCalledWith(
      `Error creating directory: ${testError}`
    )
  })
})
