import fs from 'fs'
import FormData from 'form-data'

// Mock dependencies
jest.mock('axios')
import axios from 'axios'
const mockedAxios = axios as jest.Mocked<typeof axios>

// Mock config
jest.mock('@/config', () => ({
  isDev: true,
  SECRET_API_KEY: 'secret-key',
  ELESTIO_URL: 'https://ele.stio',
  LOCAL_SERVER_URL: 'http://localhost',
}))

// Prepare a dummy context interface
interface DummyCtx {
  session: { mode: string }
}

describe('createModelTraining', () => {
  let createModelTraining: any
  const dummyFile = '/tmp/model.zip'
  let ctx: DummyCtx

  beforeEach(() => {
    jest.resetModules()
    // Mock fs.existsSync
    jest.spyOn(fs, 'existsSync').mockReturnValue(true)
    // Mock fs.createReadStream
    jest.spyOn(fs, 'createReadStream').mockReturnValue('<stream>' as any)
    // Mock fs.promises.unlink
    jest.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined)
    // Mock axios.post
    mockedAxios.post.mockResolvedValue({
      data: { message: 'ok', model_id: 'm1', bot_name: 'b1' },
    } as any)(
      // Import module under test
      ({ createModelTraining } = require('@/services/createModelTraining'))
    )
    ctx = { session: { mode: 'digital_avatar_body' } }
  })

  it('throws error if file does not exist', async () => {
    ;(fs.existsSync as jest.Mock).mockReturnValue(false)
    await expect(
      createModelTraining(
        {
          filePath: dummyFile,
          triggerWord: 't',
          modelName: 'n',
          telegram_id: 'u',
          is_ru: false,
          steps: 1,
          botName: 'b',
        },
        ctx
      )
    ).rejects.toThrow('Файл не найден: ' + dummyFile)
  })

  it('posts form data to create-model-training endpoint and unlinks file', async () => {
    ctx.session.mode = 'digital_avatar_body'
    const request = {
      filePath: dummyFile,
      triggerWord: 't',
      modelName: 'n',
      telegram_id: 'u',
      is_ru: false,
      steps: 2,
      botName: 'b',
    }
    const res = await createModelTraining(request, ctx)
    // URL should use LOCAL_SERVER_URL in dev
    expect(mockedAxios.post).toHaveBeenCalled()
    const [url, formData, opts] = mockedAxios.post.mock.calls[0]
    expect(url).toBe('http://localhost/generate/create-model-training')
    // Check headers include x-secret-key
    expect(opts.headers).toMatchObject({ 'x-secret-key': 'secret-key' })
    // Response returned
    expect(res).toEqual({ message: 'ok', model_id: 'm1', bot_name: 'b1' })
    // File unlinked
    expect(fs.promises.unlink).toHaveBeenCalledWith(dummyFile)
  })

  it('uses create-model-training-v2 for other mode', async () => {
    ctx.session.mode = 'other_mode'
    await createModelTraining(
      {
        filePath: dummyFile,
        triggerWord: 't',
        modelName: 'n',
        telegram_id: 'u',
        is_ru: true,
        steps: 3,
        botName: 'b',
      },
      ctx
    )
    expect(mockedAxios.post.mock.calls[0][0]).toBe(
      'http://localhost/generate/create-model-training-v2'
    )
  })

  it('propagates axios errors and does not unlink file', async () => {
    mockedAxios.post.mockRejectedValue(new Error('net fail'))
    await expect(
      createModelTraining(
        {
          filePath: dummyFile,
          triggerWord: 't',
          modelName: 'n',
          telegram_id: 'u',
          is_ru: true,
          steps: 1,
          botName: 'b',
        },
        ctx
      )
    ).rejects.toThrow('net fail')
    expect(fs.promises.unlink).not.toHaveBeenCalled()
  })

  it('uses ELESTIO_URL when in production mode', async () => {
    // Reset modules to apply new config and mocks
    jest.resetModules()
    // Mock config for production
    jest.doMock('@/config', () => ({
      isDev: false,
      SECRET_API_KEY: 'secret-key',
      ELESTIO_URL: 'https://ele.stio',
      LOCAL_SERVER_URL: 'http://localhost',
    }))
    // Mock dependencies: fs and axios
    jest.doMock('fs', () => ({
      existsSync: () => true,
      createReadStream: () => '<stream>',
      promises: { unlink: () => Promise.resolve() },
    }))
    jest.doMock('axios', () => ({
      post: jest.fn().mockResolvedValue({ data: { m: 'ok' } }),
    }))
    // Import under test and mocks
    const axiosMock = require('axios') as any
    const fsMock = require('fs')
    const { createModelTraining } = require('@/services/createModelTraining')
    const ctxProd = { session: { mode: 'digital_avatar_body' } }
    const req = {
      filePath: dummyFile,
      triggerWord: 't',
      modelName: 'n',
      telegram_id: 'u',
      is_ru: true,
      steps: 1,
      botName: 'b',
    }
    // Call
    await expect(createModelTraining(req, ctxProd)).resolves.toEqual({
      m: 'ok',
    })
    // Assert URL called correctly
    expect(axiosMock.post).toHaveBeenCalledWith(
      'https://ele.stio/generate/create-model-training',
      expect.any(FormData),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-secret-key': 'secret-key' }),
      })
    )
  })
})
