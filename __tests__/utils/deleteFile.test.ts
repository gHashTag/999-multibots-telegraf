import fs from 'fs'
import { deleteFile } from '../../src/helpers/deleteFile'

describe('deleteFile', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
  })

  it('should call fs.promises.unlink with given path', async () => {
    const unlinkSpy = jest.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined)
    const file = '/tmp/file.txt'
    await expect(deleteFile(file)).resolves.toBeUndefined()
    expect(unlinkSpy).toHaveBeenCalledWith(file)
  })

  it('should not throw when unlink rejects', async () => {
    const error = new Error('cannot delete')
    jest.spyOn(fs.promises, 'unlink').mockRejectedValue(error)
    await expect(deleteFile('/tmp/file2')).resolves.toBeUndefined()
  })
})