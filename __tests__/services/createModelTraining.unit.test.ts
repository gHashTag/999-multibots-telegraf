// Mocks
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  createReadStream: jest.fn(),
  promises: { unlink: jest.fn() },
}))
jest.mock('axios')
jest.mock('@/config', () => ({
  isDev: true,
  SECRET_API_KEY: 'secret',
  ELESTIO_URL: 'https://prod.example.com',
  LOCAL_SERVER_URL: 'http://localhost',
}))
import fs from 'fs'
import axios from 'axios'
import FormData from 'form-data'
import { createModelTraining } from '@/services/createModelTraining'

describe('createModelTraining', () => {
  const dummyPath = '/tmp/file.zip'
  const reqData = {
    filePath: dummyPath,
    triggerWord: 'word',
    modelName: 'mname',
    telegram_id: '123',
    is_ru: false,
    steps: 5,
    botName: 'botA',
  }
  const ctx: any = { session: { mode: 'digital_avatar_body' } }
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('throws if file does not exist', async () => {
    ;(fs.existsSync as jest.Mock).mockReturnValue(false)
    await expect(createModelTraining(reqData, ctx)).rejects.toThrow(
      'Файл не найден: ' + dummyPath
    )
  })

  it('posts to correct URL, unlinks file, and returns response data', async () => {
    ;(fs.existsSync as jest.Mock).mockReturnValue(true)
    const postMock = jest.fn().mockResolvedValue({ data: { message: 'ok' } })
    ;(axios.post as jest.Mock) = postMock
    const unlinkMock = (fs.promises.unlink as jest.Mock).mockResolvedValue(
      undefined
    )
    // Mock FormData headers
    const formDataInstance = new FormData()
    const getHeaders = formDataInstance.getHeaders()
    jest.spyOn(FormData.prototype, 'getHeaders').mockReturnValue(getHeaders)
    // Perform
    const result = await createModelTraining(reqData, ctx)
    expect(postMock).toHaveBeenCalled()
    expect(unlinkMock).toHaveBeenCalledWith(dummyPath)
    expect(result).toEqual({ message: 'ok' })
  })

  it('uses v2 URL when mode is not digital_avatar_body', async () => {
    ;(fs.existsSync as jest.Mock).mockReturnValue(true)
    const postMock = jest.fn().mockResolvedValue({ data: { message: 'done' } })
    ;(axios.post as jest.Mock) = postMock(
      fs.promises.unlink as jest.Mock
    ).mockResolvedValue(undefined)
    const ctx2: any = { session: { mode: 'other' } }
    await createModelTraining(reqData, ctx2)
    // Check URL includes create-model-training-v2
    const calledUrl = postMock.mock.calls[0][0]
    expect(calledUrl).toContain('create-model-training-v2')
  })

  it('propagates unexpected errors', async () => {
    ;(fs.existsSync as jest.Mock).mockReturnValue(true)
    const err = new Error('xyz')(axios.post as jest.Mock).mockRejectedValue(err)
    await expect(createModelTraining(reqData, ctx)).rejects.toBe(err)
  })
})
