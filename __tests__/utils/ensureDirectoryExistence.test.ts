import fs from 'fs'
import { ensureDirectoryExistence } from '../../src/helpers/ensureDirectoryExistence'

describe('ensureDirectoryExistence', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
  })

  it('should call fs.promises.mkdir with recursive true', async () => {
    const mkdirSpy = jest
      .spyOn(fs.promises, 'mkdir')
      .mockResolvedValue(undefined)
    const dir = '/tmp/test-dir'
    await expect(ensureDirectoryExistence(dir)).resolves.toBeUndefined()
    expect(mkdirSpy).toHaveBeenCalledWith(dir, { recursive: true })
  })

  it('should throw if fs.promises.mkdir rejects', async () => {
    jest.spyOn(fs.promises, 'mkdir').mockRejectedValue(new Error('fail'))
    await expect(ensureDirectoryExistence('/bad')).rejects.toThrow('fail')
  })
})
