import { deleteFile } from '@/helpers/deleteFile'
import fs from 'fs'

describe('deleteFile', () => {
  const filePath = '/path/to/file'
  let unlinkMock: jest.SpyInstance;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    unlinkMock = jest.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined as any)
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should call unlink and log success', async () => {
    await deleteFile(filePath)
    expect(unlinkMock).toHaveBeenCalledWith(filePath)
    expect(logSpy).toHaveBeenCalledWith('filePath', filePath)
    expect(logSpy).toHaveBeenCalledWith(`File ${filePath} deleted successfully`)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('should catch and log error when unlink throws', async () => {
    const testError = new Error('fail')
    unlinkMock.mockRejectedValue(testError)
    await deleteFile(filePath)
    expect(unlinkMock).toHaveBeenCalledWith(filePath)
    expect(errorSpy).toHaveBeenCalledWith(
      `Error deleting file ${filePath}:`,
      testError
    )
  })
})